// Where a piece's measured contour came from, and its inner construction lines.
//
// The skeleton measures on the SEWING line when the file has one (CLO: layer 14, or the big layer-8
// loop when 14 coincides with the cut line) and falls back to the cut line otherwise. A POM read on
// a cut line includes the seam allowance, so it can never be `exact`: the model carries which one
// it got. Inner open lines (layer 8 / 85) are kept for dart intake at a level.

import { seamLoopOf } from 'lib/assembly-skeleton/geometry';
import type { Pt2 } from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';

export type ContourSource = 'seam' | 'cut';

const area = (pts: readonly Pt2[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
};

/** `seam` when the measured loop is a sewing line distinct from the cut line, else `cut`. */
export function contourSource(piece: PieceDTO | undefined): {
  source: ContourSource;
  layer: string;
} {
  if (!piece) return { source: 'cut', layer: '' };
  const pick = seamLoopOf(piece);
  if (pick.layer === '8') return { source: 'seam', layer: '8' };
  if (pick.layer !== '14') return { source: 'cut', layer: pick.layer };
  const a = area(pick.pts);
  const cuts: Pt2[][] = [];
  if ((piece.layer ?? '') === '1') cuts.push(piece.poly.map((p) => [p.x * 10, p.y * 10]));
  for (const l of piece.inner ?? [])
    if (l.closed && l.layer === '1') cuts.push(l.pts.map((p) => [p.x * 10, p.y * 10]));
  // A sewing line that IS the cut line (same area) carries no allowance information.
  const same = cuts.some((c) => Math.abs(area(c) - a) < 0.01 * Math.max(1, a));
  return { source: same ? 'cut' : 'seam', layer: '14' };
}

const INNER_LAYERS = new Set(['8', '85']);

/** Open inner lines (internal / dart layers), mm, in the piece frame. */
export function innerLines(piece: PieceDTO | undefined): Pt2[][] {
  return (piece?.inner ?? [])
    .filter((l) => !l.closed && INNER_LAYERS.has(l.layer) && l.pts.length >= 2)
    .map((l) => l.pts.map((p) => [p.x * 10, p.y * 10] as Pt2));
}
