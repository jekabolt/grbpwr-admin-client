// semantics/ geometry helpers — mm, y-up, plain {x,y}. Private to semantics/ (08-CONTRACT §2:
// semantics may not import write/, so the few primitives it shares with the writer are restated
// here; they are small and the gate re-measures everything on the written file anyway).

import type { Affine, BoxMm, PtMm } from '../types';
import { convexHull as hullCm } from 'lib/nesting/geom/convex';

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const applyAffine = (t: Affine, p: PtMm): PtMm => ({
  x: t.a * p.x + t.c * p.y + t.e,
  y: t.b * p.x + t.d * p.y + t.f,
});

/** t1 ∘ t2 (t2 applied first). */
export function compose(t1: Affine, t2: Affine): Affine {
  return {
    a: t1.a * t2.a + t1.c * t2.b,
    b: t1.b * t2.a + t1.d * t2.b,
    c: t1.a * t2.c + t1.c * t2.d,
    d: t1.b * t2.c + t1.d * t2.d,
    e: t1.a * t2.e + t1.c * t2.f + t1.e,
    f: t1.b * t2.e + t1.d * t2.f + t1.f,
  };
}

/** Reflection across the infinite line through a, b (same matrix as write/geom.reflection). */
export function reflection(a: PtMm, b: PtMm): Affine {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (!(L2 > 0)) throw new Error('reflection axis has zero length');
  const c2 = (dx * dx - dy * dy) / L2;
  const s2 = (2 * dx * dy) / L2;
  return {
    a: c2,
    b: s2,
    c: s2,
    d: -c2,
    e: a.x - (c2 * a.x + s2 * a.y),
    f: a.y - (s2 * a.x - c2 * a.y),
  };
}

export const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

export function signedArea(pts: readonly PtMm[]): number {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}
export const areaOf = (pts: readonly PtMm[]) => Math.abs(signedArea(pts));
export const ccw = (pts: readonly PtMm[]): PtMm[] =>
  signedArea(pts) < 0 ? [...pts].reverse() : [...pts];

export function bboxOf(pts: readonly PtMm[]): BoxMm {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function perimeter(pts: readonly PtMm[], closed = true): number {
  let s = 0;
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) s += dist(pts[i], pts[(i + 1) % n]);
  return s;
}

export function convexHull(pts: readonly PtMm[]): PtMm[] {
  return hullCm(pts);
}

/** area / area(convex hull): 1.0 = convex (or collapsed into its hull). */
export function hullRatio(pts: readonly PtMm[]): number {
  const h = areaOf(convexHull(pts));
  return h > 0 ? areaOf(pts) / h : 1;
}

/** Drop consecutive duplicates (incl. the wrap pair) and exactly collinear-reversal spikes. */
export function dedupe(pts: readonly PtMm[], closed: boolean, eps = 1e-6): PtMm[] {
  const out: PtMm[] = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (l && Math.abs(l.x - p.x) <= eps && Math.abs(l.y - p.y) <= eps) continue;
    out.push(p);
  }
  if (closed) while (out.length > 1 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  return out;
}

