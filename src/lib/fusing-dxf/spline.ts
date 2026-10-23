// The freeform fusing zone (L13): a closed curve through ordered control points, piece-local mm.
// ONE rule, shared by the canvas editor, the drawn fill, the area and the fusible DXF — and mirrored
// operation for operation by the backend (internal/entity, fusingops) so both sides cut the same
// shape:
//
//   segment i runs from P[i] to P[i+1] (closed, indices mod N) as a cubic Hermite curve with
//   [0,1]-scaled centripetal Catmull-Rom tangents (alpha = 0.5), calculated from the adjacent chord
//   lengths for that segment. A tangent is zero at a corner point (a sharp vertex: the curve does
//   not round through it), so a run between two corners is a straight chord and 4 corners + 4
//   straight mids are exactly a rectangle. A zero-length segment emits only its start point.
//
// Flattening: each segment is cut into n equal-t steps with n = ceil(sqrt(max|B''| / (8·tol))),
// where B'' is the second derivative of the segment's Bezier form — that bounds the chord error by
// tol (0.5 mm), 1 ≤ n ≤ 64.
//
// Exception (flattenZoneSides below): a side between two control points that both sit on the inset
// contour follows the contour instead of the spline.
import type { PtMm } from 'lib/pattern-import/types';
import type { FuseSplinePoint } from './types';

export const SPLINE_MIN_POINTS = 3;
export const SPLINE_MAX_POINTS = 64;
export const SPLINE_TOLERANCE_MM = 0.5;
const MAX_STEPS = 64;

function centripetalTangents(
  points: readonly FuseSplinePoint[],
  i: number,
): { m1: PtMm; m2: PtMm; zeroLength: boolean } {
  const n = points.length;
  const p0 = points[(i - 1 + n) % n];
  const p1 = points[i];
  const p2 = points[(i + 1) % n];
  const p3 = points[(i + 2) % n];
  const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const d23 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const t01 = Math.sqrt(d01);
  const t12 = Math.sqrt(d12);
  const t23 = Math.sqrt(d23);
  if (d12 === 0) return { m1: { x: 0, y: 0 }, m2: { x: 0, y: 0 }, zeroLength: true };
  let m1: PtMm = { x: 0, y: 0 };
  if (!p1.corner) {
    if (d01 === 0) {
      m1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    } else {
      m1 = {
        x: t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12) + (p2.x - p1.x) / t12),
        y: t12 * ((p1.y - p0.y) / t01 - (p2.y - p0.y) / (t01 + t12) + (p2.y - p1.y) / t12),
      };
    }
  }
  let m2: PtMm = { x: 0, y: 0 };
  if (!p2.corner) {
    if (d23 === 0) {
      m2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    } else {
      m2 = {
        x: t12 * ((p2.x - p1.x) / t12 - (p3.x - p1.x) / (t12 + t23) + (p3.x - p2.x) / t23),
        y: t12 * ((p2.y - p1.y) / t12 - (p3.y - p1.y) / (t12 + t23) + (p3.y - p2.y) / t23),
      };
    }
  }
  return { m1, m2, zeroLength: false };
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

/** Segment i of the closed curve (P[i] → P[i+1]) as polyline points, its end point excluded. */
function segmentPoints(points: readonly FuseSplinePoint[], i: number, tolMm: number): PtMm[] {
  const n = points.length;
  const p1 = points[i];
  const p2 = points[(i + 1) % n];
  const { m1, m2, zeroLength } = centripetalTangents(points, i);
  if (zeroLength) return [{ x: p1.x, y: p1.y }];
  const steps = stepsOf(p1, m1, p2, m2, tolMm);
  const out: PtMm[] = [];
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
  return out;
}

/** The closed curve as a polyline (no repeated closing point). Fewer than 3 points → as given. */
export function flattenSpline(
  points: readonly FuseSplinePoint[],
  tolMm: number = SPLINE_TOLERANCE_MM,
): PtMm[] {
  const n = points.length;
  if (n < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: PtMm[] = [];
  for (let i = 0; i < n; i++) out.push(...segmentPoints(points, i, tolMm));
  return out;
}

// ---------- contour-following sides ----------
//
// A side whose two control points both sit on the inset contour (within ZONE_ON_CONTOUR_MM) is the
// contour path itself, not a spline, so a zone can hug an armhole / neckline / hem curve. Nothing is
// stored: "on the contour" is read from the geometry at render / generate time.
//
// Which way round: a zone inside the contour that shares part of its boundary runs along that
// shared part in the same rotational sense as the contour (both interiors on the same side). So the
// contour is oriented like the zone's control polygon and the side runs FORWARD along it from P[i]'s
// projection to P[i+1]'s. A forward run that would pass another on-contour control point is refused
// (that side stays a spline): the zone's points are then not in the contour's cyclic order.

/** Control points this close to the inset contour count as on it (stored points round to 0.1 mm). */
export const ZONE_ON_CONTOUR_MM = 0.5;
const ARC_EPSILON = 1e-9;
const DEDUPE_MM = 1e-6;

export type RingProjection = { p: PtMm; d: number; edge: number; s: number };

const ringArea = (ring: readonly PtMm[]) => {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
};

function cumulative(ring: readonly PtMm[]): number[] {
  const cum = [0];
  for (let i = 1; i <= ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i % ring.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return cum;
}

/** The nearest point of a closed ring, with its edge and its arc position from ring[0]. */
export function projectOnRing(
  q: PtMm,
  ring: readonly PtMm[],
  cum: readonly number[] = cumulative(ring),
): RingProjection {
  let best: RingProjection = { p: { x: q.x, y: q.y }, d: Infinity, edge: 0, s: 0 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ll = abx * abx + aby * aby;
    const t = ll > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.y - a.y) * aby) / ll)) : 0;
    const p = { x: a.x + abx * t, y: a.y + aby * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.d) best = { p, d, edge: i, s: cum[i] + Math.sqrt(ll) * t };
  }
  return best;
}

