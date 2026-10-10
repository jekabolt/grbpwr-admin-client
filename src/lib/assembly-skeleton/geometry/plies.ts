// PLY PAIRS — where on a ply pair a seam to a handed piece goes.
//
// A ply pair (a double yoke) is sewn onto the piece under it (the back) along one edge; a front's
// shoulder then goes to the yoke shoulder on the front's own side. Which yoke shoulder that is is
// read from the drawing, never from names: the back and the yoke are drawn the same way (one file,
// one convention — as seen from behind, or mirrored, it does not matter), so the side of the back
// the left pieces are sewn to (the left front's side seam) is the side of the yoke the left
// shoulder is on. A piece drawn upside down against its partner (its sandwich edge at the same end
// of its box) swaps the sides.

import type { Edge, PieceGeom } from '../types';

const box = (p: PieceGeom) => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of p.rs) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1 };
};

const midOf = (e: Edge) => e.pts[Math.floor(e.pts.length / 2)] ?? [0, 0];

/** The edge's middle against the piece's box centre: −1 left of it, +1 right (drawing x). */
export function xSideOf(p: PieceGeom, e: Edge): -1 | 0 | 1 {
  const b = box(p);
  const c = (b.x0 + b.x1) / 2;
  const x = midOf(e)[0];
  const tol = 0.05 * (b.x1 - b.x0);
  return x < c - tol ? -1 : x > c + tol ? 1 : 0;
}

/** Height of the edge's middle in the piece's box: 0 at the bottom, 1 at the top. */
export function yMidOf(p: PieceGeom, e: Edge): number {
  const b = box(p);
  return b.y1 > b.y0 ? (midOf(e)[1] - b.y0) / (b.y1 - b.y0) : 0.5;
}

/**
 * +1 when two pieces sewn along `qe` / `pe` are drawn the same way up (one edge at the top of its
 * piece, the other at the bottom of its own), −1 when one of them is drawn upside down.
 */
export function sameWayUp(q: PieceGeom, qe: Edge, p: PieceGeom, pe: Edge): 1 | -1 {
  return yMidOf(q, qe) > 0.5 !== yMidOf(p, pe) > 0.5 ? 1 : -1;
}

/**
 * The drawing side (−1 / +1) of piece `q` that the pieces of `hand` are sewn to, voted by the seams
 * given as [an edge of q, the hand of the piece on the other side]; 0 when they do not tell.
 */
export function handSideOn(
  q: PieceGeom,
  links: readonly { qEdge: Edge; hand: 'L' | 'R' | null }[],
  hand: 'L' | 'R',
): -1 | 0 | 1 {
  let v = 0;
  for (const l of links) if (l.hand) v += (l.hand === hand ? 1 : -1) * xSideOf(q, l.qEdge);
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}
