// A10 · AUTOPILOT — the grainline when the drawing gives none and A1 proposes none.
//
// Owner rule (auto/00-PLAN §A10): along the piece's longest straight edge or its principal axis;
// when the two disagree, the one closer to the sheet's vertical (pattern sheets lay most pieces
// grain-up). Always a STRONG assumption: nothing on the sheet says it. Pure geometry on the
// outline the fill drew (sheet frame, mm), so a probe can score the rule on pieces whose grain IS
// drawn (autopilot-entry.ts: the rule against the detected grainline).
import type { PtMm } from 'lib/pattern-import/types';

export type GrainFallback = {
  a: PtMm;
  b: PtMm;
  /** Direction a → b, degrees in [0, 180). */
  angleDeg: number;
  from: 'edge' | 'axis' | 'vertical';
  /** The edge and the axis disagreed (or neither was clear): the vertical decided. */
  ambiguous: boolean;
  confidence: number;
  why: string;
};

/** Angle modulo 180, in [0, 180). */
export const norm180 = (d: number) => ((d % 180) + 180) % 180;
/** Unsigned difference of two undirected angles, degrees in [0, 90]. */
export function angleDiff180(a: number, b: number): number {
  const d = Math.abs(norm180(a) - norm180(b));
  return Math.min(d, 180 - d);
}
const offVertical = (d: number) => angleDiff180(d, 90);
const deg = (r: number) => (r * 180) / Math.PI;

