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

const cross = (o: PtMm, a: PtMm, b: PtMm) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Two closed-ring edges that are not neighbours cross or touch. */
export function ringSelfIntersects(ring: readonly PtMm[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (
        Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
        Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
        Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
        Math.max(c.y, d.y) < Math.min(a.y, b.y)
      )
        continue;
      const d1 = cross(c, d, a);
      const d2 = cross(c, d, b);
      const d3 = cross(a, b, c);
      const d4 = cross(a, b, d);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
        return true;
    }
  }
  return false;
}
