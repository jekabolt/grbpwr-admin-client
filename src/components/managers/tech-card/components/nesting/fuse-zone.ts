// The drawn fusing zone: ordered control points, piece-local mm, Y up. New zones start as a small
// set of sharp vertices on the inset contour, so all of their sides follow that contour and cover
// the whole piece. Legacy rectangles still open as 4 corners + 4 straight mids, then become a
// spline on their first canvas edit. Plus the per-dialog bus the canvas and the panel share: the
// clipped area and undo stack.
import {
  SPLINE_MAX_POINTS,
  SPLINE_MIN_POINTS,
  flattenZoneSides,
  type FlatZone,
} from 'lib/fusing-dxf/spline';
import { EDGE_CORNER_TURN_DEG } from 'lib/fusing-dxf/edge-runs';
import { ZONE_MAX_HOLES, ZONE_MAX_OUTER_RINGS, zoneRingsMm } from 'lib/fusing-dxf/geometry';
import type { PtMm } from 'lib/pattern-import/types';
import type { FuseSpline, FuseSplinePoint, FuseZone } from 'lib/fusing-dxf/types';

export type ZonePoint = { x: number; y: number; corner: boolean };
type DrawnZone = Exclude<FuseZone, { dxfPieceKey: string }>;
type SplineZone = Extract<FuseZone, { spline: FuseSpline }>;
export type ZoneRingRef = 'main' | `hole:${number}` | `island:${number}`;

