// Entity → polyline tessellation. Every coordinate is scaled to cm on emission (factor
// `u` = cm per drawing unit), so all tolerances downstream are plain cm.
//
// dxf-parser facts this code depends on (verified against 1.1.2):
// - ARC start/end angles arrive in RADIANS;
// - ELLIPSE angles are raw PARAMETRIC radians (not true angles) and majorAxisEndPoint is
//   relative to the center;
// - LWPOLYLINE/POLYLINE closedness is the `shape` flag, bulge rides on each vertex;
// - LINE endpoints live in `vertices`.
import type {
  IArcEntity,
  ICircleEntity,
  IEllipseEntity,
  IEntity,
  ILineEntity,
  ILwpolylineEntity,
  IPoint,
  IPolylineEntity,
  ISplineEntity,
} from 'dxf-parser';
import type { Pt } from '../types';

export type Chain = { pts: Pt[]; closed: boolean };

const MAX_SEGS = 256;

// Segment count so the chord sagitta stays ≤ tol: φmax = 2·acos(1 − tol/R).
function arcSegments(radius: number, sweepAbs: number, tolCm: number): number {
  if (radius <= tolCm) return 1;
  const phiMax = 2 * Math.acos(Math.max(-1, 1 - tolCm / radius));
  if (!(phiMax > 0)) return MAX_SEGS;
  return Math.min(MAX_SEGS, Math.max(1, Math.ceil(sweepAbs / phiMax)));
}

// Bulge b = tan(θ/4) between P1→P2; exact center per the standard construction:
// C = M + ((1 − b²)/(4b))·(−u.y, u.x). Sanity: b=1, (0,0)→(2,0) ⇒ C=(1,0), θ=π.
function tessellateBulge(p1: Pt, p2: Pt, bulge: number, tolCm: number, out: Pt[]): void {
  const theta = 4 * Math.atan(bulge);
  const ux = p2.x - p1.x;
  const uy = p2.y - p1.y;
  const k = (1 - bulge * bulge) / (4 * bulge);
  const cx = (p1.x + p2.x) / 2 + k * -uy;
  const cy = (p1.y + p2.y) / 2 + k * ux;
  const r = Math.hypot(p1.x - cx, p1.y - cy);
  const a1 = Math.atan2(p1.y - cy, p1.x - cx);
  const n = arcSegments(r, Math.abs(theta), tolCm);
  for (let i = 1; i <= n; i++) {
    const a = a1 + (theta * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
}

function scalePt(p: IPoint, u: number): Pt {
  return { x: p.x * u, y: p.y * u };
}

function polylineChain(
  vertices: Array<IPoint & { bulge?: number }>,
  closed: boolean,
  u: number,
  tolCm: number,
): Chain | null {
  if (!vertices || vertices.length < 2) return null;
  const pts: Pt[] = [scalePt(vertices[0], u)];
  const segCount = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < segCount; i++) {
    const from = scalePt(vertices[i], u);
    const to = scalePt(vertices[(i + 1) % vertices.length], u);
    const bulge = vertices[i].bulge ?? 0;
    if (Math.abs(bulge) > 1e-9) tessellateBulge(from, to, bulge, tolCm, pts);
    else pts.push(to);
  }
  if (closed && pts.length > 1) pts.pop(); // final point re-hits the start
  return { pts, closed };
}

function arcChain(e: IArcEntity, u: number, tolCm: number): Chain {
  const c = scalePt(e.center, u);
  const r = e.radius * u;
  let sweep = e.endAngle - e.startAngle;
  while (sweep <= 0) sweep += Math.PI * 2;
  const n = arcSegments(r, sweep, tolCm);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = e.startAngle + (sweep * i) / n;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return { pts, closed: false };
}

function circleChain(e: ICircleEntity, u: number, tolCm: number): Chain {
  const c = scalePt(e.center, u);
  const r = e.radius * u;
  const n = Math.max(8, arcSegments(r, Math.PI * 2, tolCm));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return { pts, closed: true };
}

function ellipseChain(e: IEllipseEntity, u: number, tolCm: number): Chain {
  const c = scalePt(e.center, u);
  const majX = e.majorAxisEndPoint.x * u;
  const majY = e.majorAxisEndPoint.y * u;
  const a = Math.hypot(majX, majY);
  const b = a * e.axisRatio;
  const phi = Math.atan2(majY, majX);
  let sweep = e.endAngle - e.startAngle;
  while (sweep <= 0) sweep += Math.PI * 2;
  const full = Math.abs(sweep - Math.PI * 2) < 1e-9;
  // Conservative: sample by the major radius.
  const n = Math.max(8, arcSegments(a, sweep, tolCm));
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const pts: Pt[] = [];
  const count = full ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const t = e.startAngle + (sweep * i) / n;
    const ex = a * Math.cos(t);
    const ey = b * Math.sin(t);
    pts.push({ x: c.x + ex * cosPhi - ey * sinPhi, y: c.y + ex * sinPhi + ey * cosPhi });
  }
  return { pts, closed: full };
}