/** Douglas–Peucker on an open polyline (iterative). */
function dp(pts: readonly PtMm[], tol: number): PtMm[] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = pts[i];
    const b = pts[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    let far = -1;
    let fd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((pts[k].x - a.x) * dy - (pts[k].y - a.y) * dx) / L;
      if (d > fd) {
        fd = d;
        far = k;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** The ring simplified (1 mm), split at vertex 0 and the vertex farthest from it. */
function simplifyRing(ring: readonly PtMm[], tol: number): PtMm[] {
  const n = ring.length;
  if (n < 4) return [...ring];
  let far = 0;
  let fd = -1;
  for (let k = 1; k < n; k++) {
    const d = Math.hypot(ring[k].x - ring[0].x, ring[k].y - ring[0].y);
    if (d > fd) {
      fd = d;
      far = k;
    }
  }
  const one = dp(ring.slice(0, far + 1), tol);
  const two = dp([...ring.slice(far), ring[0]], tol);
  return [...one, ...two.slice(1, -1)];
}

/** The longest straight stretch of the outline: its chord length and direction. */
export function longestStraight(ring: readonly PtMm[]): { lenMm: number; angleDeg: number } | null {
  const s = simplifyRing(ring, 1);
  if (s.length < 3) return null;
  let best: { lenMm: number; angleDeg: number } | null = null;
  for (let i = 0; i < s.length; i++) {
    const a = s[i];
    const b = s[(i + 1) % s.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!best || len > best.lenMm)
      best = { lenMm: len, angleDeg: norm180(deg(Math.atan2(b.y - a.y, b.x - a.x))) };
  }
  return best;
}

/** Area centroid and principal axis (second moments of the polygon). */
export function principalAxis(ring: readonly PtMm[]) {
  const n = ring.length;
  let A = 0;
  let cx = 0;
  let cy = 0;
  // shift to the first vertex for precision
  const ox = ring[0].x;
  const oy = ring[0].y;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const x0 = ring[i].x - ox;
    const y0 = ring[i].y - oy;
    const x1 = ring[(i + 1) % n].x - ox;
    const y1 = ring[(i + 1) % n].y - oy;
    const c = x0 * y1 - x1 * y0;
    A += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * c;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  A /= 2;
  if (Math.abs(A) < 1e-9) return null;
  cx /= 6 * A;
  cy /= 6 * A;
  // central second moments (∫x², ∫y², ∫xy over the area); a clockwise ring sums them negative
  const sg = Math.sign(A);
  const Ixx = sg * (sxx / 12 - A * cx * cx);
  const Iyy = sg * (syy / 12 - A * cy * cy);
  const Ixy = sg * (sxy / 24 - A * cx * cy);
  const theta = 0.5 * Math.atan2(2 * Ixy, Ixx - Iyy);
  const tr = (Ixx + Iyy) / 2;
  const det = Math.sqrt(((Ixx - Iyy) / 2) ** 2 + Ixy * Ixy);
  const l1 = tr + det;
  const l2 = Math.max(1e-9, tr - det);
  return {
    centroid: { x: cx + ox, y: cy + oy },
    angleDeg: norm180(deg(theta)),
    /** √(λ1/λ2): 1 = round, 2 = twice as long as wide. */
    elongation: Math.sqrt(Math.abs(l1 / l2)),
    areaMm2: Math.abs(A),
  };
}

const EDGE_SHARE = 0.18; // a straight stretch ≥ 18 % of the perimeter is the piece's own edge
const EDGE_MIN_MM = 60;
const ELONGATED = 1.3;
const AGREE_DEG = 12;

/**
 * The fallback grainline of one outline: through the area centroid, 70 % of the piece's extent
 * along the chosen direction, pointing "up" the direction (b after a in [0°, 180°)).
 */
export function fallbackGrain(ring: readonly PtMm[]): GrainFallback | null {
  if (ring.length < 3) return null;
  const ax = principalAxis(ring);
  if (!ax) return null;
  let per = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    per += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const edge = longestStraight(ring);
  const edgeOk = !!edge && edge.lenMm >= Math.max(EDGE_MIN_MM, EDGE_SHARE * per);
  const axisOk = ax.elongation >= ELONGATED;
  let angle: number;
  let from: GrainFallback['from'];
  let ambiguous = false;
  let confidence: number;
  let why: string;
  if (edgeOk && axisOk) {
    const d = angleDiff180(edge!.angleDeg, ax.angleDeg);
    if (d <= AGREE_DEG) {
      angle = edge!.angleDeg;
      from = 'edge';
      confidence = 0.6;
      why = `the longest straight edge (${edge!.lenMm.toFixed(0)} mm) runs along the piece's long axis (${d.toFixed(0)}° apart)`;
    } else {
      ambiguous = true;
      confidence = 0.35;
      const edgeUp = offVertical(edge!.angleDeg) <= offVertical(ax.angleDeg);
      angle = edgeUp ? edge!.angleDeg : ax.angleDeg;
      from = edgeUp ? 'edge' : 'axis';
      why = `the longest straight edge (${edge!.lenMm.toFixed(0)} mm, ${edge!.angleDeg.toFixed(0)}°) and the long axis (${ax.angleDeg.toFixed(0)}°) disagree — the one closer to the sheet's vertical`;
    }
  } else if (edgeOk) {
    angle = edge!.angleDeg;
    from = 'edge';
    confidence = 0.45;
    why = `the longest straight edge (${edge!.lenMm.toFixed(0)} mm); the piece has no clear long axis`;
  } else if (axisOk) {
    angle = ax.angleDeg;
    from = 'axis';
    confidence = 0.45;
    why = `the piece's long axis (${ax.elongation.toFixed(2)}× longer than wide); no long straight edge`;
  } else {
    angle = 90;
    from = 'vertical';
    ambiguous = true;
    confidence = 0.2;
    why = 'no long straight edge and no clear long axis — the sheet vertical';
  }
  const t = (angle * Math.PI) / 180;
  const ux = Math.cos(t);
  const uy = Math.sin(t);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of ring) {
    const s = (p.x - ax.centroid.x) * ux + (p.y - ax.centroid.y) * uy;
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  const mid = (lo + hi) / 2;
  const half = Math.max(20, 0.35 * (hi - lo));
  const c = { x: ax.centroid.x + mid * ux, y: ax.centroid.y + mid * uy };
  // the centre of the extent along the line, moved onto the centroid's line
  return {
    a: { x: c.x - half * ux, y: c.y - half * uy },
    b: { x: c.x + half * ux, y: c.y + half * uy },
    angleDeg: norm180(angle),
    from,
    ambiguous,
    confidence,
    why,
  };
}
