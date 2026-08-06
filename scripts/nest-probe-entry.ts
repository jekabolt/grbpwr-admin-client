// Probe entry — bundled by scripts/nest-probe.mjs and run in node. See that file for why
// this exists at all: the engine has no test runner, and every promise it makes (gap,
// «влезло», determinism, budget) is only checkable against TRUE geometry.
//
// The measuring code below is DELIBERATELY not shared with the engine. The union of a
// region agreeing with its own Difference is exactly how the last round of overlap bugs
// stayed invisible; a probe that called place.ts's own clearance test would repeat that
// mistake one level up.
import type { NestConfig, NestResult, PieceDTO, Pt } from '../src/lib/nesting/types';
import { NEST_DEFAULTS } from '../src/lib/nesting/types';
import { parseSheets, type SheetBytes } from '../src/lib/nesting/worker/parse-files';
import { orientToGrain } from '../src/lib/nesting/geom/grain-orient';
import { applySeamAllowance } from '../src/lib/nesting/geom/seam-allowance';
import { nest } from '../src/lib/nesting/nest';

export type ProbeInput = {
  sheets: SheetBytes[];
  grainLayer?: string;
  contourLayer?: string;
  // Instances per piece. 1 = one of each parsed piece.
  perPiece?: number;
  // Cap on distinct pieces (after layer filtering) — the size of the job.
  maxPieces?: number;
  config?: Partial<NestConfig>;
};

export type ProbeOutput = {
  parsed: number;
  used: number;
  instances: number;
  layers: { layer: string; blocks: number }[];
  result: NestResult;
  // Independent verification, computed here from the placed contours.
  minClearanceCm: number;
  overlaps: number;
  shortPairs: number;
  outsideWidth: number;
  blobHash: string;
  progress: { nfpDone: number; nfpTotal: number; lastGeneration: number };
};

// ── independent geometry (no engine imports) ───────────────────────────────────────────

function segDist2(px: number, py: number, ux: number, uy: number, vx: number, vy: number): number {
  const dx = vx - ux;
  const dy = vy - uy;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ux) * dx + (py - uy) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ux + t * dx;
  const qy = uy + t * dy;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

function pointInPoly(poly: readonly Pt[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    if (yi > py !== yj > py) {
      const x = poly[i].x + ((py - yi) / (yj - yi)) * (poly[j].x - poly[i].x);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

// Distance between two placed contours, and whether they intersect at all. Brute force on
// purpose: it is O(n·m) per pair and the probe can afford what the placer cannot.
function pairMeasure(a: readonly Pt[], b: readonly Pt[]): { dist: number; overlap: boolean } {
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i];
    const p2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const q1 = b[j];
      const q2 = b[(j + 1) % b.length];
      if (segmentsCross(p1.x, p1.y, p2.x, p2.y, q1.x, q1.y, q2.x, q2.y)) {
        return { dist: 0, overlap: true };
      }
      const d = Math.min(
        segDist2(p1.x, p1.y, q1.x, q1.y, q2.x, q2.y),
        segDist2(q1.x, q1.y, p1.x, p1.y, p2.x, p2.y),
      );
      if (d < best) best = d;
    }
  }
  // No crossing — one may still sit wholly inside the other.
  if (pointInPoly(b, a[0].x, a[0].y) || pointInPoly(a, b[0].x, b[0].y)) {
    return { dist: 0, overlap: true };
  }
  return { dist: Math.sqrt(best), overlap: false };
}

function rotate(poly: readonly Pt[], rot: number): Pt[] {
  switch (rot) {
    case 90:
      return poly.map((p) => ({ x: -p.y, y: p.x }));
    case 180:
      return poly.map((p) => ({ x: -p.x, y: -p.y }));
    case 270:
      return poly.map((p) => ({ x: p.y, y: -p.x }));
    default:
      return poly.map((p) => ({ ...p }));
  }
}

function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (((h2 >>> 0) * 4294967296 + (h1 >>> 0)) >>> 0).toString(16).padStart(8, '0');
}

// ── the run ────────────────────────────────────────────────────────────────────────────

// Verification of a finished layout against the TRUE contours, callable on any run — the
// synthetic probes need it as much as the real-file one. Keeping it here rather than inline
// in probe() is what stopped `yarn nest:probe` (which has no DXF to chew on) from asserting
// no geometry at all.
export function verifyPlacements(
  pieces: readonly PieceDTO[],
  result: NestResult,
  cfg: { gapCm: number; fabricWidthCm: number; edgeMarginCm: number },
): { minClearanceCm: number; overlaps: number; shortPairs: number; outsideWidth: number } {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const placed = result.placements.map((pl) => {
    const dto = byId.get(pl.pieceId)!;
    return rotate(dto.poly, pl.rot).map((q) => ({ x: q.x + pl.x, y: q.y + pl.y }));
  });
  let minClearanceCm = Infinity;
  let overlaps = 0;
  let shortPairs = 0;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const m = pairMeasure(placed[i], placed[j]);
      if (m.overlap) {
        overlaps++;
        minClearanceCm = 0;
        continue;
      }
      if (m.dist < minClearanceCm) minClearanceCm = m.dist;
      // 1e-6 slack: the placer works in integer units of 1/1000 cm.
      if (m.dist < cfg.gapCm - 1e-6) shortPairs++;
    }
  }
  let outsideWidth = 0;
  for (const p of placed) {
    for (const q of p) {
      if (q.y < cfg.edgeMarginCm - 1e-6 || q.y > cfg.fabricWidthCm - cfg.edgeMarginCm + 1e-6) {
        outsideWidth++;
        break;
      }
    }
  }
  return {
    minClearanceCm: minClearanceCm === Infinity ? -1 : minClearanceCm,
    overlaps,
    shortPairs,
    outsideWidth,
  };
}