// Stored points are rounded to 0.1 mm: a straight mid can sit up to ~0.07 mm off its midpoint.
const STRAIGHT_MM = 0.08;
const RING_EPSILON = 1e-9;
/** Enough anchors for complex pieces without turning a tessellated curve into dozens of handles. */
export const ZONE_SEED_MAX_POINTS = 24;
/** Arc sampled on each side of a vertex when deciding whether it is a physical corner. */
export const ZONE_SEED_CORNER_WINDOW_MM = 5;
/** Width removed when a full outer ring is split into two fuse parts. */
export const ZONE_PART_GAP_MM = 10;
/** A free pocket narrower than this is treated as split clearance, not room for another part. */
export const ZONE_PART_MIN_FREE_RADIUS_MM = 15;
/** A free pocket must also be material relative to the selected outer. */
export const ZONE_PART_MIN_FREE_RATIO = 0.05;
/** Smallest separately stored outer; it must render as at least 1 cm² in the rings list. */
export const ZONE_PART_MIN_RING_AREA_MM2 = 100;
/** A new hole uses this share of the largest free inscribed radius. */
export const ZONE_HOLE_SEED_RATIO = 0.18;
const r1 = (v: number) => Math.round(v * 10) / 10;
const midOf = (a: ZonePoint, b: ZonePoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const isDrawnZone = (z: FuseZone | null | undefined): z is DrawnZone =>
  !!z && !('dxfPieceKey' in z);
export const isSplineZone = (z: FuseZone | null | undefined): z is SplineZone =>
  !!z && 'spline' in z;

const ringIndex = (ref: ZoneRingRef, kind: 'hole' | 'island') => {
  const match = ref.match(new RegExp(`^${kind}:(\\d+)$`));
  return match ? Number(match[1]) : -1;
};

export function zoneRingRefs(z: FuseZone | null | undefined): ZoneRingRef[] {
  if (!isSplineZone(z)) return isDrawnZone(z) ? ['main'] : [];
  return [
    'main',
    ...z.holes.map((_, index) => `hole:${index}` as const),
    ...z.islands.map((_, index) => `island:${index}` as const),
  ];
}

export function zoneRingLabel(z: FuseZone | null | undefined, ref: ZoneRingRef): string {
  if (ref === 'main') return 'main';
  const hole = ringIndex(ref, 'hole');
  if (hole >= 0) return `hole ${hole + 1}`;
  const island = ringIndex(ref, 'island');
  return `part ${(isSplineZone(z) ? z.holes.length : 0) + island + 1}`;
}

/** Rect+ structure: exactly the editor's eight slots, with mid slots never marked as corners. */
export const isRectPlus = (pts: readonly ZonePoint[]) =>
  pts.length === 8 && pts.every((point, i) => i % 2 === 0 || !point.corner);

/** A slot that toggles sharp / round: the even ones of a Rect+ ring, every one otherwise. */
export const cornerSlot = (i: number, pts: readonly ZonePoint[]) => !isRectPlus(pts) || i % 2 === 0;

/** A mid that sits on its corners' midpoint (it follows them while they move). */
export function straightMid(pts: readonly ZonePoint[], i: number): boolean {
  const n = pts.length;
  if (!isRectPlus(pts) || i % 2 === 0) return false;
  const m = midOf(pts[i - 1], pts[(i + 1) % n]);
  return Math.hypot(pts[i].x - m.x, pts[i].y - m.y) <= STRAIGHT_MM;
}

/** Re-centres every straight mid onto its corners (after corners moved). */
export function followMids(pts: ZonePoint[], straight: readonly boolean[]): ZonePoint[] {
  if (!isRectPlus(pts)) return pts;
  const n = pts.length;
  return pts.map((p, i) =>
    i % 2 === 1 && straight[i] ? { ...p, ...midOf(pts[i - 1], pts[(i + 1) % n]) } : p,
  );
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number): ZonePoint[] {
  const c: ZonePoint[] = [
    { x: Math.min(x0, x1), y: Math.min(y0, y1), corner: true },
    { x: Math.max(x0, x1), y: Math.min(y0, y1), corner: true },
    { x: Math.max(x0, x1), y: Math.max(y0, y1), corner: true },
    { x: Math.min(x0, x1), y: Math.max(y0, y1), corner: true },
  ];
  return c.flatMap((p, i) => [p, { ...midOf(p, c[(i + 1) % 4]), corner: false }]);
}

/** The stored zone → editor points (a rect opens as 4 corners + 4 mids). */
export function zonePoints(z: FuseZone | null | undefined): ZonePoint[] {
  if (!isDrawnZone(z)) return [];
  if ('rect' in z) return rectPoints(...z.rect);
  return z.spline.points.map((p) => ({ x: p.x, y: p.y, corner: !!p.corner }));
}

export function zoneRingPoints(z: FuseZone | null | undefined, ref: ZoneRingRef): ZonePoint[] {
  if (ref === 'main') return zonePoints(z);
  if (!isSplineZone(z)) return [];
  const hole = ringIndex(ref, 'hole');
  const island = ringIndex(ref, 'island');
  const spline = hole >= 0 ? z.holes[hole] : island >= 0 ? z.islands[island] : undefined;
  return (spline?.points ?? []).map((p) => ({ x: p.x, y: p.y, corner: !!p.corner }));
}

/** Editor points → the stored zone: an untouched rectangle stays `rect`, the rest is a spline. */
export function storedZone(pts: readonly ZonePoint[]): DrawnZone {
  if (isRectPlus(pts) && pts.every((p, i) => (i % 2 === 0 ? p.corner : straightMid(pts, i)))) {
    const [a, , b, , c, , d] = pts;
    const xs = [a.x, b.x, c.x, d.x];
    const ys = [a.y, b.y, c.y, d.y];
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const on = (v: number, lo: number, hi: number) =>
      Math.abs(v - lo) <= STRAIGHT_MM || Math.abs(v - hi) <= STRAIGHT_MM;
    const axis =
      xs.every((x) => on(x, x0, x1)) &&
      ys.every((y) => on(y, y0, y1)) &&
      // consecutive corners share an x or a y (not a bow tie of the same four values)
      [a, b, c, d].every((p, i, cs) => {
        const q = cs[(i + 1) % 4];
        return Math.abs(p.x - q.x) <= STRAIGHT_MM || Math.abs(p.y - q.y) <= STRAIGHT_MM;
      });
    if (axis) return { rect: [r1(x0), r1(y0), r1(x1), r1(y1)] };
  }
  return splineZone(pts);
}

/** Editor points → a spline even when they still happen to form a legacy axis-aligned rectangle. */
export function splineZone(
  pts: readonly ZonePoint[],
  rings: Pick<SplineZone, 'holes' | 'islands'> = { holes: [], islands: [] },
): SplineZone {
  const points: FuseSplinePoint[] = pts.map((p) => ({ x: r1(p.x), y: r1(p.y), corner: p.corner }));
  return { spline: { points }, holes: rings.holes, islands: rings.islands };
}

const splineOfPoints = (pts: readonly ZonePoint[]): FuseSpline => ({
  points: pts.map((p) => ({ x: r1(p.x), y: r1(p.y), corner: p.corner })),
});

/** Replaces one ring without touching the others; editing a legacy rect promotes it to a spline. */
export function withZoneRingPoints(
  z: FuseZone | null | undefined,
  ref: ZoneRingRef,
  pts: readonly ZonePoint[],
): SplineZone | null {
  if (ref === 'main')
    return splineZone(pts, isSplineZone(z) ? { holes: z.holes, islands: z.islands } : undefined);
  if (!isSplineZone(z)) return null;
  const hole = ringIndex(ref, 'hole');
  if (hole >= 0 && hole < z.holes.length)
    return {
      ...z,
      holes: z.holes.map((ring, index) => (index === hole ? splineOfPoints(pts) : ring)),
    };
  const island = ringIndex(ref, 'island');
  if (island >= 0 && island < z.islands.length)
    return {
      ...z,
      islands: z.islands.map((ring, index) => (index === island ? splineOfPoints(pts) : ring)),
    };
  return null;
}

export function deleteZoneRing(
  z: FuseZone | null | undefined,
  ref: ZoneRingRef,
): SplineZone | null {
  if (!isSplineZone(z) || ref === 'main') return null;
  const hole = ringIndex(ref, 'hole');
  if (hole >= 0 && hole < z.holes.length)
    return { ...z, holes: z.holes.filter((_, index) => index !== hole) };
  const island = ringIndex(ref, 'island');
  if (island >= 0 && island < z.islands.length) {
    const removed = zoneRingOutline(z, ref).ring;
    return {
      ...z,
      islands: z.islands.filter((_, index) => index !== island),
      // Holes owned by this material patch disappear with it; retaining them would make the flat
      // wire list invalid because they would no longer have exactly one outer owner.
      holes: z.holes.filter((_, index) => {
        const hole = zoneRingOutline(z, `hole:${index}`).ring;
        return !hole.length || !pointInOrOnRing(hole[0], removed);
      }),
    };
  }
  return null;
}

type ArcCorner = { index: number; at: number; turn: number };

const arcGap = (a: number, b: number, perimeter: number) => {
  const along = Math.abs(a - b);
  return Math.min(along, perimeter - along);
};

/** A point at a wrapped arc-length position on a closed polyline. */
function pointAtArc(
  ring: readonly PtMm[],
  distanceAt: readonly number[],
  perimeter: number,
  at: number,
): PtMm {
  const target = ((at % perimeter) + perimeter) % perimeter;
  let low = 0;
  let high = ring.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (distanceAt[middle] <= target) low = middle;
    else high = middle;
  }
  const a = ring[low];
  const b = ring[(low + 1) % ring.length];
  const length = distanceAt[low + 1] - distanceAt[low];
  const t = length > RING_EPSILON ? (target - distanceAt[low]) / length : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Physical corners of a tessellated outline. The turn is measured between points a short arc
 * distance before and after every vertex, so a rounded/split CAD corner accumulates while the many
 * tiny turns of a smooth curve stay below the threshold. Non-max suppression then leaves one
 * handle at the strongest vertex of each corner neighbourhood.
 */
function arcCorners(
  ring: readonly PtMm[],
  distanceAt: readonly number[],
  perimeter: number,
): ArcCorner[] {
  // On unusually small pieces, keep the probe local enough that it cannot span much of the ring.
  const window = Math.min(ZONE_SEED_CORNER_WINDOW_MM, perimeter / 12);
  if (!(window > RING_EPSILON)) return [];
  const ranked = ring
    .map((point, index): ArcCorner => {
      const before = pointAtArc(ring, distanceAt, perimeter, distanceAt[index] - window);
      const after = pointAtArc(ring, distanceAt, perimeter, distanceAt[index] + window);
      const incoming = { x: point.x - before.x, y: point.y - before.y };
      const outgoing = { x: after.x - point.x, y: after.y - point.y };
      const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
      const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
      return {
        index,
        at: distanceAt[index],
        turn: (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI,
      };
    })
    .filter((candidate) => candidate.turn > EDGE_CORNER_TURN_DEG)
    .sort((a, b) => b.turn - a.turn || a.index - b.index);

  const kept: ArcCorner[] = [];
  for (const candidate of ranked) {
    if (kept.every((other) => arcGap(candidate.at, other.at, perimeter) > window)) {
      kept.push(candidate);
    }
  }
  return kept;
}

/**
 * The inset contour → the initial full-fill zone. Vertices whose accumulated turn over a short
 * arc exceeds the shared edge-run threshold are kept as significant corners, with one local
 * maximum per corner. A contour with fewer than three such corners is completed with far-apart
 * existing contour vertices; an unusually busy contour keeps its strongest corners. Every stored
 * point is sharp and remains on the contour after the normal 0.1 mm wire rounding (within the
 * 0.5 mm contour-follow tolerance).
 */
export function seedZone(contour: readonly PtMm[]): DrawnZone | null {
  const ring = contour.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(point.x - contour[index - 1].x, point.y - contour[index - 1].y) > RING_EPSILON,
  );
  if (
    ring.length > 1 &&
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) <=
      RING_EPSILON
  )
    ring.pop();
  if (ring.length < SPLINE_MIN_POINTS) return null;

  const distanceAt = [0];
  for (let index = 1; index <= ring.length; index++) {
    const previous = ring[index - 1];
    const point = ring[index % ring.length];
    distanceAt.push(distanceAt[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
  }
  const perimeter = distanceAt[ring.length];
  if (!(perimeter > 0)) return null;
  const selected = new Set(
    arcCorners(ring, distanceAt, perimeter)
      .slice(0, ZONE_SEED_MAX_POINTS)
      .map((corner) => corner.index),
  );
  if (!selected.size) selected.add(0);
  while (selected.size < SPLINE_MIN_POINTS) {
    let best = -1;
    let bestGap = -1;
    for (let index = 0; index < ring.length; index++) {
      if (selected.has(index)) continue;
      const gap = Math.min(
        ...[...selected].map((other) => arcGap(distanceAt[index], distanceAt[other], perimeter)),
      );
      if (gap > bestGap) {
        best = index;
        bestGap = gap;
      }
    }
    if (best < 0) return null;
    selected.add(best);
  }

  return splineZone(
    [...selected].sort((a, b) => a - b).map((index) => ({ ...ring[index], corner: true })),
  );
}

/**
 * The zone's outline as it is drawn and cut, piece-local mm (the generator's zoneRingMm rule): a
 * rect is its rectangle; a spline side between two points on the inset contour follows the contour.
 */
export function zoneOutline(
  z: FuseZone | null | undefined,
  contourMm?: readonly PtMm[] | null,
): FlatZone {
  return zoneRingOutline(z, 'main', contourMm);
}

export function zoneRingOutline(
  z: FuseZone | null | undefined,
  ref: ZoneRingRef,
  contourMm?: readonly PtMm[] | null,
): FlatZone {
  const pts = zoneRingPoints(z, ref);
  const outer = ref === 'main' || ref.startsWith('island:');
  return flattenZoneSides(pts, isSplineZone(z) && outer ? contourMm : null);
}

/** A round point inserted after control point `side` (on that side); null at the point cap. */
export function insertZonePoint(
  pts: readonly ZonePoint[],
  side: number,
  at: XY,
): ZonePoint[] | null {
  if (pts.length >= SPLINE_MAX_POINTS || side < 0 || side >= pts.length) return null;
  return [...pts.slice(0, side + 1), { x: at.x, y: at.y, corner: false }, ...pts.slice(side + 1)];
}

/** Control point i removed; null when the zone would drop below its minimum of points. */
export function removeZonePoint(pts: readonly ZonePoint[], i: number): ZonePoint[] | null {
  if (pts.length <= SPLINE_MIN_POINTS || i < 0 || i >= pts.length) return null;
  return pts.filter((_, k) => k !== i);
}

/** Every corner slot sharp (sharp=true) or every point round. */
export function withCorners(
  z: FuseZone | null | undefined,
  sharp: boolean,
  ref: ZoneRingRef = 'main',
): DrawnZone | null {
  const pts = zoneRingPoints(z, ref);
  if (!pts.length) return null;
  return withZoneRingPoints(
    z,
    ref,
    pts.map((p) => ({ ...p, corner: sharp })),
  );
}
export const allCorners = (
  z: FuseZone | null | undefined,
  sharp: boolean,
  ref: ZoneRingRef = 'main',
) => {
  const pts = zoneRingPoints(z, ref);
  return pts.length > 0 && pts.every((p) => p.corner === sharp);
};

type XY = { x: number; y: number };

const orientation = (a: XY, b: XY, c: XY) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function pointOnSegment(point: XY, a: XY, b: XY): boolean {
  return (
    Math.abs(orientation(a, b, point)) <= RING_EPSILON &&
    point.x >= Math.min(a.x, b.x) - RING_EPSILON &&
    point.x <= Math.max(a.x, b.x) + RING_EPSILON &&
    point.y >= Math.min(a.y, b.y) - RING_EPSILON &&
    point.y <= Math.max(a.y, b.y) + RING_EPSILON
  );
}

function pointInOrOnRing(point: XY, ring: readonly XY[]): boolean {
  if (ring.some((a, i) => pointOnSegment(point, a, ring[(i + 1) % ring.length]))) return true;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/**
 * Keeps a whole move/rotation rigid: if its final position crosses the inset ring, reduce the
 * transform amount until every control point is on or inside it.
 */
export function clampZoneTransform<T extends XY>(
  points: readonly T[],
  ring: readonly XY[],
  transform: (point: T, amount: number) => T,
): T[] {
  if (ring.length < 3 || !points.length) return points.map((point) => transform(point, 1));
  const fits = (amount: number) =>
    points.every((point) => pointInOrOnRing(transform(point, amount), ring));
  if (fits(1)) return points.map((point) => transform(point, 1));
  // A historical zone can already overhang its inset contour. A group gesture must not make that
  // geometry less recoverable, so leave it in place for its handles to repair.
  if (!fits(0)) return points.map((point) => ({ ...point }));
  let low = 0;
  let high = 1;
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return points.map((point) => transform(point, low));
}

const distanceToRing = (point: XY, ring: readonly XY[]) => {
  let best = Infinity;
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const length2 = ab.x * ab.x + ab.y * ab.y;
    const t =
      length2 > 0
        ? Math.max(0, Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / length2))
        : 0;
    best = Math.min(best, Math.hypot(point.x - a.x - ab.x * t, point.y - a.y - ab.y * t));
  }
  return best;
};

/** Approximate pole of inaccessibility for a free region, refined from a regular search grid. */
function largestFreeCircle(
  container: readonly XY[],
  forbidden: readonly (readonly XY[])[],
): { centre: XY; radius: number } | null {
  if (container.length < 3) return null;
  const xs = container.map((point) => point.x);
  const ys = container.map((point) => point.y);
  const box = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
  const clearance = (point: XY) => {
    if (!pointInOrOnRing(point, container)) return -Infinity;
    if (forbidden.some((ring) => pointInOrOnRing(point, ring))) return -Infinity;
    return Math.min(
      distanceToRing(point, container),
      ...forbidden.map((ring) => distanceToRing(point, ring)),
    );
  };
  let best: { centre: XY; radius: number } = { centre: container[0], radius: -Infinity };
  const consider = (centre: XY) => {
    const radius = clearance(centre);
    if (Number.isFinite(radius) && radius > best.radius) best = { centre, radius };
  };
  consider({
    x: container.reduce((sum, point) => sum + point.x, 0) / container.length,
    y: container.reduce((sum, point) => sum + point.y, 0) / container.length,
  });
  const divisions = 28;
  for (let y = 0; y <= divisions; y++) {
    for (let x = 0; x <= divisions; x++) {
      consider({
        x: box.minX + ((box.maxX - box.minX) * x) / divisions,
        y: box.minY + ((box.maxY - box.minY) * y) / divisions,
      });
    }
  }
  if (!Number.isFinite(best.radius)) return null;
  let step = Math.max(box.maxX - box.minX, box.maxY - box.minY) / divisions;
  for (let pass = 0; pass < 7; pass++) {
    const origin: XY = { ...best.centre };
    for (const dx of [-step, 0, step])
      for (const dy of [-step, 0, step]) consider({ x: origin.x + dx, y: origin.y + dy });
    step /= 2;
  }
  return best;
}

function roundSeed(
  circle: { centre: XY; radius: number },
  radiusOf: (freeRadius: number) => number,
): FuseSpline | null {
  // Four round controls produce a compact, circle-like Catmull-Rom loop. Leave a wide clearance
  // margin for the curve's overshoot and the wire's 0.1 mm rounding.
  const radius = radiusOf(circle.radius);
  if (!(radius >= 1)) return null;
  const { x, y } = circle.centre;
  return splineOfPoints([
    { x: x + radius, y, corner: false },
    { x, y: y + radius, corner: false },
    { x: x - radius, y, corner: false },
    { x, y: y - radius, corner: false },
  ]);
}

const ringCentroid = (ring: readonly XY[]): XY => {
  let crossSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < ring.length; index++) {
    const point = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = point.x * next.y - next.x * point.y;
    crossSum += cross;
    xSum += (point.x + next.x) * cross;
    ySum += (point.y + next.y) * cross;
  }
  if (Math.abs(crossSum) > RING_EPSILON)
    return { x: xSum / (3 * crossSum), y: ySum / (3 * crossSum) };
  return {
    x: ring.reduce((sum, point) => sum + point.x, 0) / ring.length,
    y: ring.reduce((sum, point) => sum + point.y, 0) / ring.length,
  };
};

