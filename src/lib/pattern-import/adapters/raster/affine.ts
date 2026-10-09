// Small affine helpers (row-major p' = [a c e; b d f]·[x y 1], as types.ts §0).

import type { Affine, PtMm } from '../../types';

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function apply(m: Affine, x: number, y: number): PtMm {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** m1 ∘ m2: first m2, then m1. */
export function compose(m1: Affine, m2: Affine): Affine {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function invert(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-15) throw new Error('affine: singular');
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

/** sqrt(|det|): the mean linear scale of the map. */
export function meanScale(m: Affine): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

/** Least-squares affine taking src[i] → dst[i] (≥ 3 non-collinear pairs). */
export function fitAffine(src: PtMm[], dst: PtMm[]): Affine {
  // Normal equations for [a c e] and [b d f] share the same 3×3 matrix.
  let sxx = 0;
  let sxy = 0;
  let sx = 0;
  let syy = 0;
  let sy = 0;
  const n = src.length;
  let ux = 0;
  let uy = 0;
  let u1 = 0;
  let vx = 0;
  let vy = 0;
  let v1 = 0;
  for (let i = 0; i < n; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    sxx += x * x;
    sxy += x * y;
    sx += x;
    syy += y * y;
    sy += y;
    ux += x * X;
    uy += y * X;
    u1 += X;
    vx += x * Y;
    vy += y * Y;
    v1 += Y;
  }
  const M = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const [a, c, e] = solve3(M, [ux, uy, u1]);
  const [b, d, f] = solve3(M, [vx, vy, v1]);
  return { a, b, c, d, e, f };
}

function solve3(M: number[][], r: number[]): [number, number, number] {
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-12) throw new Error('affine: degenerate fit');
  const out: number[] = [];
  for (let k = 0; k < 3; k++) {
    const Mk = M.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)));
    out.push(det(Mk) / D);
  }
  return out as [number, number, number];
}

/**
 * Linear part L = Q·R (Q rotation, R upper-triangular with positive diagonal). R carries the
 * scanner's stretch and skew, Q the placement of the sheet on the glass.
 */
export function qr(m: Affine): { rotRad: number; r11: number; r12: number; r22: number } {
  const rotRad = Math.atan2(m.b, m.a);
  const cs = Math.cos(rotRad);
  const sn = Math.sin(rotRad);
  // Qᵀ·L
  const r11 = cs * m.a + sn * m.b;
  const r12 = cs * m.c + sn * m.d;
  const r22 = -sn * m.c + cs * m.d;
  return { rotRad, r11, r12, r22 };
}
