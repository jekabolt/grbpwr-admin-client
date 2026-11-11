// Sparrow solution → our placements, plus our own verdict on it. Pure, like instance.ts.
//
// THE FINAL WORD IS OURS. Every layout sparrow reports (progress ones included) is moved onto the
// TRUE contours and checked with geom/clearance.ts — gap between pieces, margin at both selvedges
// and at the start. A layout that fails never leaves the engine: the caller keeps the previous
// layout that passed.
import type { NestConfig, PieceDTO, Placement, RotationDeg, UnplacedPiece } from '../types';
import { checkLayout, rotatedBounds } from '../geom/clearance';
import type { SparrowJob } from './instance';

export type SppPlacedItem = {
  item_id: number;
  transformation: { rotation: number; translation: [number, number]; reflected?: boolean };
};

export type SppSolution = {
  strip_width: number;
  layout: { placed_items: SppPlacedItem[] };
  density?: number;
};

export type SparrowReport = {
  kind: 'ExplFeas' | 'CmprFeas' | 'Final' | string;
  elapsed_sec: number;
  strip_width: number;
  solution: SppSolution;
};

// Our validation tolerance, cm. checkLayout's own default is the old placer's quantum (1 µm);
// sparrow works in floats, and its separation already carries SEPARATION_SAFETY_CM (20 µm) on
// top of the gap, so a layout that sparrow itself considers feasible clears 1 µm with margin.
const TOL_CM = 1e-4;

function snapRotation(deg: number): RotationDeg | null {
  const whole = Math.round(deg);
  if (Math.abs(deg - whole) > 1e-3) return null;
  const r = ((whole % 360) + 360) % 360;
  return r === 0 || r === 90 || r === 180 || r === 270 ? r : null;
}

export type Converted =
  | { ok: true; placements: Placement[]; usedLengthCm: number; overflow: UnplacedPiece[] }
  | { ok: false; why: string };

// Moves a sparrow solution onto our strip frame and checks it. `maxLengthCm` (the cutting table)
// is not something sparrow knows: it packs an unbounded strip, and the instances whose right edge
// lands past the table are returned as 'table-full' instead of placed. The cut is after the fact,
// so the caller (index.ts) checks every report and keeps the one with the fewest pieces left off,
// then the shortest — like the old engine did.
export function convertSolution(
  sol: SppSolution,
  job: SparrowJob,
  pieces: readonly PieceDTO[],
  config: NestConfig,
): Converted {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const next = job.items.map(() => 0);
  const raw: Array<{ pl: Placement; minX: number; maxX: number }> = [];
  for (const pi of sol.layout.placed_items) {
    const ref = job.items[pi.item_id];
    if (!ref) return { ok: false, why: `unknown item ${pi.item_id}` };
    const t = pi.transformation;
    if (t.reflected) return { ok: false, why: 'sparrow reflected an item' };
    const rot = snapRotation(t.rotation);
    if (rot === null || !job.instance.items[pi.item_id].orientation.rotation.angles.includes(rot)) {
      return { ok: false, why: `rotation ${t.rotation}° is not one we allow` };
    }
    const k = next[pi.item_id]++;
    const instance = ref.instances[k];
    if (instance === undefined)
      return { ok: false, why: `item ${pi.item_id} placed too many times` };
    const dto = byId.get(ref.pieceId);
    if (!dto) return { ok: false, why: `piece ${ref.pieceId} is missing` };
    const pl: Placement = {
      pieceId: ref.pieceId,
      instance,
      rot,
      ...(ref.flipped ? { flipped: true } : {}),
      x: t.translation[0],
      y: t.translation[1] + job.shiftY,
    };
    const b = rotatedBounds(dto, rot, pl.flipped);
    raw.push({ pl, minX: pl.x + b.minX, maxX: pl.x + b.maxX });
  }
  const missing = job.items.reduce((s, ref, i) => s + (ref.instances.length - next[i]), 0);
  if (missing > 0) return { ok: false, why: `${missing} instances not placed` };
  if (raw.length === 0) return { ok: true, placements: [], usedLengthCm: 0, overflow: [] };

  const margin = config.edgeMarginCm;
  const dx = margin - Math.min(...raw.map((r) => r.minX));
  const cap = config.maxLengthCm;
  const capped = cap !== undefined && Number.isFinite(cap) && cap > 0;
  const placements: Placement[] = [];
  const overflow: UnplacedPiece[] = [];
  let maxX = 0;
  for (const r of raw) {
    const right = r.maxX + dx;
    if (capped && right > (cap as number) - margin + 1e-6) {
      overflow.push({ pieceId: r.pl.pieceId, instance: r.pl.instance, reason: 'table-full' });
      continue;
    }
    placements.push({ ...r.pl, x: r.pl.x + dx });
    maxX = Math.max(maxX, right);
  }

  const violations = checkLayout({
    pieces,
    placements,
    widthCm: config.fabricWidthCm,
    gapCm: config.gapCm,
    marginCm: margin,
    edgeTolCm: TOL_CM,
    pairTolCm: TOL_CM,
  });
  if (violations.length > 0) {
    const v = violations[0];
    return {
      ok: false,
      why: `${violations.length} violations, e.g. clearance ${v.clearance.toFixed(4)} of ${v.required} cm`,
    };
  }
  // Same accounting as the manual editor (measureLayout): right-most contour point + the margin
  // the layout keeps on the left.
  return { ok: true, placements, usedLengthCm: placements.length ? maxX + margin : 0, overflow };
}
