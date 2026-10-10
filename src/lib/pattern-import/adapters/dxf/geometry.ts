// Flattening primitives, in DRAWING units, tolerance-driven (sagitta). The caller converts the
// contract's 0.05 mm into drawing units through the accumulated transform scale.

import type { Affine, PtMm } from '../../types';

export type P = { x: number; y: number };

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** m1 ∘ m2 (apply m2 first). */
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
export const translate = (x: number, y: number): Affine => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
export const scale = (sx: number, sy: number): Affine => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
export function rotate(rad: number): Affine {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
}
export function apply(m: Affine, p: P): PtMm {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}
/** Linear part applied to a direction. */
export function applyDir(m: Affine, v: P): P {
  return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}
/** Geometric-mean scale of the linear part (for tolerance and text height). */
export function scaleOf(m: Affine): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}
export const det = (m: Affine) => m.a * m.d - m.b * m.c;

/**
 * Arbitrary Axis Algorithm (DXF reference): OCS → WCS for extrusion N, projected to XY.
 * Returns the 2×2 linear map as an Affine (e = f = 0) plus the elevation offset ignored (2D).
 */
export function ocsToWcs(nx: number, ny: number, nz: number): Affine {
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 0)) return IDENTITY;
  nx /= len;
  ny /= len;
  nz /= len;
  if (Math.abs(nx) < 1e-12 && Math.abs(ny) < 1e-12 && nz > 0) return IDENTITY;
  let ax: [number, number, number];
  if (Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64) {
    // Wy × N
    ax = [1 * nz - 0 * ny, 0 * nx - 0 * nz, 0 * ny - 1 * nx];
  } else {
    // Wz × N
    ax = [0 * nz - 1 * ny, 1 * nx - 0 * nz, 0 * ny - 0 * nx];
  }
  const al = Math.hypot(...ax);
  ax = [ax[0] / al, ax[1] / al, ax[2] / al];
  // Ay = N × Ax
  const ay: [number, number, number] = [
    ny * ax[2] - nz * ax[1],
    nz * ax[0] - nx * ax[2],
    nx * ax[1] - ny * ax[0],
  ];
  return { a: ax[0], b: ax[1], c: ay[0], d: ay[1], e: 0, f: 0 };
}

const MAX_SEGS = 4096;

/** Segments so the chord sagitta of a circular arc stays ≤ tol. */
export function arcSegments(r: number, sweepAbs: number, tol: number): number {
  if (!(r > tol) || !(tol > 0)) return Math.max(1, Math.ceil(sweepAbs / (Math.PI / 2)));
  const phi = 2 * Math.acos(Math.max(-1, 1 - tol / r));
  if (!(phi > 0)) return MAX_SEGS;
  return Math.min(MAX_SEGS, Math.max(1, Math.ceil(sweepAbs / phi)));
}

/** Points of an arc from a0 sweeping `sweep` (signed, radians); includes both ends. */
export function arcPts(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  sweep: number,
  tol: number,
): P[] {
  const n = arcSegments(r, Math.abs(sweep), tol);
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Bulge segment p1→p2 (b = tan(θ/4)); appends the points AFTER p1 (p2 included). */
export function bulgeTo(p1: P, p2: P, b: number, tol: number, out: P[]): void {
  if (Math.abs(b) < 1e-12) {
    out.push(p2);
    return;
  }
  const theta = 4 * Math.atan(b);
  const ux = p2.x - p1.x;
  const uy = p2.y - p1.y;
  const k = (1 - b * b) / (4 * b);
  const cx = (p1.x + p2.x) / 2 - k * uy;
  const cy = (p1.y + p2.y) / 2 + k * ux;
  const r = Math.hypot(p1.x - cx, p1.y - cy);
  const a1 = Math.atan2(p1.y - cy, p1.x - cx);
  const pts = arcPts(cx, cy, r, a1, theta, tol);
  for (let i = 1; i < pts.length - 1; i++) out.push(pts[i]);
  out.push(p2); // exact endpoint, no drift
}

/** Vertex list with per-vertex bulges → polyline. Closed: the closing segment is included and the
 * repeated start point dropped. */
export function bulgePolyline(
  v: { x: number; y: number; bulge: number }[],
  closed: boolean,
  tol: number,
): P[] {
  if (v.length === 0) return [];
  const pts: P[] = [{ x: v[0].x, y: v[0].y }];
  const segs = closed ? v.length : v.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    bulgeTo(a, b, a.bulge, tol, pts);
  }
  if (closed && pts.length > 1) pts.pop();
  return pts;
}

/** Ellipse (WCS): centre, major-axis vector, ratio, params t0..t1 (radians), orientation sign
 * (+1 = minor axis is major rotated +90°, −1 for an extrusion pointing down). */
export function ellipsePts(
  c: P,
  maj: P,
  ratio: number,
  t0: number,
  t1: number,
  orient: 1 | -1,
  tol: number,
): { pts: P[]; full: boolean } {
  let sweep = t1 - t0;
  while (sweep <= 1e-12) sweep += 2 * Math.PI;
  const full = Math.abs(sweep - 2 * Math.PI) < 1e-9;
  const a = Math.hypot(maj.x, maj.y);
  const minor = { x: -maj.y * ratio * orient, y: maj.x * ratio * orient };
  const n = Math.max(8, arcSegments(a, sweep, tol));
  const pts: P[] = [];
  const count = full ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const t = t0 + (sweep * i) / n;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    pts.push({ x: c.x + maj.x * ct + minor.x * st, y: c.y + maj.y * ct + minor.y * st });
  }
  return { pts, full };
}

