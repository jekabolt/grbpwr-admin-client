// F12 · 2D affine helpers shared by the HPGL and SVG adapters (private to F12).
// Same layout as types.ts `Affine` and SVG `matrix(a,b,c,d,e,f)`: x' = a·x + c·y + e, y' = b·x + d·y + f.

import type { Affine, PtMm } from '../../types';

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** m1 ∘ m2 — apply m2 first, then m1 (SVG nesting: parent × child). */
export function mul(m1: Affine, m2: Affine): Affine {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function apply(m: Affine, x: number, y: number): PtMm {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** Linear part only (vectors). */
export function applyVec(m: Affine, x: number, y: number): PtMm {
  return { x: m.a * x + m.c * y, y: m.b * x + m.d * y };
}

export const translate = (tx: number, ty: number): Affine => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: tx,
  f: ty,
});
export const scale = (sx: number, sy: number = sx): Affine => ({
  a: sx,
  b: 0,
  c: 0,
  d: sy,
  e: 0,
  f: 0,
});
export function rotate(deg: number): Affine {
  const r = (deg * Math.PI) / 180;
  const cs = Math.cos(r);
  const sn = Math.sin(r);
  return { a: cs, b: sn, c: -sn, d: cs, e: 0, f: 0 };
}

/** Largest singular value: the most a unit length can grow under m. Bounds flattening error. */
export function sigmaMax(m: Affine): number {
  const p = m.a * m.a + m.b * m.b;
  const q = m.c * m.c + m.d * m.d;
  const r = m.a * m.c + m.b * m.d;
  const tr = (p + q) / 2;
  const disc = Math.sqrt(Math.max(0, ((p - q) / 2) ** 2 + r * r));
  return Math.sqrt(tr + disc);
}

/** Geometric-mean scale √|det| — what a stroke width or dash length grows by. */
export function meanScale(m: Affine): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}
