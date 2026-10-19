// Overlap of placed silhouettes by scanline raster: rows every `step` mm on a grid shared by all
// rasters, exact x-intervals inside each row (even–odd). Area = Σ interval length × step.
//
// The probe sampled contour points instead, and a correctly laid seam scored 20–40 % «overlap»
// because half the samples sit ON the shared edge (00-FEASIBILITY §F). Interval arithmetic gives
// a shared edge zero area, so only real crossing counts.

import type { Pt2 } from '../types';

export type Raster = {
  /** Index of the first row on the shared grid: row i sits at y = (i0 + i + 0.5) · step. */
  i0: number;
  step: number;
  /** Per row: sorted interval endpoints [x0, x1, x2, x3, …] — inside between x0..x1, x2..x3, … */
  rows: number[][];
  area: number;
};

/** Thin a dense 1 mm resample for the overlap test — every k-th point, at most `maxPts` points. */
export function thin(poly: readonly Pt2[], maxPts = 480): Pt2[] {
  if (poly.length <= maxPts) return poly as Pt2[];
  const k = Math.ceil(poly.length / maxPts);
  const out: Pt2[] = [];
  for (let i = 0; i < poly.length; i += k) out.push(poly[i]);
  return out;
}

export function rasterize(poly: readonly Pt2[], step = 1): Raster {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  const i0 = Math.floor(y0 / step);
  const n = Math.max(0, Math.ceil(y1 / step) - i0);
  const rows: number[][] = Array.from({ length: n }, () => []);
  const m = poly.length;
  for (let j = 0; j < m; j++) {
    const a = poly[j];
    const b = poly[(j + 1) % m];
    if (a[1] === b[1]) continue;
    const lo = Math.min(a[1], b[1]);
    const hi = Math.max(a[1], b[1]);
    // Rows whose centre y lies in [lo, hi): half-open, so a vertex is counted once.
    const first = Math.max(0, Math.ceil(lo / step - 0.5) - i0);
    const last = Math.min(n - 1, Math.ceil(hi / step - 0.5) - i0 - 1);
    for (let r = first; r <= last; r++) {
      const y = (i0 + r + 0.5) * step;
      rows[r].push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
  }
  let area = 0;
  for (const row of rows) {
    row.sort((p, q) => p - q);
    if (row.length % 2 === 1) row.pop();
    for (let k = 0; k < row.length; k += 2) area += row[k + 1] - row[k];
  }
  return { i0, step, rows, area: area * step };
}

/** Shared area of two rasters on the same grid. */
export function intersectArea(A: Raster, B: Raster): number {
  if (A.step !== B.step) throw new Error('rasters on different grids');
  const from = Math.max(A.i0, B.i0);
  const to = Math.min(A.i0 + A.rows.length, B.i0 + B.rows.length);
  let sum = 0;
  for (let i = from; i < to; i++) {
    const a = A.rows[i - A.i0];
    const b = B.rows[i - B.i0];
    let p = 0;
    let q = 0;
    while (p < a.length && q < b.length) {
      const lo = Math.max(a[p], b[q]);
      const hi = Math.min(a[p + 1], b[q + 1]);
      if (hi > lo) sum += hi - lo;
      if (a[p + 1] < b[q + 1]) p += 2;
      else q += 2;
    }
  }
  return sum * A.step;
}

/** Overlap of a pair as a share of the SMALLER piece: a yoke buried in a back reads as 100 %. */
export function pairOverlap(A: Raster, B: Raster): number {
  const small = Math.min(A.area, B.area);
  return small > 0 ? intersectArea(A, B) / small : 0;
}