// ── NURBS (weights honoured — 05-CODEX-REVIEW item 8) ────────────────────────────────────────

function findSpan(p: number, knots: number[], nCtrl: number, t: number): number {
  const n = nCtrl - 1;
  if (t >= knots[n + 1]) return n;
  if (t <= knots[p]) return p;
  let lo = p;
  let hi = n + 1;
  let mid = (lo + hi) >> 1;
  for (let guard = 0; guard < 64 && (t < knots[mid] || t >= knots[mid + 1]); guard++) {
    if (t < knots[mid]) hi = mid;
    else lo = mid;
    mid = (lo + hi) >> 1;
  }
  return mid;
}

/** Rational de Boor in homogeneous coordinates. */
export function nurbsAt(p: number, ctrl: P[], w: number[], knots: number[], t: number): P {
  const k = findSpan(p, knots, ctrl.length, t);
  const dx: number[] = [];
  const dy: number[] = [];
  const dw: number[] = [];
  for (let j = 0; j <= p; j++) {
    const idx = Math.min(ctrl.length - 1, Math.max(0, j + k - p));
    const wi = w[idx] ?? 1;
    dx.push(ctrl[idx].x * wi);
    dy.push(ctrl[idx].y * wi);
    dw.push(wi);
  }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = j + k - p;
      const den = knots[i + p - r + 1] - knots[i];
      const al = den === 0 ? 0 : (t - knots[i]) / den;
      dx[j] = (1 - al) * dx[j - 1] + al * dx[j];
      dy[j] = (1 - al) * dy[j - 1] + al * dy[j];
      dw[j] = (1 - al) * dw[j - 1] + al * dw[j];
    }
  }
  const ww = dw[p] || 1;
  return { x: dx[p] / ww, y: dy[p] / ww };
}

/** Adaptive sampling: split a parameter interval until the midpoint lies within tol of the chord. */
export function sampleAdaptive(
  f: (t: number) => P,
  t0: number,
  t1: number,
  nInit: number,
  tol: number,
): P[] {
  const out: P[] = [f(t0)];
  const rec = (a: number, pa: P, b: number, pb: P, depth: number) => {
    const m = (a + b) / 2;
    const pm = f(m);
    const q1 = f(a + (b - a) / 4);
    const q3 = f(a + (3 * (b - a)) / 4);
    const dev = Math.max(distToSeg(pm, pa, pb), distToSeg(q1, pa, pb), distToSeg(q3, pa, pb));
    if (depth >= 14 || dev <= tol) {
      out.push(pb);
      return;
    }
    rec(a, pa, m, pm, depth + 1);
    rec(m, pm, b, pb, depth + 1);
  };
  const n = Math.max(1, nInit);
  let prevT = t0;
  let prevP = out[0];
  for (let i = 1; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const pt = f(t);
    rec(prevT, prevP, t, pt, 0);
    prevT = t;
    prevP = pt;
  }
  return out;
}

export function distToSeg(p: P, a: P, b: P): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  if (l2 <= 1e-24) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/** Centripetal Catmull-Rom through fit points (a SPLINE with fit data only). */
export function catmullRom(pts: P[], closed: boolean, tol: number): P[] {
  const n = pts.length;
  if (n < 3) return [...pts];
  const at = (i: number) =>
    closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))];
  const out: P[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const f = (t: number): P => {
      const t2 = t * t;
      const t3 = t2 * t;
      return {
        x:
          0.5 *
          (2 * p1.x +
            (p2.x - p0.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (p2.y - p0.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
      };
    };
    const seg = sampleAdaptive(f, 0, 1, 1, tol);
    for (let k = i === 0 ? 0 : 1; k < seg.length; k++) out.push(seg[k]);
  }
  if (closed && out.length > 1) out.pop();
  return out;
}

// ── polygon measures (mm) ───────────────────────────────────────────────────────────────────

export function signedArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function bboxOf(pts: P[]): { minX: number; minY: number; maxX: number; maxY: number } {
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

export function pathLength(pts: P[], closed: boolean): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++)
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 2)
    L += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return L;
}

export function pointInPolygon(p: P, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Nearest point on a polyline: distance, segment index and parameter. */
export function nearestOnPolyline(
  p: P,
  pts: P[],
  closed: boolean,
): { dist: number; seg: number; t: number; at: P } {
  let best = { dist: Infinity, seg: -1, t: 0, at: p };
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    let t = l2 <= 1e-24 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2;
    t = Math.max(0, Math.min(1, t));
    const at = { x: a.x + t * vx, y: a.y + t * vy };
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < best.dist) best = { dist: d, seg: i, t, at };
  }
  if (n === 1)
    best = { dist: Math.hypot(p.x - pts[0].x, p.y - pts[0].y), seg: 0, t: 0, at: pts[0] };
  return best;
}

/** Unit tangent of segment `seg` of a polyline. */
export function segDir(pts: P[], seg: number): P {
  const a = pts[seg];
  const b = pts[(seg + 1) % pts.length];
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
}
