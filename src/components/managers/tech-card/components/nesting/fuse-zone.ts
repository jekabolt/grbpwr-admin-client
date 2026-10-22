// The drawn fusing zone as the Rect+ editor holds it (L13, owner OK 22.10, variant 3): ordered
// control points, piece-local mm, Y up. A rectangle opens as 4 sharp corners + 4 straight mids
// (even slots = corners, odd = mids); a mid that sits on its corners' midpoint is «straight» and
// follows them. An untouched axis-aligned rectangle is stored as `rect`; anything bent, rotated or
// rounded is stored as `spline`. Plus the per-dialog bus the canvas and the panel share: the
// clipped area and the undo stack.
import type { FuseSplinePoint, FuseZone } from 'lib/fusing-dxf/types';

export type ZonePoint = { x: number; y: number; corner: boolean };
type DrawnZone = Exclude<FuseZone, { dxfPieceKey: string }>;

// Stored points are rounded to 0.1 mm: a straight mid can sit up to ~0.07 mm off its midpoint.
const STRAIGHT_MM = 0.08;
const r1 = (v: number) => Math.round(v * 10) / 10;
const midOf = (a: ZonePoint, b: ZonePoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const isDrawnZone = (z: FuseZone | null | undefined): z is DrawnZone =>
  !!z && !('dxfPieceKey' in z);

/** A slot that toggles sharp / round: the even ones of a Rect+ ring, every one otherwise. */
export const cornerSlot = (i: number, n: number) => n % 2 === 1 || i % 2 === 0;
/** Rect+ structure: an even ring, mids at odd slots. */
const rectPlus = (n: number) => n >= 4 && n % 2 === 0;

/** A mid that sits on its corners' midpoint (it follows them while they move). */
export function straightMid(pts: readonly ZonePoint[], i: number): boolean {
  const n = pts.length;
  if (!rectPlus(n) || i % 2 === 0) return false;
  const m = midOf(pts[i - 1], pts[(i + 1) % n]);
  return Math.hypot(pts[i].x - m.x, pts[i].y - m.y) <= STRAIGHT_MM;
}

/** Re-centres every straight mid onto its corners (after corners moved). */
export function followMids(pts: ZonePoint[], straight: readonly boolean[]): ZonePoint[] {
  const n = pts.length;
  if (!rectPlus(n)) return pts;
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
  const n = pts.length;
  if (n === 8 && pts.every((p, i) => (i % 2 === 0 ? p.corner : !p.corner && straightMid(pts, i)))) {
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
  return storedZone(pts.map((p, i) => ({ ...p, corner: sharp && cornerSlot(i, pts.length) })));
}
export const allCorners = (z: FuseZone | null | undefined, sharp: boolean) => {
  const pts = zonePoints(z);
  return pts.length > 0 && pts.every((p, i) => p.corner === (sharp && cornerSlot(i, pts.length)));
};

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