/** Principal direction of the outline, independent of a rotated pattern piece's sheet axes. */
const longAxis = (ring: readonly XY[], centre: XY): XY => {
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of ring) {
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

const along = (point: XY, centre: XY, axis: XY) =>
  (point.x - centre.x) * axis.x + (point.y - centre.y) * axis.y;

type SplitVertex = XY & { source: number | null; cut: boolean };

/** Clips one polygon against one side of a line perpendicular to its long axis. */
function clipAt(
  flat: FlatZone,
  centre: XY,
  axis: XY,
  limit: number,
  keepBelow: boolean,
): SplitVertex[] {
  const inside = (value: number) =>
    keepBelow ? value <= limit + RING_EPSILON : value >= limit - RING_EPSILON;
  const out: SplitVertex[] = [];
  const push = (point: SplitVertex) => {
    const previous = out[out.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) <= RING_EPSILON) {
      previous.source ??= point.source;
      previous.cut ||= point.cut;
      return;
    }
    out.push(point);
  };
  const { ring, side } = flat;
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const av = along(a, centre, axis);
    const bv = along(b, centre, axis);
    const aInside = inside(av);
    const bInside = inside(bv);
    if (aInside)
      push({
        ...a,
        source: side[index] !== side[(index - 1 + side.length) % side.length] ? side[index] : null,
        cut: Math.abs(av - limit) <= STRAIGHT_MM,
      });
    if (aInside === bInside) continue;
    const t = (limit - av) / (bv - av);
    push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      source: null,
      cut: true,
    });
  }
  if (
    out.length > 1 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= RING_EPSILON
  ) {
    const last = out.pop()!;
    out[0].source ??= last.source;
    out[0].cut ||= last.cut;
  }
  return out;
}

