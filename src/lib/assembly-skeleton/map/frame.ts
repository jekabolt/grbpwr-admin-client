// Small geometry the map's pictures share: points along an edge by arc length, the inward normal of
// a CCW contour, the y-down frame every renderer draws in. Pictogram arithmetic, not drawing
// coordinates (01-PLAN §5) — renderers turn it into SVG / print primitives and hand nothing on.

import type { Affine, Edge, EdgeId, PieceGeom, Pt2 } from '../types';
import { apply } from '../union/affine';
import { pieceKeyOf } from '../union/layout';

/** A notch on a drawn edge: where it is and which way is INTO the cloth (unit vector, y down). */
export type MapNotch = { at: Pt2; inward: Pt2 };

const norm = (v: Pt2): Pt2 => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

/** Point and unit tangent at arc length `d` along a polyline. */
export function along(pts: readonly Pt2[], d: number): { p: Pt2; t: Pt2 } {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L >= left && L > 0) {
      const u = left / L;
      return {
        p: [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])],
        t: norm([b[0] - a[0], b[1] - a[1]]),
      };
    }
    left -= L;
  }
  const n = pts.length;
  if (n < 2) return { p: pts[0] ?? [0, 0], t: [1, 0] };
  return { p: pts[n - 1], t: norm([pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]]) };
}

export function polyLen(pts: readonly Pt2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++)
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** The plain edges an id names: `P#3` itself, a chain `P#3+4` as its two parts. */
export function edgesOf(id: EdgeId, g: PieceGeom): Edge[] {
  const pk = pieceKeyOf(id);
  const tail = id.slice(pk.length + 1);
  const ks = tail.split('+');
  const out: Edge[] = [];
  for (const k of ks) {
    const e = g.edges.find((x) => x.id === `${pk}#${k}`) ?? g.edges.find((x) => String(x.k) === k);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Notches of an edge (or chain) in the piece's own frame (y up): the point and the inward normal.
 * The resample is CCW, an edge's points follow it, so the cloth is on the LEFT of travel.
 */
export function edgeNotchesLocal(id: EdgeId, g: PieceGeom): { at: Pt2; inward: Pt2 }[] {
  const out: { at: Pt2; inward: Pt2 }[] = [];
  for (const e of edgesOf(id, g))
    for (const d of e.notchesMm) {
      const { p, t } = along(e.pts, d);
      out.push({ at: p, inward: [-t[1], t[0]] });
    }
  return out;
}

/** Every notch of a piece in its own frame (y up), with the inward normal. */
export function pieceNotchesLocal(g: PieceGeom): { at: Pt2; inward: Pt2 }[] {
  const n = g.rs.length;
  if (n < 5) return [];
  return g.notchIdx.map((i) => {
    const a = g.rs[(i - 2 + n) % n];
    const b = g.rs[(i + 2) % n];
    const t = norm([b[0] - a[0], b[1] - a[1]]);
    return { at: g.rs[i], inward: [-t[1], t[0]] as Pt2 };
  });
}

/**
 * Map a piece-frame (y up) point / direction through placement `T` and into a y-down frame whose
 * origin is (x0, y1) of the y-up extent.
 */
export function framer(T: Affine, x0: number, y1: number) {
  const pt = (p: Pt2): Pt2 => {
    const q = apply(T, p);
    return [q[0] - x0, y1 - q[1]];
  };
  const dir = (v: Pt2): Pt2 => {
    const q: Pt2 = [T[0] * v[0] + T[2] * v[1], T[1] * v[0] + T[3] * v[1]];
    return norm([q[0], -q[1]]);
  };
  return { pt, dir };
}

export function bboxOf(pts: Iterable<Pt2>) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export function centroidOf(pts: readonly Pt2[]): Pt2 {
  if (pts.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}
