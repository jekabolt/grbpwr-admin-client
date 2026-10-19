// Small flat geometry for the POM engine: everything in piece-local millimetres, y up.

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

export type BBox = { x0: number; y0: number; x1: number; y1: number; w: number; h: number };

export const dist = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function bboxOf(pts: readonly Pt2[]): BBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function polyLen(pts: readonly Pt2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/**
 * Inside intervals of the horizontal line y = Y with a closed contour: [xa, xb] pairs, sorted.
 * Even-odd: a garment piece is a simple polygon.
 */
export function hIntervals(ring: readonly Pt2[], Y: number): [number, number][] {
  const xs: number[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % n];
    if (ay === by) continue;
    if ((Y >= ay && Y < by) || (Y >= by && Y < ay))
      xs.push(ax + ((Y - ay) * (bx - ax)) / (by - ay));
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

/** Inside intervals of the vertical line x = X: [ya, yb] pairs, sorted. */
export function vIntervals(ring: readonly Pt2[], X: number): [number, number][] {
  const swapped = ring.map(([x, y]) => [y, x] as Pt2);
  return hIntervals(swapped, X);
}

export const widthAt = (ring: readonly Pt2[], Y: number) =>
  hIntervals(ring, Y).reduce((s, [a, b]) => s + (b - a), 0);

/** Point at arc length `s` along an open polyline (clamped). */
export function pointAt(pts: readonly Pt2[], s: number): Pt2 {
  if (s <= 0) return pts[0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= s) {
      const t = d > 0 ? (s - acc) / d : 0;
      return [
        pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]),
        pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]),
      ];
    }
    acc += d;
  }
  return pts[pts.length - 1];
}

/** Angle of the edge's chord from the horizontal, 0..90 degrees. */
export function chordTilt(e: Edge): number {
  const a = e.pts[0];
  const b = e.pts[e.pts.length - 1];
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export const meanY = (pts: readonly Pt2[]) => pts.reduce((s, p) => s + p[1], 0) / pts.length;
export const meanX = (pts: readonly Pt2[]) => pts.reduce((s, p) => s + p[0], 0) / pts.length;

export const first = (e: { pts: Pt2[] }) => e.pts[0];
export const last = (e: { pts: Pt2[] }) => e.pts[e.pts.length - 1];

/** The end of `a` that touches `b` (corner), with the gap between them. */
export function sharedCorner(a: Edge, b: Edge): { pt: Pt2; gap: number } {
  const pairs: [Pt2, Pt2][] = [
    [first(a), first(b)],
    [first(a), last(b)],
    [last(a), first(b)],
    [last(a), last(b)],
  ];
  let best = pairs[0];
  for (const p of pairs) if (dist(p[0], p[1]) < dist(best[0], best[1])) best = p;
  return { pt: best[0], gap: dist(best[0], best[1]) };
}

/**
 * Mirror symmetry of a piece about the vertical through its bbox centre: median distance (mm) from
 * each mirrored contour point to the contour. A full back / yoke cut in one piece scores ≈ 0.
 */
export function mirrorErrorMm(piece: PieceGeom): number {
  const rs = piece.rs;
  if (rs.length < 8) return Infinity;
  const bb = bboxOf(rs);
  const cx = (bb.x0 + bb.x1) / 2;
  const step = Math.max(1, Math.floor(rs.length / 120));
  const sample = rs.filter((_, i) => i % step === 0);
  const ds: number[] = [];
  for (const [x, y] of sample) {
    const m: Pt2 = [2 * cx - x, y];
    let d = Infinity;
    for (const q of rs) d = Math.min(d, dist(m, q));
    ds.push(d);
  }
  // Median: pleat tucks drawn a little off one side must not make a symmetric back asymmetric.
  ds.sort((a, b) => a - b);
  return ds[ds.length >> 1];
}

/** Lowest / highest point of the contour on the vertical x = X (null when X misses the piece). */
export function verticalSpan(ring: readonly Pt2[], X: number): { lo: number; hi: number } | null {
  const iv = vIntervals(ring, X);
  if (!iv.length) return null;
  return { lo: iv[0][0], hi: iv[iv.length - 1][1] };
}

export const round1 = (x: number) => Math.round(x * 10) / 10;
