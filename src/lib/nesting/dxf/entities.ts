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

type FlaggedVertex = IPoint & {
  bulge?: number;
  curveFittingVertex?: boolean;
  splineVertex?: boolean;
  splineControlPoint?: boolean;
};

// Spline-fit POLYLINEs interleave the smoothed curve (flag 8) with its control frame
// (flag 16) in one vertex list — using both makes a garbage contour. Keep the curve,
// drop the frame; when only frame points exist, use them (better than nothing).
function filterPolylineVertices(vertices: FlaggedVertex[]): FlaggedVertex[] {
  const hasSplineFit = vertices.some((v) => v.splineVertex);
  if (hasSplineFit) return vertices.filter((v) => v.splineVertex || (!v.splineControlPoint && !v.curveFittingVertex));
  return vertices.filter((v) => !v.splineControlPoint);
}

function polylineChain(
  rawVertices: FlaggedVertex[],
  closed: boolean,
  u: number,
  tolCm: number,
): Chain | null {
  if (!rawVertices || rawVertices.length < 2) return null;
  const vertices = filterPolylineVertices(rawVertices);
  if (vertices.length < 2) return null;
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

// Refine a parametric sample until every interior point's sagitta (distance from the
// chord of its neighbours) is within tol — tessellation driven by tolerance, not by a
// vertex-count heuristic (a 4-fit-point spline over 50 cm must not become 3 chords).
function sampleBySagitta(
  evalAt: (t: number) => Pt,
  t0: number,
  t1: number,
  nInit: number,
  tolCm: number,
): Pt[] {
  let n = Math.max(4, nInit);
  for (let round = 0; round < 4; round++) {
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) pts.push(evalAt(t0 + ((t1 - t0) * i) / n));
    let maxSag = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const b = pts[i + 1];
      const pnt = pts[i];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const ab2 = abx * abx + aby * aby;
      const sag =
        ab2 <= 1e-18
          ? Math.hypot(pnt.x - a.x, pnt.y - a.y)
          : Math.abs((pnt.x - a.x) * aby - (pnt.y - a.y) * abx) / Math.sqrt(ab2);
      if (sag > maxSag) maxSag = sag;
    }
    // The 3-point sagitta over a double step bounds the single-step chord error from above.
    if (maxSag <= tolCm * 2 || n >= MAX_SEGS * 2) return pts;
    n = Math.min(MAX_SEGS * 2, n * 2);
  }
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push(evalAt(t0 + ((t1 - t0) * i) / n));
  return pts;
}

// Centripetal Catmull-Rom through the spline's FIT points — the curve passes through
// them, so chords between raw fit points under-render sparse-fit files.
function catmullRom(pts: readonly Pt[], closed: boolean, tolCm: number): Pt[] {
  const n = pts.length;
  if (n < 3) return [...pts];
  const at = (i: number): Pt => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[Math.min(n - 1, Math.max(0, i))];
  };
  const out: Pt[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const seg = sampleBySagitta(
      (t) => {
        // Uniform Catmull-Rom basis (garment fit points are near-evenly spaced).
        const t2 = t * t;
        const t3 = t2 * t;
        return {
          x:
            0.5 *
            (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
          y:
            0.5 *
            (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
        };
      },
      0,
      1,
      4,
      tolCm,
    );
    // Segments share endpoints — drop each segment's first point after the first segment.
    for (let k = i === 0 ? 0 : 1; k < seg.length; k++) out.push(seg[k]);
  }
  return out;
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

function splineChain(e: ISplineEntity, u: number, tolCm: number): Chain | null {
  // Fit points are ON the curve — interpolate through them (Catmull-Rom, sagitta-driven)
  // rather than chording them verbatim: sparse-fit files (4 points over 50 cm) matter.
  if (e.fitPoints && e.fitPoints.length >= 3) {
    const fit = e.fitPoints.map((p) => scalePt(p, u));
    return { pts: catmullRom(fit, !!e.closed, tolCm), closed: !!e.closed };
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
  const pts = sampleBySagitta((t) => deBoor(degree, cm, knots, t), t0, t1, Math.max(16, cm.length * 4), tolCm);
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
      return splineChain(e as ISplineEntity, u, tolCm);
    default:
      // TEXT/MTEXT/POINT/DIMENSION/SOLID/3DFACE/ATTDEF… — not boundary geometry.
      return null;
  }
}