/** Removes the least significant non-cut vertices until the stored spline fits its hard cap. */
function limitSplitPoints(points: ZonePoint[], cutAt: number, centre: XY, axis: XY): ZonePoint[] {
  const result = [...points];
  while (result.length > SPLINE_MAX_POINTS) {
    let remove = -1;
    let smallest = Infinity;
    for (let index = 0; index < result.length; index++) {
      const point = result[index];
      if (Math.abs(along(point, centre, axis) - cutAt) <= STRAIGHT_MM) continue;
      const previous = result[(index - 1 + result.length) % result.length];
      const next = result[(index + 1) % result.length];
      const significance = Math.abs(orientation(previous, point, next));
      if (significance < smallest) {
        smallest = significance;
        remove = index;
      }
    }
    if (remove < 0) return [];
    result.splice(remove, 1);
  }
  return result;
}

/**
 * Rebuilds a clipped half from the selected ring's controls, not its tessellated display outline.
 * The two intersections become sharp controls and a midpoint pins the new cut edge straight. Any
 * old cut midpoint is a source control, so a later split also keeps the earlier gap open.
 */
function splitSpline(
  ring: readonly SplitVertex[],
  source: readonly ZonePoint[],
  cutAt: number,
  centre: XY,
  axis: XY,
): FuseSpline | null {
  if (ring.length < SPLINE_MIN_POINTS) return null;
  const rounded = ring
    .filter((point) => point.source != null || point.cut)
    .map((point) => ({
      x: r1(point.x),
      y: r1(point.y),
      corner: point.source == null ? true : source[point.source]?.corner !== false,
      cut: point.cut,
    }))
    .filter(
      (point, index, points) =>
        index === 0 ||
        Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > RING_EPSILON,
    );
  if (
    rounded.length > 1 &&
    Math.hypot(
      rounded[0].x - rounded[rounded.length - 1].x,
      rounded[0].y - rounded[rounded.length - 1].y,
    ) <= RING_EPSILON
  )
    rounded.pop();
  const points: ZonePoint[] = [];
  for (let index = 0; index < rounded.length; index++) {
    const point = rounded[index];
    const next = rounded[(index + 1) % rounded.length];
    points.push({ x: point.x, y: point.y, corner: point.corner });
    if (point.cut && next.cut) {
      points.push({
        ...midOf({ x: point.x, y: point.y, corner: true }, { x: next.x, y: next.y, corner: true }),
        corner: true,
      });
    }
  }
  const limited = limitSplitPoints(points, cutAt, centre, axis);
  return limited.length >= SPLINE_MIN_POINTS ? splineOfPoints(limited) : null;
}

