// Grade map · small geometry on mm polylines: arc-length paths, projection, rings.

import type { PtMm } from 'lib/pattern-import/types';
import { Q_PER_MM, type Q } from './types';

/** A polyline with its cumulative arc. Closed paths are counter-clockwise, without a closing duplicate. */
export type Path = { pts: PtMm[]; closed: boolean; cum: number[]; total: number };

export const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: PtMm, b: PtMm, t: number): PtMm => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const mod = (v: number, m: number) => ((v % m) + m) % m;

export const toQ = (v: number): Q => Math.round(v * Q_PER_MM);
export const fromQ = (v: Q): number => v / Q_PER_MM;

export function signedArea(pts: readonly PtMm[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Path of a polyline: consecutive duplicates dropped; a closed one CCW without closing duplicate. */
export function pathOf(points: readonly PtMm[], closed: boolean): Path | null {
  let pts: PtMm[] = [];
  for (const p of points) if (!pts.length || dist(pts[pts.length - 1], p) > 1e-6) pts.push(p);
  if (closed) {
    while (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) <= 1e-6) pts.pop();
    if (pts.length < 3) return null;
    if (signedArea(pts) < 0) pts = pts.reverse();
  } else if (pts.length < 2) return null;
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i <= (closed ? n : n - 1); i++)
    cum.push(cum[i - 1] + dist(pts[i - 1], pts[i % n]));
  const total = cum[cum.length - 1];
  return total > 1e-9 ? { pts, closed, cum, total } : null;
}

/** The segment holding arc s (0 ≤ s ≤ total). */
function segmentAt(path: Path, s: number): number {
  let lo = 0;
  let hi = path.cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path.cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The point at arc s (closed: cyclic; open: clamped). */
export function pointAt(path: Path, s: number): PtMm {
  const t = path.closed ? mod(s, path.total) : Math.max(0, Math.min(path.total, s));
  const i = segmentAt(path, t);
  const a = path.pts[i];
  const b = path.pts[(i + 1) % path.pts.length];
  const len = path.cum[i + 1] - path.cum[i];
  return lerp(a, b, len > 0 ? (t - path.cum[i]) / len : 0);
}

/** Nearest point of the path to q: its arc and distance. */
export function project(path: Path, q: PtMm): { s: number; d: number } {
  const n = path.pts.length;
  let best = { s: 0, d: Infinity };
  for (let i = 0; i < (path.closed ? n : n - 1); i++) {
    const a = path.pts[i];
    const b = path.pts[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ll = abx * abx + aby * aby;
    const t = ll > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.y - a.y) * aby) / ll)) : 0;
    const d = Math.hypot(q.x - a.x - abx * t, q.y - a.y - aby * t);
    if (d < best.d) best = { s: path.cum[i] + t * Math.sqrt(ll), d };
  }
  if (path.closed && best.s >= path.total) best.s -= path.total;
  return best;
}

export function bboxOf(pts: readonly PtMm[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function centroidOf(pts: readonly PtMm[]): PtMm {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, pts.length), y: y / Math.max(1, pts.length) };
}

export function pointInRing(q: PtMm, ring: readonly PtMm[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** n points at equal arc steps along a path (closed: the start is not repeated). */
export function resampled(path: Path, n: number): PtMm[] {
  const out: PtMm[] = [];
  const steps = path.closed ? n : n - 1;
  for (let k = 0; k < n; k++) out.push(pointAt(path, (path.total * k) / Math.max(1, steps)));
  return out;
}

export function distanceToPolyline(q: PtMm, pts: readonly PtMm[], closed: boolean): number {
  let best = Infinity;
  const n = pts.length;
  if (n === 1) return dist(q, pts[0]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ll = abx * abx + aby * aby;
    const t = ll > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.y - a.y) * aby) / ll)) : 0;
    best = Math.min(best, Math.hypot(q.x - a.x - abx * t, q.y - a.y - aby * t));
  }
  return best;
}

/** Symmetric RMS distance between two polylines sampled at their points, mm (order free). */
export function chamfer(a: readonly PtMm[], b: readonly PtMm[], closed: boolean): number {
  let sum = 0;
  for (const p of a) sum += distanceToPolyline(p, b, closed) ** 2;
  for (const p of b) sum += distanceToPolyline(p, a, closed) ** 2;
  return Math.sqrt(sum / Math.max(1, a.length + b.length));
}
