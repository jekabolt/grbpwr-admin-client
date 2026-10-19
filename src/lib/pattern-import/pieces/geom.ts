// pieces/ (F4) — planar helpers (own copy: chains/ internals are another lane's). Pure, mm, y-up.
import type { BoxMm, PtMm } from 'lib/pattern-import/types';

export const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

export function polyLen(pts: PtMm[], closed = false): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) L += dist(pts[pts.length - 1], pts[0]);
  return L;
}

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

/** Signed shoelace area (> 0 = counter-clockwise in y-up). */
export function signedArea(pts: readonly PtMm[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return -a / 2;
}

export function pointInPoly(p: PtMm, poly: readonly PtMm[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Douglas–Peucker on an open polyline; keeps both ends. */
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

/** Nearest point on segment ab to p. */
export function segNearest(p: PtMm, a: PtMm, b: PtMm) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let u = L2 > 1e-12 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  const qx = a.x + u * dx;
  const qy = a.y + u * dy;
  return { d: Math.hypot(p.x - qx, p.y - qy), u, q: { x: qx, y: qy } };
}

/** Proper intersection of segments ab and cd: parameters t on ab, u on cd, or null. */
export function segIntersect(a: PtMm, b: PtMm, c: PtMm, d: PtMm) {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, p: { x: a.x + rx * t, y: a.y + ry * t } };
}

/** Uniform grid over polyline segments: (owner, segIndex) per cell. */
export class SegGrid {
  private readonly m = new Map<number, number[]>();
  constructor(readonly cell: number) {}
  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
  addPolyline(owner: number, pts: readonly PtMm[], closed = false) {
    for (let i = 0; i + 1 < pts.length; i++) this.addSeg(owner, i, pts[i], pts[i + 1]);
    if (closed && pts.length > 2) this.addSeg(owner, pts.length - 1, pts[pts.length - 1], pts[0]);
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

/** Points every `step` mm along a polyline (closed polygons include the closing edge). */
export function resample(pts: readonly PtMm[], step: number, closed = false): PtMm[] {
  const out: PtMm[] = [];
  const n = pts.length;
  if (!n) return out;
  const m = closed ? n : n - 1;
  let carry = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const L = dist(a, b);
    if (L < 1e-9) continue;
    let s = carry;
    while (s < L) {
      out.push({ x: a.x + ((b.x - a.x) * s) / L, y: a.y + ((b.y - a.y) * s) / L });
      s += step;
    }
    carry = s - L;
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

export function quantile(a: number[], q: number): number {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}
