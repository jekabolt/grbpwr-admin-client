// Rigid motions for the union pictogram. Affine order is SVG's: x' = a·x + c·y + e, y' = b·x + d·y + f.

import type { Affine, Pt2 } from '../types';

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export function apply(T: Affine, p: Pt2): Pt2 {
  const [a, b, c, d, e, f] = T;
  return [a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f];
}

/** A∘B: apply B first, then A. */
export function compose(A: Affine, B: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = A;
  const [a2, b2, c2, d2, e2, f2] = B;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export const translate = (dx: number, dy: number): Affine => [1, 0, 0, 1, dx, dy];

export const det = (T: Affine): number => T[0] * T[3] - T[1] * T[2];

/**
 * The motion that lays segment q0→q1 onto p0→p1: optional mirror (x → −x) first, then the
 * rotation that matches the directions, then the translation q0 → p0. Lengths are NOT matched —
 * an eased seam keeps its own length and its far end misses by the ease (reported as endErr).
 */
export function rigid(p0: Pt2, p1: Pt2, q0: Pt2, q1: Pt2, mirror: boolean): Affine {
  const M: Affine = mirror ? [-1, 0, 0, 1, 0, 0] : IDENTITY;
  const m0 = apply(M, q0);
  const m1 = apply(M, q1);
  const th = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) - Math.atan2(m1[1] - m0[1], m1[0] - m0[0]);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const r0: Pt2 = [c * m0[0] - s * m0[1], s * m0[0] + c * m0[1]];
  return compose([c, s, -s, c, p0[0] - r0[0], p0[1] - r0[1]], M);
}