export async function probe(input: ProbeInput): Promise<ProbeOutput> {
  const opts = { unit: 'auto' as const, tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain };
  const { pieces: parsed } = await parseSheets(input.sheets, opts);

  const byLayer = new Map<string, number>();
  for (const p of parsed) byLayer.set(p.layer ?? '', (byLayer.get(p.layer ?? '') ?? 0) + 1);
  const layers = [...byLayer.entries()]
    .map(([layer, blocks]) => ({ layer, blocks }))
    .sort((a, b) => b.blocks - a.blocks);

  // One contour per block: a block routinely carries the piece twice (sewing line and cut
  // line on different layers) and nesting both would measure a job nobody would run.
  const wantLayer = input.contourLayer ?? layers[0]?.layer ?? '';
  const seen = new Set<string>();
  const picked: PieceDTO[] = [];
  for (const p of parsed) {
    if ((p.layer ?? '') !== wantLayer) continue;
    const key = `${p.fileIndex}|${p.blockName || p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
    if (input.maxPieces && picked.length >= input.maxPieces) break;
  }

  const grainLayer = input.grainLayer ?? '';
  const oriented = orientToGrain(picked, grainLayer).pieces;
  const seam = applySeamAllowance(oriented, input.config?.seamAllowanceCm ?? NEST_DEFAULTS.seamAllowanceCm);
  const pieces = seam.pieces;

  const perPiece = input.perPiece ?? 1;
  const config: NestConfig = {
    pieces: pieces.map((p) => ({ pieceId: p.id, quantity: perPiece })),
    fabricWidthCm: NEST_DEFAULTS.fabricWidthCm,
    gapCm: NEST_DEFAULTS.gapCm,
    edgeMarginCm: NEST_DEFAULTS.edgeMarginCm,
    allowCrossGrain: NEST_DEFAULTS.allowCrossGrain,
    grainLayer,
    seamAllowanceCm: NEST_DEFAULTS.seamAllowanceCm,
    timeBudgetMs: NEST_DEFAULTS.timeBudgetMs,
    rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
    ...input.config,
  };

  const progress = { nfpDone: 0, nfpTotal: 0, lastGeneration: 0 };
  const result = await nest(pieces, config, () => false, (p) => {
    if (p.phase === 'nfp') {
      progress.nfpDone = p.nfpDone ?? progress.nfpDone;
      progress.nfpTotal = p.nfpTotal ?? progress.nfpTotal;
    } else {
      progress.lastGeneration = p.generation ?? progress.lastGeneration;
    }
  });

  // ── verification against the true contours the marker promises ──
  const { minClearanceCm, overlaps, shortPairs, outsideWidth } = verifyPlacements(
    pieces,
    result,
    config,
  );

  const blobHash = hash(
    JSON.stringify(
      result.placements.map((p) => [p.pieceId, p.instance, p.rot, Math.round(p.x * 1000), Math.round(p.y * 1000)]),
    ),
  );

  return {
    parsed: parsed.length,
    used: pieces.length,
    instances: pieces.length * perPiece,
    layers,
    result,
    minClearanceCm: minClearanceCm === Infinity ? -1 : minClearanceCm,
    overlaps,
    shortPairs,
    outsideWidth,
    blobHash,
    progress,
  };
}

// A synthetic job with no DXF: `n` rectangles of the given size. Used for the «не влезло»
// probe, where the point is a piece that CANNOT fit the width in any allowed rotation.
export function syntheticPieces(specs: { w: number; h: number }[]): PieceDTO[] {
  return specs.map((s, i) => ({
    id: i + 1,
    name: `rect ${s.w}×${s.h}`,
    blockName: `R${i + 1}`,
    source: 'synthetic',
    fileIndex: 0,
    poly: [
      { x: 0, y: 0 },
      { x: s.w, y: 0 },
      { x: s.w, y: s.h },
      { x: 0, y: s.h },
    ],
    bboxW: s.w,
    bboxH: s.h,
    areaCm2: s.w * s.h,
  }));
}

export { nest, NEST_DEFAULTS };
export type { NestConfig, NestResult, PieceDTO };
