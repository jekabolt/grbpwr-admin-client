// Small, dependency-free geometry in MILLIMETRES (y-up) shared by the writer and the gate.
//
// Deliberately NOT lib/nesting/geom/*: that code speaks cm and its offset collapses to a hull
// (08-CONTRACT §2). Everything here is exact arithmetic on polylines — no clipping, no offsetting.

import type { Affine, BoxMm, PtMm } from '../types';

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function applyAffine(t: Affine, p: PtMm): PtMm {
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
}

/** t2 ∘ t1: first t1, then t2. */
export function compose(t2: Affine, t1: Affine): Affine {
  return {
    a: t2.a * t1.a + t2.c * t1.b,
    b: t2.b * t1.a + t2.d * t1.b,
    c: t2.a * t1.c + t2.c * t1.d,
    d: t2.b * t1.c + t2.d * t1.d,
    e: t2.a * t1.e + t2.c * t1.f + t2.e,
    f: t2.b * t1.e + t2.d * t1.f + t2.f,
  };
}

export function translation(dx: number, dy: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
}

/** Reflection across the infinite line through a and b. */
export function reflection(a: PtMm, b: PtMm): Affine {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (!(L2 > 0)) throw new Error('reflection axis has zero length');
  const c2 = (dx * dx - dy * dy) / L2; // cos 2θ
  const s2 = (2 * dx * dy) / L2; // sin 2θ
  // p' = R(p − a) + a with R = [c2 s2; s2 −c2]
  return {
    a: c2,
    b: s2,
    c: s2,
    d: -c2,
    e: a.x - (c2 * a.x + s2 * a.y),
    f: a.y - (s2 * a.x - c2 * a.y),
  };
}

export const isReflection = (t: Affine) => t.a * t.d - t.b * t.c < 0;