export function centroidOf(pts: readonly PtMm[]): PtMm {
  const a = signedArea(pts);
  if (Math.abs(a) < 1e-9) {
    const b = bboxOf(pts);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: PtMm, poly: readonly PtMm[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Foot of p on segment ab: point, parameter t∈[0,1], distance. */
export function footOnSegment(p: PtMm, a: PtMm, b: PtMm): { q: PtMm; t: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { q, t, d: dist(p, q) };
}

/** Closest point on a polyline (brute force — use SegIndex for many queries). */
export function closestOnPolyline(
  p: PtMm,
  pts: readonly PtMm[],
  closed: boolean,
): { q: PtMm; seg: number; t: number; d: number } {
  let best = { q: pts[0], seg: 0, t: 0, d: Infinity };
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const f = footOnSegment(p, pts[i], pts[(i + 1) % n]);
    if (f.d < best.d) best = { q: f.q, seg: i, t: f.t, d: f.d };
  }
  return best;
}

/** Uniform-grid segment index for nearest-distance queries. */
export class SegIndex {
  private cell: number;
  private grid = new Map<string, number[]>();
  private segs: [PtMm, PtMm][] = [];
  constructor(lines: { pts: readonly PtMm[]; closed: boolean }[], cell = 5) {
    this.cell = cell;
    for (const l of lines) {
      const n = l.pts.length;
      for (let i = 0; i < (l.closed ? n : n - 1); i++) {
        const a = l.pts[i];
        const b = l.pts[(i + 1) % n];
        const id = this.segs.length;
        this.segs.push([a, b]);
        const x0 = Math.floor(Math.min(a.x, b.x) / cell);
        const x1 = Math.floor(Math.max(a.x, b.x) / cell);
        const y0 = Math.floor(Math.min(a.y, b.y) / cell);
        const y1 = Math.floor(Math.max(a.y, b.y) / cell);
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const k = `${x},${y}`;
            const arr = this.grid.get(k);
            if (arr) arr.push(id);
            else this.grid.set(k, [id]);
          }
      }
    }
  }
  /** Distance to the nearest segment, searched up to `maxR` (Infinity when nothing that close). */
  nearest(p: PtMm, maxR: number): number {
    return this.nearestFoot(p, maxR).d;
  }
  nearestFoot(p: PtMm, maxR: number): { d: number; t: number; q: PtMm | null } {
    const c = this.cell;
    const cx = Math.floor(p.x / c);
    const cy = Math.floor(p.y / c);
    const R = Math.ceil(maxR / c);
    let best = { d: Infinity, t: 0, q: null as PtMm | null };
    const seen = new Set<number>();
    for (let r = 0; r <= R; r++) {
      for (let x = cx - r; x <= cx + r; x++)
        for (let y = cy - r; y <= cy + r; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          const arr = this.grid.get(`${x},${y}`);
          if (!arr) continue;
          for (const id of arr) {
            if (seen.has(id)) continue;
            seen.add(id);
            const [a, b] = this.segs[id];
            const f = footOnSegment(p, a, b);
            if (f.d < best.d) best = { d: f.d, t: f.t, q: f.q };
          }
        }
      // ring r covers everything within r·cell of p
      if (best.d <= r * c) break;
    }
    return best.d <= maxR ? best : { d: Infinity, t: 0, q: null };
  }
}

/** Points along a polyline every `step` mm (vertices included). */
export function sampleAlong(pts: readonly PtMm[], closed: boolean, step: number): PtMm[] {
  const out: PtMm[] = [];
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const L = dist(a, b);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  if (!closed && n) out.push(pts[n - 1]);
  return out;
}

const orient = (a: PtMm, b: PtMm, c: PtMm) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Proper or touching intersection of segments ab and cd (shared endpoints excluded by caller). */
function segsCross(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0)))
    return true;
  return false;
}

/** Does a closed polyline cross itself (non-adjacent edges properly intersect)? Grid-bucketed. */
export function selfIntersects(pts: readonly PtMm[], cell = 10): boolean {
  const n = pts.length;
  if (n < 4) return false;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const x0 = Math.floor(Math.min(a.x, b.x) / cell);
    const x1 = Math.floor(Math.max(a.x, b.x) / cell);
    const y0 = Math.floor(Math.min(a.y, b.y) / cell);
    const y1 = Math.floor(Math.max(a.y, b.y) / cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        const arr = grid.get(k);
        if (arr) {
          for (const j of arr) {
            if (Math.abs(i - j) <= 1 || Math.abs(i - j) === n - 1) continue;
            if (segsCross(a, b, pts[j], pts[(j + 1) % n])) return true;
          }
          arr.push(i);
        } else grid.set(k, [i]);
      }
  }
  return false;
}

/** Intersections of the infinite line (a, u) with a closed polygon: parameters along u. */
export function lineHits(a: PtMm, u: PtMm, poly: readonly PtMm[]): number[] {
  const out: number[] = [];
  const n = poly.length;
  const nrm = { x: -u.y, y: u.x };
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const sp = (p.x - a.x) * nrm.x + (p.y - a.y) * nrm.y;
    const sq = (q.x - a.x) * nrm.x + (q.y - a.y) * nrm.y;
    if ((sp > 0 && sq > 0) || (sp < 0 && sq < 0)) continue;
    if (sp === sq) {
      // collinear edge: both ends are hits
      out.push((p.x - a.x) * u.x + (p.y - a.y) * u.y, (q.x - a.x) * u.x + (q.y - a.y) * u.y);
      continue;
    }
    const t = sp / (sp - sq);
    const x = p.x + (q.x - p.x) * t;
    const y = p.y + (q.y - p.y) * t;
    out.push((x - a.x) * u.x + (y - a.y) * u.y);
  }
  return out.sort((x, y) => x - y);
}
