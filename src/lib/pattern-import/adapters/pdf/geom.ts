// Affine matrices in pdf.js order [a, b, c, d, e, f]: p' = (a·x + c·y + e, b·x + d·y + f).

import type { BoxMm, PtMm } from 'lib/pattern-import/types';

export type M6 = [number, number, number, number, number, number];

export const IDENTITY: M6 = [1, 0, 0, 1, 0, 0];

/** m · n — apply n first, then m (PDF `cm` concatenation is `ctm = mul(ctm, cm)`). */
export function mul(m: ArrayLike<number>, n: ArrayLike<number>): M6 {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: ArrayLike<number>, x: number, y: number): PtMm {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Linear scale of a matrix: sqrt|det| — the factor a user-space length (line width, dash) gets. */
export function linScale(m: ArrayLike<number>): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

export function emptyBox(): BoxMm {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function growBox(b: BoxMm, p: PtMm): void {
  if (p.x < b.minX) b.minX = p.x;
  if (p.y < b.minY) b.minY = p.y;
  if (p.x > b.maxX) b.maxX = p.x;
  if (p.y > b.maxY) b.maxY = p.y;
}

export function boxOfPts(pts: readonly PtMm[]): BoxMm {
  const b = emptyBox();
  for (const p of pts) growBox(b, p);
  return b;
}

/** Axis-aligned box of the rectangle [x0,y0,x1,y1] (user space) under m. */
export function boxOfRect(m: ArrayLike<number>, r: ArrayLike<number>): BoxMm {
  return boxOfPts([
    apply(m, r[0], r[1]),
    apply(m, r[2], r[1]),
    apply(m, r[2], r[3]),
    apply(m, r[0], r[3]),
  ]);
}

export function intersectBox(a: BoxMm | null, b: BoxMm): BoxMm {
  if (!a) return { ...b };
  return {
    minX: Math.max(a.minX, b.minX),
    minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX),
    maxY: Math.min(a.maxY, b.maxY),
  };
}

export function boxArea(b: BoxMm): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

/**
 * Flattens the cubic p0..p3 (already in mm) into `out` (p0 excluded, p3 included) with a PROVEN
 * bound on the sagitta: Wang's formula, n = ⌈√(3/4 · M / tol)⌉ with
 * M = max(|p0 − 2p1 + p2|, |p1 − 2p2 + p3|), guarantees max distance curve ↔ polyline ≤ tol.
 */
export function flattenCubic(
  p0: PtMm,
  p1: PtMm,
  p2: PtMm,
  p3: PtMm,
  tol: number,
  out: PtMm[],
): void {
  const ax = p0.x - 2 * p1.x + p2.x;
  const ay = p0.y - 2 * p1.y + p2.y;
  const bx = p1.x - 2 * p2.x + p3.x;
  const by = p1.y - 2 * p2.y + p3.y;
  const M = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
  const n = Math.max(1, Math.min(4096, Math.ceil(Math.sqrt((0.75 * M) / tol))));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    out.push({
      x: k0 * p0.x + k1 * p1.x + k2 * p2.x + k3 * p3.x,
      y: k0 * p0.y + k1 * p1.y + k2 * p2.y + k3 * p3.y,
    });
  }
}
