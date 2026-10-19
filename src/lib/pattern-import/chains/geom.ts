// chains/ (F3) — small planar helpers. Pure, worker-safe, mm.
import type { BoxMm, PtMm } from 'lib/pattern-import/types';

export const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

export function polyLen(pts: PtMm[], closed = false): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) L += dist(pts[pts.length - 1], pts[0]);
  return L;
}

export function bboxOf(pts: PtMm[]): BoxMm {
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

/** Douglas–Peucker; keeps both ends. */
export function simplify(pts: PtMm[], tol: number): PtMm[] {
  if (pts.length < 3 || tol <= 0) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const A = pts[a];
    const B = pts[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy);
    let best = -1;
    let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d =
        L < 1e-9 ? dist(pts[i], A) : Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / L;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > tol) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  const out: PtMm[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** Unit tangent at an end, measured over the last `span` mm of the polyline, pointing OUT of it. */
export function endTangent(pts: PtMm[], end: 0 | 1, span = 3): PtMm | null {
  const n = pts.length;
  if (n < 2) return null;
  const at = (k: number) => (end ? pts[n - 1 - k] : pts[k]);
  const p0 = at(0);
  let acc = 0;
  let j = 0;
  while (j + 1 < n && acc < span) {
    acc += dist(at(j), at(j + 1));
    j++;
  }
  const q = at(j);
  const L = dist(p0, q);
  if (L < 1e-6) return null;
  return { x: (p0.x - q.x) / L, y: (p0.y - q.y) / L };
}

/** Nearest point on segment ab to p: distance, parameter u, and the side sign (cross > 0 = left). */
export function segNearest(p: PtMm, a: PtMm, b: PtMm) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let u = L2 > 1e-12 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  const qx = a.x + u * dx;
  const qy = a.y + u * dy;
  const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
  return { d: Math.hypot(p.x - qx, p.y - qy), u, side: cross > 0 ? 1 : cross < 0 ? -1 : 0 };
}

/**
 * Uniform grid over polyline SEGMENTS: key = cell, value = packed (owner, segIndex). Queries return
 * candidate segments near a point or box; exact distances are the caller's job.
 */
export class SegGrid {
  readonly cell: number;
  private readonly m = new Map<number, number[]>();
  constructor(cell: number) {
    this.cell = cell;
  }
  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
  addPolyline(owner: number, pts: PtMm[]) {
    for (let i = 0; i + 1 < pts.length; i++) this.addSeg(owner, i, pts[i], pts[i + 1]);
  }
  addSeg(owner: number, i: number, a: PtMm, b: PtMm) {
    const c = this.cell;
    const x0 = Math.floor(Math.min(a.x, b.x) / c);
    const x1 = Math.floor(Math.max(a.x, b.x) / c);
    const y0 = Math.floor(Math.min(a.y, b.y) / c);
    const y1 = Math.floor(Math.max(a.y, b.y) / c);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = this.key(x, y);
        const arr = this.m.get(k);
        if (arr) arr.push(owner, i);
        else this.m.set(k, [owner, i]);
      }
  }
  /** Visit (owner, seg) pairs in cells within r of p (duplicates possible). */
  near(p: PtMm, r: number, visit: (owner: number, seg: number) => void) {
    const c = this.cell;
    const x0 = Math.floor((p.x - r) / c);
    const x1 = Math.floor((p.x + r) / c);
    const y0 = Math.floor((p.y - r) / c);
    const y1 = Math.floor((p.y + r) / c);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const arr = this.m.get(this.key(x, y));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 2) visit(arr[k], arr[k + 1]);
      }
  }
}

/** Uniform grid over points (ids). */
export class PtGrid {
  private readonly m = new Map<number, number[]>();
  constructor(readonly cell: number) {}
  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
  add(id: number, p: PtMm) {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.y / this.cell));
    const arr = this.m.get(k);
    if (arr) arr.push(id);
    else this.m.set(k, [id]);
  }
  near(p: PtMm, r: number, visit: (id: number) => void) {
    const c = this.cell;
    for (let x = Math.floor((p.x - r) / c); x <= Math.floor((p.x + r) / c); x++)
      for (let y = Math.floor((p.y - r) / c); y <= Math.floor((p.y + r) / c); y++) {
        const arr = this.m.get(this.key(x, y));
        if (arr) for (const id of arr) visit(id);
      }
  }
}

/** Points every `step` mm along a polyline with the local unit tangent. */
export function resample(pts: PtMm[], step: number): { p: PtMm; t: PtMm; s: number }[] {
  const out: { p: PtMm; t: PtMm; s: number }[] = [];
  let carry = 0;
  let s0 = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = dist(a, b);
    if (L < 1e-9) continue;
    const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    let s = carry;
    while (s <= L) {
      out.push({ p: { x: a.x + t.x * s, y: a.y + t.y * s }, t, s: s0 + s });
      s += step;
    }
    carry = s - L;
    s0 += L;
  }
  if (!out.length && pts.length) out.push({ p: pts[0], t: { x: 1, y: 0 }, s: 0 });
  return out;
}

export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
