// THE DOLL'S CAMERA, IN NUMBERS: pure functions the canvas drives (no React, no three.js) — the
// fit, the limits that keep the doll on screen, the path between preset views, the wheel's kind
// and the nearest line under the pointer. Angles follow three's Spherical: θ round +y from +z
// (the doll faces +z), φ down from +y.

export type V3 = readonly [number, number, number];
export type Box = { min: V3; max: V3 };
export type Sph = { r: number; phi: number; theta: number };

const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;

/** How much of the canvas height the fitted doll takes. */
export const FIT_FILL = 0.85;
/** Polar limits: the camera never reaches the poles (no flip over the head). */
export const MIN_POLAR = deg(5);
export const MAX_POLAR = deg(175);
/** The preset views' height: a little above the waist, looking slightly down. */
export const PRESET_PHI = deg(82);
export const PRESET_THETA = { front: 0, back: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
/** Preset and fit moves. */
export const VIEW_MS = 300;
/** Double-click onto the cloth: the target moves to the point. */
export const PIVOT_MS = 220;

/**
 * The camera distance and target that frame the box: the doll takes `fill` of the canvas height
 * (or of its width when the box is the wider of the two), measured at the box's front face.
 */
export function fitOf(
  box: Box,
  fovDeg: number,
  aspect: number,
  fill = FIT_FILL,
): { target: V3; dist: number } {
  const sx = Math.max(1, box.max[0] - box.min[0]);
  const sy = Math.max(1, box.max[1] - box.min[1]);
  const sz = Math.max(0, box.max[2] - box.min[2]);
  const t = Math.tan(deg(fovDeg) / 2);
  const byH = sy / 2 / fill / t;
  const byW = sx / 2 / fill / (t * Math.max(0.1, aspect));
  return {
    target: [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ],
    dist: Math.max(byH, byW) + sz / 2,
  };
}

/** The leash every fit sets: zoom 0.25–3 × the fit, the target within 1.5 × half the diagonal. */
export function limitsOf(
  box: Box,
  fitDist: number,
): { minDistance: number; maxDistance: number; maxTargetRadius: number } {
  const d = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
  return {
    minDistance: 0.25 * fitDist,
    maxDistance: 3 * fitDist,
    maxTargetRadius: (d / 2) * 1.5,
  };
}

/** θ wrapped to (−π, π]. */
export const wrapAngle = (a: number) => {
  const w = (((a + Math.PI) % TAU) + TAU) % TAU;
  return w === 0 ? Math.PI : w - Math.PI;
};

export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * The move between two camera spheres: θ by the shortest arc, φ and r straight. Front ↔ back
 * goes round the side at the views' height — never over the head.
 */
export function presetPath(from: Sph, to: Sph): (t: number) => Sph {
  const dTheta = wrapAngle(to.theta - from.theta);
  return (t) => {
    const k = easeOut(t);
    return {
      r: from.r + (to.r - from.r) * k,
      phi: Math.min(MAX_POLAR, Math.max(MIN_POLAR, from.phi + (to.phi - from.phi) * k)),
      theta: from.theta + dTheta * k,
    };
  };
}

export type WheelKind = 'pinch' | 'pad' | 'mouse';

/**
 * A trackpad's pinch comes as a wheel with ctrlKey; its two-finger swipe as pixel deltas with a
 * sideways or fractional part, or within 300 ms of the last swipe. The rest is a mouse wheel.
 */
export function wheelKind(
  e: { ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number },
  now: number,
  lastPadAt: number,
): WheelKind {
  if (e.ctrlKey) return 'pinch';
  if (e.deltaMode === 0 && (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || now - lastPadAt < 300))
    return 'pad';
  return 'mouse';
}

/** Two-finger swipe → orbit: a full canvas height turns half a circle. */
export function padOrbit(s: Sph, dx: number, dy: number, height: number): Sph {
  const h = Math.max(1, height);
  return {
    r: s.r,
    phi: Math.min(MAX_POLAR, Math.max(MIN_POLAR, s.phi - (Math.PI * dy) / h)),
    theta: s.theta - (Math.PI * dx) / h,
  };
}

export type P2 = { x: number; y: number };

/** Distance from p to the segment ab, and where on it (0..1). */
export function segDist(p: P2, a: P2, b: P2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l = vx * vx + vy * vy;
  const t = l > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l)) : 0;
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

/**
 * The polylines (screen pixels) within `maxPx` of p, nearest first: index and distance. A
 * polyline of one point is a point. Callers test the nearest for occlusion and take the first
 * visible one.
 */
export function pickPolyline(
  lines: readonly (readonly P2[])[],
  p: P2,
  maxPx: number,
): { index: number; dist: number }[] {
  const out: { index: number; dist: number }[] = [];
  lines.forEach((pts, index) => {
    let best = Infinity;
    if (pts.length === 1) best = Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
    for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(p, pts[i - 1], pts[i]));
    if (best <= maxPx) out.push({ index, dist: best });
  });
  return out.sort((a, b) => a.dist - b.dist);
}

/** Two touch taps make a double tap: within 300 ms and 10 px. */
export function isDoubleTap(
  prev: { t: number; x: number; y: number } | null,
  cur: { t: number; x: number; y: number },
): boolean {
  return !!prev && cur.t - prev.t < 300 && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 10;
}