/**
 * Splits the selected outer into two rings separated by a transverse strip. The midpoint stored on
 * each new cut edge keeps that edge straight: its endpoints may sit on the piece contour, but the
 * midpoint does not, so the contour-follow rule cannot close the gap around the other half.
 */
function splitZoneOuter(
  z: SplineZone,
  outerRef: ZoneRingRef,
  contourMm: readonly PtMm[],
): { zone: SplineZone; ref: ZoneRingRef } | null {
  if (outerRef !== 'main' && !outerRef.startsWith('island:')) return null;
  const selectedFlat = zoneRingOutline(z, outerRef, contourMm);
  const selected = selectedFlat.ring;
  if (selected.length < SPLINE_MIN_POINTS) return null;
  const source = zoneRingPoints(z, outerRef);
  const centre = ringCentroid(selected);
  const axis = longAxis(selected, centre);
  const extents = selected.map((point) => along(point, centre, axis));
  const span = Math.max(...extents) - Math.min(...extents);
  const gap = Math.min(ZONE_PART_GAP_MM, span / 3);
  if (!(gap >= 2)) return null;
  const low = -gap / 2;
  const high = gap / 2;
  const lowerRing = clipAt(selectedFlat, centre, axis, low, true);
  const upperRing = clipAt(selectedFlat, centre, axis, high, false);
  const lower = splitSpline(lowerRing, source, low, centre, axis);
  const upper = splitSpline(upperRing, source, high, centre, axis);
  if (!lower || !upper) return null;

  const keptHoles = z.holes.filter((_, index) => {
    const ref = `hole:${index}` as const;
    if (outerRefForHole(z, ref, contourMm) !== outerRef) return true;
    const ring = zoneRingOutline(z, ref).ring;
    if (ring.length < SPLINE_MIN_POINTS) return false;
    const coordinates = ring.map((point) => along(point, centre, axis));
    const belongsLower =
      Math.max(...coordinates) < low - RING_EPSILON &&
      ring.every((point) => pointInOrOnRing(point, lowerRing));
    const belongsUpper =
      Math.min(...coordinates) > high + RING_EPSILON &&
      ring.every((point) => pointInOrOnRing(point, upperRing));
    return belongsLower || belongsUpper;
  });
  const islandIndex = ringIndex(outerRef, 'island');
  const islands =
    outerRef === 'main'
      ? [...z.islands, upper]
      : [...z.islands.map((ring, index) => (index === islandIndex ? lower : ring)), upper];
  const zone: SplineZone = {
    ...z,
    spline: outerRef === 'main' ? lower : z.spline,
    holes: keptHoles,
    islands,
  };
  try {
    zoneRingsMm(zone, contourMm);
  } catch {
    return null;
  }
  return { zone, ref: `island:${islands.length - 1}` };
}

