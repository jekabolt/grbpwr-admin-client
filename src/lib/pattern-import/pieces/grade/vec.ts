// pieces/grade (H1) — small vector / polyline helpers (worker-safe, no node APIs).
import type { BoxMm, PtMm } from 'lib/pattern-import/types';

export type V = PtMm;

export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
export const cross = (a: V, b: V) => a.x * b.y - a.y * b.x;
export const len = (a: V) => Math.hypot(a.x, a.y);
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
export const unit = (a: V): V => {
  const L = len(a) || 1;
  return { x: a.x / L, y: a.y / L };
};

export function polyLen(p: readonly V[]): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += dist(p[i], p[i - 1]);
  return L;
}

export function median(a: readonly number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

export function arcLengths(pts: readonly V[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + dist(pts[i], pts[i - 1]));
  return acc;
}

/** Point at arc length d along pts (acc = arcLengths(pts)). */
export function pointAt(pts: readonly V[], acc: readonly number[], d: number): V {
  if (pts.length === 1) return pts[0];
  let lo = 1;
  let hi = acc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (acc[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = pts[i - 1];
  const b = pts[i];
  const L = acc[i] - acc[i - 1] || 1;
  const u = Math.max(0, Math.min(1, (d - acc[i - 1]) / L));
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** Sub-polyline between arc lengths from..to (clamped); [] when shorter than 0.05 mm. */
export function subPolyline(pts: readonly V[], acc: readonly number[], from: number, to: number): V[] {
  const total = acc[acc.length - 1];
  from = Math.max(0, from);
  to = Math.min(total, to);
  if (to - from < 0.05) return [];
  const out: V[] = [pointAt(pts, acc, from)];
  for (let i = 0; i < pts.length; i++) if (acc[i] > from + 1e-9 && acc[i] < to - 1e-9) out.push(pts[i]);
  out.push(pointAt(pts, acc, to));
  return out;
}

/** Outward unit tangent at an end of a polyline, averaged over `span` mm. */
export function endTangent(pts: readonly V[], end: 0 | 1, span = 3): V {
  const n = pts.length;
  const at = (k: number) => (end ? pts[n - 1 - k] : pts[k]);
  let acc = 0;
  let j = 0;
  while (j + 1 < n && acc < span) {
    acc += dist(at(j), at(j + 1));
    j++;
  }
  return unit(sub(at(0), at(j)));
}

/** Samples every `step` mm (first at step/2) with the local unit tangent and arc position. */
export function resampleT(pts: readonly V[], step: number, phase = 0.5): { p: V; t: V; u: number }[] {
  const out: { p: V; t: V; u: number }[] = [];
  let acc = 0;
  const total = polyLen(pts);
  let next = total < step ? total / 2 : step * phase;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = dist(a, b);
    if (L < 1e-9) continue;
    const t = unit(sub(b, a));
    while (next <= acc + L) {
      const u = (next - acc) / L;
      out.push({ p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, t, u: next });
      next += step;
    }
    acc += L;
  }
  return out;
}

export function bboxOfPts(pts: readonly V[]): BoxMm {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const boxOverlap = (a: BoxMm, b: BoxMm) =>
  !(a.minX > b.maxX || a.maxX < b.minX || a.minY > b.maxY || a.maxY < b.minY);

export const growBox = (b: BoxMm, m: number): BoxMm => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});

export const unionBox = (a: BoxMm, b: BoxMm): BoxMm => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/** Nearest point of a polyline to p: arc position and distance. */
export function projectOn(pts: readonly V[], acc: readonly number[], p: V): { u: number; d: number; i: number } {
  let best = { u: 0, d: Infinity, i: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const ab = sub(pts[i + 1], a);
    const L2 = dot(ab, ab);
    const w = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2));
    const q = { x: a.x + ab.x * w, y: a.y + ab.y * w };
    const d = dist(q, p);
    if (d < best.d) best = { u: acc[i] + w * Math.sqrt(L2), d, i };
  }
  return best;
}