// De Boor evaluation for a clamped B-spline (weights = 1 — dxf-parser drops rational
// weights; sub-0.2 mm on garment curves).
function deBoor(degree: number, ctrl: Pt[], knots: number[], t: number): Pt {
  let k = degree;
  for (let i = degree; i < knots.length - degree - 1; i++) {
    if (t >= knots[i] && t <= knots[i + 1]) {
      k = i;
      break;
    }
  }
  const d: Pt[] = [];
  for (let j = 0; j <= degree; j++) d.push({ ...ctrl[Math.min(ctrl.length - 1, Math.max(0, j + k - degree))] });
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = j + k - degree;
      const denom = knots[i + degree - r + 1] - knots[i];
      const alpha = denom === 0 ? 0 : (t - knots[i]) / denom;
      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
      };
    }
  }
  return d[degree];
}

function splineChain(e: ISplineEntity, u: number): Chain | null {
  // Garment CAD emits dense fit points — the faithful, cheap path.
  if (e.fitPoints && e.fitPoints.length >= 3) {
    return { pts: e.fitPoints.map((p) => scalePt(p, u)), closed: !!e.closed };
  }
  const ctrl = e.controlPoints;
  if (!ctrl || ctrl.length < 2) return null;
  const degree = e.degreeOfSplineCurve || 3;
  const knots = e.knotValues;
  if (!knots || knots.length < ctrl.length + degree + 1) {
    // Malformed knot vector — fall back to the control polygon rather than dropping.
    return { pts: ctrl.map((p) => scalePt(p, u)), closed: !!e.closed };
  }
  const cm = ctrl.map((p) => scalePt(p, u));
  const t0 = knots[degree];
  const t1 = knots[knots.length - degree - 1];
  const n = Math.min(MAX_SEGS, Math.max(16, cm.length * 8));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    pts.push(deBoor(degree, cm, knots, t));
  }
  return { pts, closed: !!e.closed };
}

// One entity → one chain (or null when the entity carries no piece-relevant geometry).
export function entityToChain(e: IEntity, u: number, tolCm: number): Chain | null {
  switch (e.type) {
    case 'LINE': {
      const le = e as ILineEntity;
      if (!le.vertices || le.vertices.length < 2) return null;
      return { pts: le.vertices.slice(0, 2).map((p) => scalePt(p, u)), closed: false };
    }
    case 'LWPOLYLINE': {
      const pe = e as ILwpolylineEntity;
      return polylineChain(pe.vertices, !!pe.shape, u, tolCm);
    }
    case 'POLYLINE': {
      const pe = e as IPolylineEntity;
      return polylineChain(pe.vertices, !!pe.shape, u, tolCm);
    }
    case 'ARC':
      return arcChain(e as IArcEntity, u, tolCm);
    case 'CIRCLE':
      return circleChain(e as ICircleEntity, u, tolCm);
    case 'ELLIPSE':
      return ellipseChain(e as IEllipseEntity, u, tolCm);
    case 'SPLINE':
      return splineChain(e as ISplineEntity, u);
    default:
      // TEXT/MTEXT/POINT/DIMENSION/SOLID/3DFACE/ATTDEF… — not boundary geometry.
      return null;
  }
}