export type FlatZone = {
  ring: PtMm[];
  /** side[k] = the control segment (P[i] → P[i+1]) ring vertex k belongs to. */
  side: number[];
  /** follows[i] = segment i runs along the contour. */
  follows: boolean[];
};

/**
 * The zone's closed outline: spline sides as flattenSpline, contour-following sides as the contour
 * path. Without a contour (or with no side on it) the ring is exactly flattenSpline's.
 */
export function flattenZoneSides(
  points: readonly FuseSplinePoint[],
  contour?: readonly PtMm[] | null,
  tolMm: number = SPLINE_TOLERANCE_MM,
  onMm: number = ZONE_ON_CONTOUR_MM,
): FlatZone {
  const n = points.length;
  const follows = points.map(() => false);
  const plain = (): FlatZone => {
    if (n < 3) return { ring: flattenSpline(points), side: points.map((_, i) => i), follows };
    const ring: PtMm[] = [];
    const side: number[] = [];
    for (let i = 0; i < n; i++)
      for (const p of segmentPoints(points, i, tolMm)) {
        ring.push(p);
        side.push(i);
      }
    return { ring, side, follows };
  };
  const zoneArea = n >= 3 ? ringArea(points) : 0;
  if (!contour || contour.length < 3 || n < 3 || zoneArea === 0) return plain();
  const contourArea = ringArea(contour);
  if (contourArea === 0) return plain();
  const ring =
    Math.sign(contourArea) === Math.sign(zoneArea) ? [...contour] : [...contour].reverse();
  const cum = cumulative(ring);
  const perimeter = cum[ring.length];
  if (!(perimeter > 0)) return plain();
  const proj = points.map((p) => projectOnRing(p, ring, cum));
  const on = proj.map((p) => p.d <= onMm);
  const ahead = (from: number, to: number) => (((to - from) % perimeter) + perimeter) % perimeter;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (!on[i] || !on[j]) continue;
    const run = ahead(proj[i].s, proj[j].s);
    const blocked = proj.some(
      (p, k) =>
        k !== i &&
        k !== j &&
        on[k] &&
        ahead(proj[i].s, p.s) > ARC_EPSILON &&
        ahead(proj[i].s, p.s) < run - ARC_EPSILON,
    );
    follows[i] = !blocked;
  }
  if (!follows.some(Boolean)) return plain();

  const out: PtMm[] = [];
  const side: number[] = [];
  const push = (p: PtMm, i: number) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) <= DEDUPE_MM) return;
    out.push({ x: p.x, y: p.y });
    side.push(i);
  };
  for (let i = 0; i < n; i++) {
    if (!follows[i]) {
      for (const p of segmentPoints(points, i, tolMm)) push(p, i);
      continue;
    }
    const a = proj[i];
    const run = ahead(a.s, proj[(i + 1) % n].s);
    push(a.p, i);
    for (let k = 1; k <= ring.length; k++) {
      const v = (a.edge + k) % ring.length;
      const f = ahead(a.s, cum[v]);
      if (f <= ARC_EPSILON) continue;
      if (f >= run - ARC_EPSILON) break;
      push(ring[v], i);
    }
  }
  while (
    out.length > 1 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= DEDUPE_MM
  ) {
    out.pop();
    side.pop();
  }
  return { ring: out, side, follows };
}

export const flattenZone = (
  points: readonly FuseSplinePoint[],
  contour?: readonly PtMm[] | null,
  tolMm: number = SPLINE_TOLERANCE_MM,
) => flattenZoneSides(points, contour, tolMm).ring;

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

function normalizedRingPair(a: readonly PtMm[], b: readonly PtMm[]): [PtMm[], PtMm[]] | null {
  if (!a.length || !b.length) return null;
  let minX = a[0].x;
  let maxX = a[0].x;
  let minY = a[0].y;
  let maxY = a[0].y;
  for (const ring of [a, b]) {
    for (const point of ring) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  const scale = Math.max(maxX - minX, maxY - minY);
  if (scale === 0 || !Number.isFinite(scale)) return null;
  const normalize = (ring: readonly PtMm[]) =>
    ring.map((point) => ({ x: (point.x - minX) / scale, y: (point.y - minY) / scale }));
  return [normalize(a), normalize(b)];
}

function pointStrictlyInsideRing(point: PtMm, ring: readonly PtMm[]): boolean {
  let inside = false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (pointOnSegment(a, b, point)) return false;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** Every vertex and edge of `inner` lies strictly inside `outer`; touching is false. */
export function ringStrictlyInside(inner: readonly PtMm[], outer: readonly PtMm[]): boolean {
  const normalized = normalizedRingPair(inner, outer);
  if (!normalized) return false;
  const [a, b] = normalized;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return false;
    }
  }
  return a.every((point) => pointStrictlyInsideRing(point, b));
}

/** Closed rings overlap, touch, or nest. */
export function ringsOverlap(a: readonly PtMm[], b: readonly PtMm[]): boolean {
  const normalized = normalizedRingPair(a, b);
  if (!normalized) return true;
  const [left, right] = normalized;
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      if (
        segmentsIntersect(
          left[i],
          left[(i + 1) % left.length],
          right[j],
          right[(j + 1) % right.length],
        )
      )
        return true;
    }
  }
  return pointStrictlyInsideRing(left[0], right) || pointStrictlyInsideRing(right[0], left);
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