export function outerRefForHole(
  z: FuseZone | null | undefined,
  holeRef: ZoneRingRef,
  contourMm?: readonly PtMm[] | null,
): ZoneRingRef | null {
  if (!isSplineZone(z) || !holeRef.startsWith('hole:')) return null;
  const hole = zoneRingOutline(z, holeRef).ring;
  if (!hole.length) return null;
  const outers = zoneRingRefs(z).filter((ref) => ref === 'main' || ref.startsWith('island:'));
  return (
    outers.find((ref) => pointInOrOnRing(hole[0], zoneRingOutline(z, ref, contourMm).ring)) ?? null
  );
}

/** Adds a small round cut-out in the selected outer ring's largest free area. */
export function addZoneHole(
  z: FuseZone | null | undefined,
  outerRef: ZoneRingRef,
  contourMm?: readonly PtMm[] | null,
): { zone: SplineZone; ref: ZoneRingRef } | null {
  if (
    !isSplineZone(z) ||
    z.holes.length >= ZONE_MAX_HOLES ||
    (outerRef !== 'main' && !outerRef.startsWith('island:'))
  )
    return null;
  const outer = zoneRingOutline(z, outerRef, contourMm).ring;
  const holes = z.holes
    .map((_, index) => zoneRingOutline(z, `hole:${index}`).ring)
    .filter((ring) => ring.length >= 3 && pointInOrOnRing(ring[0], outer));
  const circle = largestFreeCircle(outer, holes);
  const hole = circle && roundSeed(circle, (freeRadius) => freeRadius * ZONE_HOLE_SEED_RATIO);
  if (!hole) return null;
  const index = z.holes.length;
  return { zone: { ...z, holes: [...z.holes, hole] }, ref: `hole:${index}` };
}

