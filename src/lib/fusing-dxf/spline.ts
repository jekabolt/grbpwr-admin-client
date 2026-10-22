// The freeform fusing zone (L13): a closed curve through ordered control points, piece-local mm.
// ONE rule, shared by the canvas editor, the drawn fill, the area and the fusible DXF — and mirrored
// byte for byte by the backend (internal/entity, fusingops) so both sides cut the same shape:
//
//   segment i runs from P[i] to P[i+1] (closed, indices mod N) as a cubic Hermite curve with
//   tangents m[i] = (P[i+1] − P[i−1]) / 2 (uniform Catmull-Rom), and m[i] = 0 at a corner point
//   (a sharp vertex: the curve does not round through it, so a run between two corners is a straight
//   chord and 4 corners + 4 straight mids are exactly a rectangle).
//
// Flattening: each segment is cut into n equal-t steps with n = ceil(sqrt(max|B''| / (8·tol))),
// where B'' is the second derivative of the segment's Bezier form — that bounds the chord error by
// tol (0.5 mm), 1 ≤ n ≤ 64.
import type { PtMm } from 'lib/pattern-import/types';
import type { FuseSplinePoint } from './types';

export const SPLINE_MIN_POINTS = 3;
export const SPLINE_MAX_POINTS = 64;
export const SPLINE_TOLERANCE_MM = 0.5;
const MAX_STEPS = 64;

function tangent(points: readonly FuseSplinePoint[], i: number): PtMm {
  const n = points.length;
  if (points[i].corner) return { x: 0, y: 0 };
  const a = points[(i - 1 + n) % n];
  const b = points[(i + 1) % n];
  return { x: (b.x - a.x) / 2, y: (b.y - a.y) / 2 };
}

/** Steps for one Hermite segment so the chord error stays within tol. */
function stepsOf(p1: PtMm, m1: PtMm, p2: PtMm, m2: PtMm, tol: number): number {
  // Bezier form: b0 = p1, b1 = p1 + m1/3, b2 = p2 − m2/3, b3 = p2; B'' = 6·(second differences).
  const b1 = { x: p1.x + m1.x / 3, y: p1.y + m1.y / 3 };
  const b2 = { x: p2.x - m2.x / 3, y: p2.y - m2.y / 3 };
  const d1 = Math.hypot(p1.x - 2 * b1.x + b2.x, p1.y - 2 * b1.y + b2.y);
  const d2 = Math.hypot(b1.x - 2 * b2.x + p2.x, b1.y - 2 * b2.y + p2.y);
  const curvature = 6 * Math.max(d1, d2);
  const n = Math.ceil(Math.sqrt(curvature / (8 * tol)));
  return Math.max(1, Math.min(MAX_STEPS, Number.isFinite(n) ? n : 1));
}

/** The closed curve as a polyline (no repeated closing point). Fewer than 3 points → as given. */
export function flattenSpline(
  points: readonly FuseSplinePoint[],
  tolMm: number = SPLINE_TOLERANCE_MM,
): PtMm[] {
  const n = points.length;
  if (n < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: PtMm[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const m1 = tangent(points, i);
    const m2 = tangent(points, (i + 1) % n);
    const steps = stepsOf(p1, m1, p2, m2, tolMm);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push({
        x: h00 * p1.x + h10 * m1.x + h01 * p2.x + h11 * m2.x,
        y: h00 * p1.y + h10 * m1.y + h01 * p2.y + h11 * m2.y,
      });
    }
  }
  return out;
}

const INTERSECTION_EPSILON = 1e-12;

function normalizedRing(ring: readonly PtMm[]): PtMm[] | null {
  if (!ring.length) return null;
  let minX = ring[0].x;
  let maxX = ring[0].x;
  let minY = ring[0].y;
  let maxY = ring[0].y;
  for (const point of ring.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const scale = Math.max(maxX - minX, maxY - minY);
  if (scale === 0 || !Number.isFinite(scale)) return null;
  return ring.map((point) => ({ x: (point.x - minX) / scale, y: (point.y - minY) / scale }));
}

const orientation = (a: PtMm, b: PtMm, c: PtMm) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function pointOnSegment(a: PtMm, b: PtMm, point: PtMm): boolean {
  return (
    Math.abs(orientation(a, b, point)) <= INTERSECTION_EPSILON &&
    point.x >= Math.min(a.x, b.x) - INTERSECTION_EPSILON &&
    point.x <= Math.max(a.x, b.x) + INTERSECTION_EPSILON &&
    point.y >= Math.min(a.y, b.y) - INTERSECTION_EPSILON &&
    point.y <= Math.max(a.y, b.y) + INTERSECTION_EPSILON
  );
}

function segmentsIntersect(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (
    ((o1 > INTERSECTION_EPSILON && o2 < -INTERSECTION_EPSILON) ||
      (o1 < -INTERSECTION_EPSILON && o2 > INTERSECTION_EPSILON)) &&
    ((o3 > INTERSECTION_EPSILON && o4 < -INTERSECTION_EPSILON) ||
      (o3 < -INTERSECTION_EPSILON && o4 > INTERSECTION_EPSILON))
  )
    return true;
  return (
    (Math.abs(o1) <= INTERSECTION_EPSILON && pointOnSegment(a, b, c)) ||
    (Math.abs(o2) <= INTERSECTION_EPSILON && pointOnSegment(a, b, d)) ||
    (Math.abs(o3) <= INTERSECTION_EPSILON && pointOnSegment(c, d, a)) ||
    (Math.abs(o4) <= INTERSECTION_EPSILON && pointOnSegment(c, d, b))
  );
}

/** Two closed-ring edges that are not neighbours cross or touch. */
export function ringSelfIntersects(ring: readonly PtMm[]): boolean {
  const points = normalizedRing(ring);
  if (!points || points.length < 3) return false;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) <= INTERSECTION_EPSILON) return true;
    // Adjacent edges may share only their vertex; a reversal overlaps the preceding edge.
    const previous = points[(i - 1 + n) % n];
    if (
      Math.abs(orientation(previous, a, b)) <= INTERSECTION_EPSILON &&
      (previous.x - a.x) * (b.x - a.x) + (previous.y - a.y) * (b.y - a.y) > INTERSECTION_EPSILON
    )
      return true;
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}
