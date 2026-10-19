// Small polygon helpers for the SoM render and the evidence builder. Pure, worker-safe, mm in, mm out.
import type { BoxMm, PtMm } from '../types';

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

/** Absolute area, mm². */
export function areaOf(pts: readonly PtMm[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return Math.abs(a / 2);
}

/** Even-odd point in polygon (the outline is closed implicitly). */
export function inside(p: PtMm, poly: readonly PtMm[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function segDist2(p: PtMm, a: PtMm, b: PtMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + t * dx - p.x;
  const y = a.y + t * dy - p.y;
  return x * x + y * y;
}

/** Distance from a point to the closed outline. */
export function distToOutline(p: PtMm, poly: readonly PtMm[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = segDist2(p, poly[j], poly[i]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function centroidOf(pts: readonly PtMm[]): PtMm {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    a += f;
    cx += (pts[j].x + pts[i].x) * f;
    cy += (pts[j].y + pts[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const b = bboxOf(pts);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/**
 * A point well inside the outline (approximate pole of inaccessibility): grid search, then two
 * refinements around the best cell. The mark goes here, so a concave piece (a sleeve cap, an L) never
 * gets its number outside itself the way a centroid would.
 */
export function labelPoint(poly: readonly PtMm[]): PtMm {
  const b = bboxOf(poly);
  let best = centroidOf(poly);
  let bestD = inside(best, poly) ? distToOutline(best, poly) : -1;
  let cx = (b.minX + b.maxX) / 2;
  let cy = (b.minY + b.maxY) / 2;
  let w = b.maxX - b.minX;
  let h = b.maxY - b.minY;
  for (let round = 0; round < 3; round++) {
    const n = 16;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const p = { x: cx - w / 2 + (w * i) / n, y: cy - h / 2 + (h * j) / n };
        if (!inside(p, poly)) continue;
        const d = distToOutline(p, poly);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
    cx = best.x;
    cy = best.y;
    w /= 4;
    h /= 4;
  }
  return best;
}

/** `n` points evenly spaced along the closed outline. */
export function resample(poly: readonly PtMm[], n: number): PtMm[] {
  const m = poly.length;
  if (m === 0) return [];
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % m];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(l);
    total += l;
  }
  if (total === 0) return [poly[0]];
  const out: PtMm[] = [];
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const want = (total * k) / n;
    while (seg < m - 1 && acc + lens[seg] < want) acc += lens[seg++];
    const a = poly[seg];
    const b = poly[(seg + 1) % m];
    const t = lens[seg] ? (want - acc) / lens[seg] : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** Principal axis angle (radians) of a point cloud. */
export function principalAngle(pts: readonly PtMm[], c: PtMm): number {
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const x = p.x - c.x;
    const y = p.y - c.y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/** p90 of the distances from each point of `a` to the nearest point of `b` (both dense samples). */
export function p90NearDist(a: readonly PtMm[], b: readonly PtMm[]): number {
  const d = a.map((p) => {
    let m = Infinity;
    for (const q of b) {
      const dd = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (dd < m) m = dd;
    }
    return Math.sqrt(m);
  });
  d.sort((x, y) => x - y);
  return d[Math.min(d.length - 1, Math.floor(d.length * 0.9))] ?? Infinity;
}

const reflect = (p: PtMm, c: PtMm, ang: number): PtMm => {
  const cos = Math.cos(2 * ang);
  const sin = Math.sin(2 * ang);
  const x = p.x - c.x;
  const y = p.y - c.y;
  return { x: c.x + x * cos + y * sin, y: c.y + x * sin - y * cos };
};

/**
 * Is the outline mirror-symmetric about some axis through its centroid? Axes tried: principal, its
 * normal, horizontal, vertical. Tolerance relative to the diagonal (1.2 %), so it does not care about
 * scale. A piece drawn half (on fold) is NOT symmetric — that is the fold hint's job.
 */
export function isMirrorSymmetric(poly: readonly PtMm[], tol = 0.012): boolean {
  return mirrorAxis(poly, tol) != null;
}

/** The first axis (through the centroid, angle in radians) the outline is mirror-symmetric about. */
export function mirrorAxis(poly: readonly PtMm[], tol = 0.012): { c: PtMm; angle: number } | null {
  if (poly.length < 3) return null;
  const s = resample(poly, 96);
  const dense = resample(poly, 384);
  const c = centroidOf(poly);
  const b = bboxOf(poly);
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  const pa = principalAngle(s, c);
  for (const ang of [pa, pa + Math.PI / 2, 0, Math.PI / 2]) {
    const r = s.map((p) => reflect(p, c, ang));
    if (p90NearDist(r, dense) <= tol * diag) return { c, angle: ang };
  }
  return null;
}

/** The outline in its principal frame: centroid at 0, principal axis on x. */
function principalFrame(poly: readonly PtMm[], n: number): PtMm[] {
  const s = resample(poly, n);
  const c = centroidOf(poly);
  const a = principalAngle(s, c);
  const cos = Math.cos(-a);
  const sin = Math.sin(-a);
  return s.map((p) => {
    const x = p.x - c.x;
    const y = p.y - c.y;
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  });
}

/**
 * Is `b` the MIRROR image of `a` (and not simply a copy)? Both are put in their principal frames;
 * a mirror twin then matches one of the two reflections better than either rigid placement. A
 * self-symmetric piece matches both ways — it is not a twin signal and returns false.
 */
export function isMirrorTwin(a: readonly PtMm[], b: readonly PtMm[], tol = 0.015): boolean {
  const aa = areaOf(a);
  const ab = areaOf(b);
  if (!aa || Math.abs(aa - ab) / aa > 0.015) return false;
  const fa = principalFrame(a, 96);
  const fb = principalFrame(b, 384);
  const bb = bboxOf(fb);
  const diag = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY);
  const score = (sx: number, sy: number) =>
    p90NearDist(
      fa.map((p) => ({ x: p.x * sx, y: p.y * sy })),
      fb,
    ) / diag;
  const rigid = Math.min(score(1, 1), score(-1, -1));
  const mirror = Math.min(score(-1, 1), score(1, -1));
  return mirror <= tol && rigid > tol;
}
