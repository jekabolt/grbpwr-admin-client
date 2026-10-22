// The drawn fusing zone as the Rect+ editor holds it (L13, owner OK 22.10, variant 3): ordered
// control points, piece-local mm, Y up. A rectangle opens as exactly 4 sharp corners + 4 straight
// mids (even slots = corners, odd = mids); a mid that sits on its corners' midpoint is «straight»
// and follows them. Other spline rings keep every point's own corner semantics. An untouched
// axis-aligned rectangle is stored as `rect`; anything bent, rotated or rounded is stored as
// `spline`. Plus the per-dialog bus the canvas and the panel share: the clipped area and undo stack.
import type { FuseSplinePoint, FuseZone } from 'lib/fusing-dxf/types';

export type ZonePoint = { x: number; y: number; corner: boolean };
type DrawnZone = Exclude<FuseZone, { dxfPieceKey: string }>;

// Stored points are rounded to 0.1 mm: a straight mid can sit up to ~0.07 mm off its midpoint.
const STRAIGHT_MM = 0.08;
const RING_EPSILON = 1e-9;
const r1 = (v: number) => Math.round(v * 10) / 10;
const midOf = (a: ZonePoint, b: ZonePoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const isDrawnZone = (z: FuseZone | null | undefined): z is DrawnZone =>
  !!z && !('dxfPieceKey' in z);

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
  const points: FuseSplinePoint[] = pts.map((p) => ({ x: r1(p.x), y: r1(p.y), corner: p.corner }));
  return { spline: { points } };
}

/** Every corner slot sharp (sharp=true) or every point round. */
export function withCorners(z: FuseZone | null | undefined, sharp: boolean): DrawnZone | null {
  const pts = zonePoints(z);
  if (!pts.length) return null;
  return storedZone(pts.map((p, i) => ({ ...p, corner: sharp && cornerSlot(i, pts) })));
}
export const allCorners = (z: FuseZone | null | undefined, sharp: boolean) => {
  const pts = zonePoints(z);
  return pts.length > 0 && pts.every((p, i) => p.corner === (sharp && cornerSlot(i, pts)));
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

/** Back to the axis rectangle around the control points. */
export function resetZone(z: FuseZone | null | undefined): DrawnZone | null {
  const pts = zonePoints(z);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    rect: [r1(Math.min(...xs)), r1(Math.min(...ys)), r1(Math.max(...xs)), r1(Math.max(...ys))],
  };
}

// ---------- the per-dialog bus: canvas ↔ panel ----------
export type ZoneBus = {
  /** cm² of the clipped zone; null = the zone is invalid; undefined = not measured (not on canvas). */
  area: (ci: string) => number | null | undefined;
  setArea: (ci: string, cm2: number | null | undefined) => void;
  /** Push the zone as it is before a change. */
  push: (ci: string, zone: FuseZone | null) => void;
  /** The zone before the last change, or undefined when there is nothing to undo. */
  pop: (ci: string) => { zone: FuseZone | null } | undefined;
  canUndo: (ci: string) => boolean;
  subscribe: (fn: () => void) => () => void;
  version: () => number;
};

export function createZoneBus(): ZoneBus {
  const areas = new Map<string, number | null>();
  const hist = new Map<string, (FuseZone | null)[]>();
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
    push: (ci, zone) => {
      hist.set(ci, [...(hist.get(ci) ?? []), zone].slice(-50));
      bump();
    },
    pop: (ci) => {
      const st = hist.get(ci) ?? [];
      if (!st.length) return undefined;
      hist.set(ci, st.slice(0, -1));
      bump();
      return { zone: st[st.length - 1] };
    },
    canUndo: (ci) => (hist.get(ci) ?? []).length > 0,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    version: () => v,
  };
}