/** Adds a small disjoint outer ring in the largest free part of the inset piece. */
export function addZoneIsland(
  z: FuseZone | null | undefined,
  contourMm: readonly PtMm[],
  selectedOuter: ZoneRingRef = 'main',
): { zone: SplineZone; ref: ZoneRingRef } | null {
  if (!isSplineZone(z) || 1 + z.islands.length >= ZONE_MAX_OUTER_RINGS) return null;
  const outerRefs = ['main' as const, ...z.islands.map((_, index) => `island:${index}` as const)];
  const outers = outerRefs.map((ref) => zoneRingOutline(z, ref, contourMm).ring);
  const circle = largestFreeCircle(contourMm, outers);
  const selected = zoneRingOutline(z, selectedOuter, contourMm).ring;
  const areaOf = (ring: readonly XY[]) => {
    let twice = 0;
    for (let index = 0; index < ring.length; index++) {
      const point = ring[index];
      const next = ring[(index + 1) % ring.length];
      twice += point.x * next.y - next.x * point.y;
    }
    return Math.abs(twice / 2);
  };
  const freeArea = Math.max(
    0,
    areaOf(contourMm) - outers.reduce((sum, ring) => sum + areaOf(ring), 0),
  );
  const selectedArea = areaOf(selected);
  const usablePocket =
    circle &&
    circle.radius >= ZONE_PART_MIN_FREE_RADIUS_MM &&
    freeArea >= selectedArea * ZONE_PART_MIN_FREE_RATIO;
  const island = usablePocket && roundSeed(circle, (freeRadius) => Math.min(12, freeRadius * 0.5));
  if (island) {
    const ringArea = areaOf(flattenZoneSides(island.points).ring);
    const index = z.islands.length;
    const zone = { ...z, islands: [...z.islands, island] };
    if (ringArea >= ZONE_PART_MIN_RING_AREA_MM2) {
      try {
        zoneRingsMm(zone, contourMm);
        return { zone, ref: `island:${index}` };
      } catch {
        // The pocket can be broad but topologically unavailable (for example, inside an outer).
      }
    }
  }
  return splitZoneOuter(z, selectedOuter, contourMm);
}

