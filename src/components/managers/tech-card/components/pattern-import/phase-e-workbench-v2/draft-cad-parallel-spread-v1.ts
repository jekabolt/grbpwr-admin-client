import { bboxOf, signedArea } from 'lib/pattern-import/semantics/geom';
import { transformSizeSpec } from 'lib/pattern-import/semantics/pairs';
import type { PieceSizeSpec, PtMm, WriteJob } from 'lib/pattern-import/types';
import { partitionDraftCutSizeV1 } from './draft-cad-cut-geometry-executor-v1';
import {
  validParallelDisplacementV1,
  parallelOpeningAxisV1,
  type PatternImportDxfPhaseEDraftCadCommandV1 as Command,
} from './draft-cad-session-v1';

type Cut = Extract<Command, { tool: 'cut' }>;
type Spread = Extract<Command, { tool: 'spread' }>;
// The cut owner returns two subsequences in source order. Keep the ordinal of each native
// hole/mark when rejoining them, including when fixed and translated marks are interleaved.
function inSourceOrder<T>(
  source: readonly T[],
  fixed: readonly T[],
  before: readonly T[],
  moved: readonly T[],
): T[] {
  let f = 0,
    m = 0;
  const values = source.map((value) => {
    const atFixed = f < fixed.length && JSON.stringify(value) === JSON.stringify(fixed[f]);
    const atMoving = m < before.length && JSON.stringify(value) === JSON.stringify(before[m]);
    if (atFixed === atMoving) throw Error('The registered cut has an ambiguous mark or hole.');
    return atFixed ? fixed[f++]! : moved[m++]!;
  });
  if (f !== fixed.length || m !== before.length || moved.length !== m)
    throw Error('The registered cut lost a mark or hole.');
  return values;
}

function openSize(size: PieceSizeSpec, from: PtMm, to: PtMm, axis: 'x' | 'y', offset: number) {
  // The saved writer can extend the directed grain beyond the outline. The whole segment
  // belongs to one half-plane as long as both ends have the same strictly nonzero sign.
  const coordinate = from[axis],
    sign = Math.sign(offset);
  const grain = size.grain;
  if (grain && (grain.a[axis] - coordinate) * (grain.b[axis] - coordinate) <= 0)
    throw Error('The registered cut crosses or touches the directed grain.');
  const partition = partitionDraftCutSizeV1({ ...size, grain: null }, from, to);
  if (!partition.ok) throw Error(partition.detail);
  const side = (ring: readonly PtMm[], direction: number) =>
    ring.every((p) => (p[axis] - coordinate) * direction >= 0) &&
    ring.some((p) => (p[axis] - coordinate) * direction > 0);
  const moving = partition.sizes.filter((p) => side(p.cut, sign)),
    fixed = partition.sizes.filter((p) => side(p.cut, -sign));
  if (moving.length !== 1 || fixed.length !== 1)
    throw Error('The cut must separate the entire size into opposite half-planes.');
  const stationary = fixed[0]!,
    before = moving[0]!;
  const first = stationary.cut[0]!,
    last = stationary.cut.at(-1)!;
  const equal = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;
  if (
    first[axis] !== coordinate ||
    last[axis] !== coordinate ||
    !equal(first, before.cut.at(-1)!) ||
    !equal(last, before.cut[0]!)
  )
    throw Error('The two halves must share the same complete directed chord.');
  const shift = (p: PtMm) => ({ ...p, [axis]: p[axis] + offset });
  const moved = transformSizeSpec(before, {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: axis === 'x' ? offset : 0,
    f: axis === 'y' ? offset : 0,
  });
  // Each half is the original perimeter arc, closed virtually by the chord at its ends.
  // Joining both open arcs adds the two parallel connectors and the intervening material.
  const perimeter = [...stationary.cut, ...before.cut.map(shift)];
  const ends = new Set([0, stationary.cut.length - 1, stationary.cut.length, perimeter.length - 1]);
  const cut = perimeter.filter((p, i) => {
    if (!ends.has(i)) return true;
    // Discard only inserted construction points when both neighbouring segments
    // form exactly the same directed line; retain authored source corners.
    const original = i < stationary.cut.length ? p : before.cut[i - stationary.cut.length]!;
    if (size.cut.some((v) => equal(v, original))) return true;
    const a = perimeter[(i + perimeter.length - 1) % perimeter.length]!,
      b = perimeter[(i + 1) % perimeter.length]!;
    const dx = p.x - a.x,
      dy = p.y - a.y;
    return dx * (b.y - p.y) !== dy * (b.x - p.x) || dx * (b.x - p.x) + dy * (b.y - p.y) <= 0;
  });
  const gained = Math.hypot(first.x - last.x, first.y - last.y) * Math.abs(offset);
  const area = signedArea(cut),
    original = signedArea(size.cut);
  if (!(original > 0) || Math.abs(area - original - gained) > Math.max(0.000001, area * 1e-10))
    throw Error('The new material area does not equal chord length times opening.');
  const loops = inSourceOrder(
    size.cutLoops ?? [],
    stationary.cutLoops ?? [],
    before.cutLoops ?? [],
    moved.cutLoops ?? [],
  );
  const net = area + loops.reduce((sum, hole) => sum + signedArea(hole), 0);
  return {
    ...size,
    cut,
    seam: size.seam ? cut.map((p) => ({ ...p })) : null,
    ...(size.cutLoops && { cutLoops: loops }),
    grain:
      grain && (grain.a[axis] - coordinate) * sign > 0
        ? { ...grain, a: shift(grain.a), b: shift(grain.b) }
        : grain,
    fold: stationary.fold ?? moved.fold,
    notches: inSourceOrder(size.notches, stationary.notches, before.notches, moved.notches),
    drills: inSourceOrder(size.drills, stationary.drills, before.drills, moved.drills),
    internal: inSourceOrder(size.internal, stationary.internal, before.internal, moved.internal),
    ...(size.pointMarks && {
      pointMarks: inSourceOrder(
        size.pointMarks,
        stationary.pointMarks ?? [],
        before.pointMarks ?? [],
        moved.pointMarks ?? [],
      ),
    }),
    ...(size.textMarks && {
      textMarks: inSourceOrder(
        size.textMarks,
        stationary.textMarks ?? [],
        before.textMarks ?? [],
        moved.textMarks ?? [],
      ),
    }),
    bbox: bboxOf(cut),
    areaMm2: net,
    offset: null,
    walls: [],
  };
}