export function signedArea(poly: readonly PtMm[]): number {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export const areaOf = (poly: readonly PtMm[]) => Math.abs(signedArea(poly));

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

export function unionBox(a: BoxMm, b: BoxMm): BoxMm {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

/** Closest point on segment ab to p and the parameter t ∈ [0,1]. */
export function closestOnSegment(p: PtMm, a: PtMm, b: PtMm): { q: PtMm; t: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { q, t, d: dist(p, q) };
}

/** Closest point on a polyline (closed = includes the wrap edge). */
export function closestOnPolyline(
  p: PtMm,
  pts: readonly PtMm[],
  closed: boolean,
): { q: PtMm; seg: number; d: number } {
  let best = { q: pts[0], seg: 0, d: Infinity };
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const r = closestOnSegment(p, pts[i], pts[(i + 1) % n]);
    if (r.d < best.d) best = { q: r.q, seg: i, d: r.d };
  }
  if (n === 1) best = { q: pts[0], seg: 0, d: dist(p, pts[0]) };
  return best;
}

export function pointInPolygon(p: PtMm, poly: readonly PtMm[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Douglas–Peucker on an open polyline; endpoints kept. */
function dpOpen(pts: readonly PtMm[], eps: number): PtMm[] {
  if (pts.length <= 2) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = -1;
    let wd = eps;
    for (let k = i + 1; k < j; k++) {
      const d = closestOnSegment(pts[k], pts[i], pts[j]).d;
      if (d > wd) {
        wd = d;
        worst = k;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([i, worst], [worst, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/**
 * Remove vertices that deviate less than `eps` from the simplified line, and exact duplicates.
 * Used at eps 0.01 mm — well under the 0.05 mm flattening sagitta — so geometry is unchanged
 * for every purpose; it only keeps collinear runs out of the file (and out of the parser's
 * 4000-point inner budget).
 */
export function simplify(pts: readonly PtMm[], closed: boolean, eps: number): PtMm[] {
  const clean: PtMm[] = [];
  for (const p of pts) {
    const last = clean[clean.length - 1];
    if (!last || dist(last, p) > 1e-9) clean.push(p);
  }
  if (closed && clean.length > 1 && dist(clean[0], clean[clean.length - 1]) <= 1e-9) clean.pop();
  if (!closed) return dpOpen(clean, eps);
  if (clean.length <= 3) return clean;
  // Split the ring at its first vertex and the vertex farthest from it — both are kept.
  let far = 1;
  let fd = -1;
  for (let k = 1; k < clean.length; k++) {
    const d = dist(clean[0], clean[k]);
    if (d > fd) {
      fd = d;
      far = k;
    }
  }
  const a = dpOpen(clean.slice(0, far + 1), eps);
  const b = dpOpen([...clean.slice(far), clean[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Andrew's monotone chain. */
export function convexHull(pts: readonly PtMm[]): PtMm[] {
  const s = [...pts].sort((p, q) => p.x - q.x || p.y - q.y);
  if (s.length < 3) return s;
  const cross = (o: PtMm, a: PtMm, b: PtMm) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: PtMm[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: PtMm[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** area / area(convexHull) — 1.0 for a convex outline. */
export function hullRatio(poly: readonly PtMm[]): number {
  const h = areaOf(convexHull(poly));
  return h > 0 ? areaOf(poly) / h : 1;
}

/** Points along a polyline every `step` mm (vertices included). */
export function sampleAlong(pts: readonly PtMm[], closed: boolean, step: number): PtMm[] {
  const out: PtMm[] = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
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

export function polylineLength(pts: readonly PtMm[], closed: boolean): number {
  let s = 0;
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) s += dist(pts[i], pts[(i + 1) % n]);
  return s;
}

/**
 * Uniform-grid index over the segments of several polylines: nearest-distance queries in
 * O(cells touched) instead of O(all segments). Distances beyond `maxR` report as ≥ maxR.
 */
export class SegmentIndex {
  private cells = new Map<string, number[]>();
  private segs: [PtMm, PtMm][] = [];
  constructor(
    lines: readonly { pts: readonly PtMm[]; closed: boolean }[],
    private cell: number,
  ) {
    for (const l of lines) {
      const n = l.pts.length;
      const segs = l.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = l.pts[i];
        const b = l.pts[(i + 1) % n];
        const id = this.segs.push([a, b]) - 1;
        const x0 = Math.floor(Math.min(a.x, b.x) / cell);
        const x1 = Math.floor(Math.max(a.x, b.x) / cell);
        const y0 = Math.floor(Math.min(a.y, b.y) / cell);
        const y1 = Math.floor(Math.max(a.y, b.y) / cell);
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const k = `${x},${y}`;
            const list = this.cells.get(k);
            if (list) list.push(id);
            else this.cells.set(k, [id]);
          }
        }
      }
    }
  }

  get empty(): boolean {
    return this.segs.length === 0;
  }

  /** Distance to the nearest segment, searching rings up to `maxR`; Infinity when none. */
  nearest(p: PtMm, maxR: number): number {
    return this.nearestFoot(p, maxR).d;
  }

  /** Nearest segment distance and the foot parameter t on it (0/1 = the foot is a vertex). */
  nearestFoot(p: PtMm, maxR: number): { d: number; t: number } {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    const rings = Math.ceil(maxR / this.cell) + 1;
    let best = Infinity;
    let bestT = 0;
    const seen = new Set<number>();
    for (let r = 0; r <= rings; r++) {
      for (let x = cx - r; x <= cx + r; x++) {
        for (let y = cy - r; y <= cy + r; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          const list = this.cells.get(`${x},${y}`);
          if (!list) continue;
          for (const id of list) {
            if (seen.has(id)) continue;
            seen.add(id);
            const [a, b] = this.segs[id];
            const r = closestOnSegment(p, a, b);
            if (r.d < best) {
              best = r.d;
              bestT = r.t;
            }
          }
        }
      }
      // Anything in ring r+1 is at least r·cell away.
      if (best <= r * this.cell) break;
    }
    return { d: best, t: bestT };
  }
}

/** q-quantile (0..1) of a numeric list; NaN for an empty list. */
export function quantile(values: readonly number[], q: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
}