// ---------- the per-dialog bus: canvas ↔ panel ----------
export type ZoneBus = {
  /** cm² of the clipped zone; null = the zone is invalid; undefined = not measured (not on canvas). */
  area: (ci: string) => number | null | undefined;
  setArea: (ci: string, cm2: number | null | undefined) => void;
  ringAreas: (ci: string) => Partial<Record<ZoneRingRef, number | null>>;
  setRingAreas: (
    ci: string,
    areas: Partial<Record<ZoneRingRef, number | null>> | undefined,
  ) => void;
  contour: (ci: string) => readonly PtMm[] | undefined;
  setContour: (ci: string, contour: readonly PtMm[] | undefined) => void;
  selected: (ci: string) => ZoneRingRef;
  select: (ci: string, ref: ZoneRingRef) => void;
  /** Records one complete zone mutation and changes ring selection in the same history event. */
  commit: (
    ci: string,
    zone: FuseZone | null,
    selected?: ZoneRingRef,
    nextSelected?: ZoneRingRef,
  ) => void;
  /** Restores the selection attached to the previous zone and returns that zone. */
  undo: (ci: string) => { zone: FuseZone | null; selected: ZoneRingRef } | undefined;
  canUndo: (ci: string) => boolean;
  subscribe: (fn: () => void) => () => void;
  version: () => number;
};

export function createZoneBus(): ZoneBus {
  const areas = new Map<string, number | null>();
  const ringAreaMap = new Map<string, Partial<Record<ZoneRingRef, number | null>>>();
  const contours = new Map<string, readonly PtMm[]>();
  const selections = new Map<string, ZoneRingRef>();
  const hist = new Map<string, { zone: FuseZone | null; selected: ZoneRingRef }[]>();
  const subs = new Set<() => void>();
  let v = 0;
  const bump = () => {
    v++;
    subs.forEach((f) => f());
  };
  return {
    area: (ci) => areas.get(ci),
    setArea: (ci, cm2) => {
      if (areas.get(ci) === cm2 && (cm2 !== undefined || !areas.has(ci))) return;
      if (cm2 === undefined) areas.delete(ci);
      else areas.set(ci, cm2);
      bump();
    },
    ringAreas: (ci) => ringAreaMap.get(ci) ?? {},
    setRingAreas: (ci, next) => {
      const previous = ringAreaMap.get(ci);
      if (next === undefined) {
        if (!previous) return;
        ringAreaMap.delete(ci);
      } else {
        const same =
          previous &&
          Object.keys(previous).length === Object.keys(next).length &&
          Object.entries(next).every(([key, value]) => previous[key as ZoneRingRef] === value);
        if (same) return;
        ringAreaMap.set(ci, next);
      }
      bump();
    },
    contour: (ci) => contours.get(ci),
    setContour: (ci, contour) => {
      if (contour === undefined) {
        if (!contours.has(ci)) return;
        contours.delete(ci);
      } else {
        const previous = contours.get(ci);
        if (
          previous?.length === contour.length &&
          contour.every(
            (point, index) => point.x === previous[index].x && point.y === previous[index].y,
          )
        )
          return;
        contours.set(
          ci,
          contour.map((point) => ({ ...point })),
        );
      }
      bump();
    },
    selected: (ci) => selections.get(ci) ?? 'main',
    select: (ci, ref) => {
      if ((selections.get(ci) ?? 'main') === ref) return;
      selections.set(ci, ref);
      bump();
    },
    commit: (ci, zone, selected, nextSelected) => {
      const previousSelected = selected ?? selections.get(ci) ?? 'main';
      hist.set(ci, [...(hist.get(ci) ?? []), { zone, selected: previousSelected }].slice(-50));
      selections.set(ci, nextSelected ?? previousSelected);
      bump();
    },
    undo: (ci) => {
      const st = hist.get(ci) ?? [];
      if (!st.length) return undefined;
      hist.set(ci, st.slice(0, -1));
      selections.set(ci, st[st.length - 1].selected);
      bump();
      return st[st.length - 1];
    },
    canUndo: (ci) => (hist.get(ci) ?? []).length > 0,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    version: () => v,
  };
}