export function applyDraftParallelSpreadV1(
  job: WriteJob,
  cut: Cut,
  spread: Spread,
): { ok: true; job: WriteJob } | { ok: false; detail: string } {
  const axis = parallelOpeningAxisV1(cut.payload.pointsMm),
    p = spread.payload;
  if (
    !axis ||
    p.mode !== 'parallel' ||
    !['positive', 'negative'].includes(p.movingSide) ||
    !validParallelDisplacementV1(p.amountMm) ||
    p.amountMm < 0 ||
    cut.payload.keepSide !== 'both' ||
    p.cutLineEntityId !== cut.payload.entityId ||
    cut.target.pieceId !== spread.target.pieceId ||
    !cut.target.pieceLineKey ||
    cut.target.pieceLineKey !== spread.target.pieceLineKey
  )
    return {
      ok: false,
      detail:
        'Choose a horizontal or vertical registered Cut and a positive opening in millimetres.',
    };
  const targets = job.pieces.filter((piece) => piece.identity === cut.target.pieceId);
  const piece = targets[0];
  if (
    targets.length !== 1 ||
    !piece?.sizes.length ||
    piece.pairHand ||
    piece.pairOf ||
    piece.unfoldedFold ||
    piece.sizes.some((s) => s.fold)
  )
    return { ok: false, detail: 'Select one independent piece without an active fold.' };
  try {
    const [from, to] = cut.payload.pointsMm;
    const sizes = piece.sizes.map((size) =>
      openSize(size, from!, to!, axis, p.amountMm * (p.movingSide === 'positive' ? 1 : -1)),
    );
    return {
      ok: true,
      job: {
        ...job,
        pieces: job.pieces.map((original) => (original === piece ? { ...piece, sizes } : original)),
      },
    };
  } catch (error) {
    return {
      ok: false,
      detail:
        error instanceof Error ? error.message : 'The registered cut cannot open on every size.',
    };
  }
}
