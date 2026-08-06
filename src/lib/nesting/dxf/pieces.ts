// Loops → pieces. Layer preference first (AAMA layer "1" = piece boundary), then the
// geometric workhorse: open loops are already gone, small loops (drills/notches) are
// dropped by area, the containment forest keeps only outermost contours (darts and
// internal lines die here — a piece is its outer contour, holes discarded on purpose),
// near-duplicate loops dedupe, and each surviving loop is Clipper-sanitized to a simple
// CCW polygon.
import type { Pt } from '../types';
import { MIN_PIECE_AREA_CM2 } from '../types';
import { area, bounds, ensureCCW, pointInPolygon, stripDegenerate } from '../geom/polygon';
import { sanitizeLoop } from '../geom/clipper';
import type { ClosedLoop } from './chain';
import type { EntityGroup } from './transform';
import { chainLoops } from './chain';

export type RawPiece = {
  name: string;
  // The DXF block this piece came from, or null for the loose-entity pool. Kept SEPARATE from
  // `name` (which falls back to a placeholder label for display): downstream this is the key
  // cut-piece aliases match on, so it must never be a fallback string that a real block could
  // also spell.
  blockName: string | null;
  poly: Pt[]; // CCW, cm, absolute drawing coords (normalized later)
};

function keepOutermost(loops: ClosedLoop[]): { roots: ClosedLoop[]; dropped: number } {
  const bbs = loops.map((l) => bounds(l.pts));
  // Hoisted out of the O(n²) scan — area() itself is O(v), and a blockless file can carry
  // hundreds of loops with hundreds of vertices each.
  const areas = loops.map((l) => area(l.pts));
  const roots: ClosedLoop[] = [];
  let dropped = 0;
  for (let i = 0; i < loops.length; i++) {
    let contained = false;
    for (let j = 0; j < loops.length && !contained; j++) {
      if (i === j) continue;
      const bi = bbs[i];
      const bj = bbs[j];
      const bboxInside =
        bi.minX >= bj.minX - 1e-6 && bi.maxX <= bj.maxX + 1e-6 && bi.minY >= bj.minY - 1e-6 && bi.maxY <= bj.maxY + 1e-6;
      if (!bboxInside) continue;
      // Same bbox both ways = duplicate handled elsewhere; strict containment needs PIP.
      if (areas[i] >= areas[j]) continue;
      if (pointInPolygon(loops[i].pts[0], loops[j].pts)) contained = true;
    }
    if (contained) dropped++;
    else roots.push(loops[i]);
  }
  return { roots, dropped };
}

function dedupeLoops(loops: ClosedLoop[]): ClosedLoop[] {
  const out: ClosedLoop[] = [];
  const sigs: Array<{ a: number; b: ReturnType<typeof bounds> }> = [];
  for (const l of loops) {
    const a = area(l.pts);
    const bb = bounds(l.pts);
    const dup = sigs.some(
      (s) =>
        Math.abs(s.a - a) <= s.a * 0.005 &&
        Math.abs(s.b.minX - bb.minX) < 0.05 &&
        Math.abs(s.b.minY - bb.minY) < 0.05 &&
        Math.abs(s.b.maxX - bb.maxX) < 0.05 &&
        Math.abs(s.b.maxY - bb.maxY) < 0.05,
    );
    if (dup) continue;
    sigs.push({ a, b: bb });
    out.push(l);
  }
  return out;
}

// One group (block instance or the loose pool) → pieces.
export function groupToPieces(
  group: EntityGroup,
  tolChain: number,
  warnings: string[],
): RawPiece[] {
  const label = group.blockName ?? 'модель';

  // Layer preference: if layer "1" alone yields at least one closed loop, trust it.
  const layer1 = group.chains.filter((c) => c.layer === '1');
  let loops: ClosedLoop[] = [];
  if (layer1.length > 0) {
    loops = chainLoops(layer1, tolChain, []).loops;
  }
  if (loops.length === 0) {
    loops = chainLoops(group.chains, tolChain, warnings).loops;
  }

  // Area floor: drills, notches, buttonholes.
  const before = loops.length;
  loops = loops.filter((l) => area(l.pts) >= MIN_PIECE_AREA_CM2);
  const small = before - loops.length;
  if (small > 0 && group.blockName == null) {
    warnings.push(`мелких контуров (< ${MIN_PIECE_AREA_CM2} см²) отброшено: ${small}`);
  }

  loops = dedupeLoops(loops);
  const { roots, dropped } = keepOutermost(loops);
  if (dropped > 0 && group.blockName != null) {
    // Internal contours inside a block are darts/sew lines — expected, not warned per-block.
  }

  let chosen: ClosedLoop[];
  if (group.blockName != null) {
    // A block instance is ONE piece: keep the largest root (the boundary), the rest are
    // stray annotation shapes.
    chosen = roots.length > 0 ? [roots.reduce((m, l) => (area(l.pts) > area(m.pts) ? l : m))] : [];
  } else {
    chosen = roots;
  }

  const pieces: RawPiece[] = [];
  for (const loop of chosen) {
    const cleaned = sanitizeLoop(stripDegenerate(loop.pts, 1e-4));
    if (!cleaned || area(cleaned) < MIN_PIECE_AREA_CM2) continue;
    pieces.push({ name: label, blockName: group.blockName, poly: ensureCCW(cleaned) });
  }
  return pieces;
}
