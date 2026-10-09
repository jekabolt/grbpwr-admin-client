// F12 · Curve flattening at a sagitta (max chord-to-curve distance) in the OUTPUT frame (mm).
// Callers transform control points first (Béziers are affine-invariant), so the tolerance is
// honoured in millimetres whatever the source units were. Arcs are sampled in their own
// parameter space with the step bounded by the transformed radius.

import type { Affine, PtMm } from '../../types';
import { apply, sigmaMax } from './affine';

const MAX_DEPTH = 18;

function distToSegment(p: PtMm, a: PtMm, b: PtMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Appends the flattened cubic p0→p3 to `out` (p0 itself is NOT pushed — it is the current point).
 * The curve lies in the hull of its control points, so when both inner controls are within `s`
 * of the chord segment the whole curve is, and vice versa (continuity of the projection).
 */
export function flattenCubic(
  p0: PtMm,
  p1: PtMm,
  p2: PtMm,
  p3: PtMm,
  s: number,
  out: PtMm[],
  depth = 0,
): void {
  if (depth >= MAX_DEPTH || (distToSegment(p1, p0, p3) <= s && distToSegment(p2, p0, p3) <= s)) {
    out.push(p3);
    return;
  }
  const m01 = mid(p0, p1);
  const m12 = mid(p1, p2);
  const m23 = mid(p2, p3);
  const a = mid(m01, m12);
  const b = mid(m12, m23);
  const c = mid(a, b);
  flattenCubic(p0, m01, a, c, s, out, depth + 1);
  flattenCubic(c, b, m23, p3, s, out, depth + 1);
}

export function flattenQuad(p0: PtMm, q: PtMm, p2: PtMm, s: number, out: PtMm[]): void {
  const c1 = { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) };
  const c2 = { x: p2.x + (2 / 3) * (q.x - p2.x), y: p2.y + (2 / 3) * (q.y - p2.y) };
  flattenCubic(p0, c1, c2, p2, s, out);
}

const mid = (a: PtMm, b: PtMm): PtMm => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Param step for an ellipse whose largest output radius is R: chord error ≈ R·Δ²/8 ≤ s.
 * Capped at 45° so even a tiny circle keeps its shape.
 */
export function arcStep(R: number, s: number): number {
  if (!(R > 0)) return Math.PI / 4;
  return Math.min(Math.PI / 4, Math.sqrt((8 * s) / R));
}

/**
 * Samples the ellipse (cx,cy,rx,ry, x-axis rotation phiRad) from param t0 by dt (signed), in the
 * SOURCE frame, mapping each point through m. Pushes the points after the start (start excluded,
 * end included exactly as computed from t0+dt).
 */
export function flattenEllipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  phiRad: number,
  t0: number,
  dt: number,
  m: Affine,
  s: number,
  out: PtMm[],
  endExact?: PtMm,
): void {
  const R = Math.max(Math.abs(rx), Math.abs(ry)) * sigmaMax(m);
  const n = Math.max(1, Math.ceil(Math.abs(dt) / arcStep(R, s) - 1e-9));
  const cs = Math.cos(phiRad);
  const sn = Math.sin(phiRad);
  for (let i = 1; i <= n; i++) {
    if (i === n && endExact) {
      out.push(endExact);
      break;
    }
    const t = t0 + (dt * i) / n;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push(apply(m, cx + ex * cs - ey * sn, cy + ex * sn + ey * cs));
  }
}
