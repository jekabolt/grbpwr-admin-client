// UNION PICTURE — a UnionLayout resolved into what a renderer draws: one closed outline per shape,
// in a y-DOWN frame with the origin at the unit's top-left, mm. Stacked layers collapse to their
// leader with a count; hung and surface pieces carry their flag and where the «~» goes.
//
// It is still a pictogram: outlines are simplified and nothing here is a cutting coordinate.

import { dartsOf } from '../geometry/darts';
import type { ClothState, PieceGeom, Pt2, UnionLayout } from '../types';
import { apply } from './affine';
import { resolveEdge } from './layout';

export type UnionShape = {
  pieceKey: string;
  /** Closed outline, y down, mm from the unit's top-left. */
  pts: Pt2[];
  cloth: ClothState | null;
  /** Layers drawn as this one shape (1 = a plain piece). */
  count: number;
  hung: boolean;
  surface: boolean;
  /** Where the «~» of a hung piece sits: the middle of the edge it hangs from. */
  mark: Pt2 | null;
  /** Share of the unit's drawn area — tiny pieces are not labelled (§G: < 3 %). */
  share: number;
  /**
   * Thin open lines drawn over the silhouette (dart legs, P2 §4), same frame as `pts`. The shape is
   * never changed by them; a renderer drops the ones too short to read at its size.
   */
  lines: Pt2[][];
};

export type UnionPicture = {
  /** Unit extent, mm. */
  w: number;
  h: number;
  shapes: UnionShape[];
  /** Every piece of the unit, stacked layers included (overflow and underlay excluded). */
  pieceCount: number;
  overflow: string[];
  underlay: string[];
  overlap: number;
};

/** Douglas–Peucker on a closed ring (split at the far point), tolerance in mm. */
function simplifyRing(pts: readonly Pt2[], tol: number): Pt2[] {
  if (pts.length < 8 || tol <= 0) return [...pts];
  const dp = (seg: readonly Pt2[]): Pt2[] => {
    const keep = new Uint8Array(seg.length);
    keep[0] = 1;
    keep[seg.length - 1] = 1;
    const stack: [number, number][] = [[0, seg.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      const A = seg[a];
      const B = seg[b];
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const len = Math.hypot(dx, dy);
      let best = -1;
      let bestD = tol;
      for (let i = a + 1; i < b; i++) {
        const P = seg[i];
        const d =
          len > 1e-9
            ? Math.abs(dy * P[0] - dx * P[1] + B[0] * A[1] - B[1] * A[0]) / len
            : Math.hypot(P[0] - A[0], P[1] - A[1]);
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        keep[best] = 1;
        stack.push([a, best], [best, b]);
      }
    }
    return seg.filter((_, i) => keep[i] === 1);
  };
  let far = 0;
  let farD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dp(pts.slice(0, far + 1));
  const b = dp([...pts.slice(far), pts[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** The point halfway along a polyline by length. */
function midOf(pts: readonly Pt2[]): Pt2 {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d >= left && d > 0) {
      const t = left / d;
      return [
        pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]),
        pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]),
      ];
    }
    left -= d;
  }
  return pts[pts.length - 1];
}

function ringArea(pts: readonly Pt2[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
}

/**
 * Resolve a layout into drawable outlines. `simplifyMm` — Douglas–Peucker tolerance on the unit
 * (default: 0.4 % of the larger side, invisible at any tile size the card uses).
 */
export function unionPicture(
  layout: UnionLayout,
  geoms: ReadonlyMap<string, PieceGeom> | readonly PieceGeom[],
  opts: { simplifyMm?: number } = {},
): UnionPicture {
  const G: ReadonlyMap<string, PieceGeom> =
    geoms instanceof Map
      ? geoms
      : new Map((geoms as readonly PieceGeom[]).map((g) => [g.pieceKey, g]));
  const { x0, y1 } = layout.bbox;
  const w = Math.max(0, layout.bbox.x1 - x0);
  const h = Math.max(0, layout.bbox.y1 - layout.bbox.y0);
  const tol = opts.simplifyMm ?? Math.max(w, h) * 0.004;
  const flip = (p: Pt2): Pt2 => [p[0] - x0, y1 - p[1]];

  const followers = new Set<string>();
  const countOf = new Map<string, number>();
  for (const s of layout.stacked) {
    countOf.set(s[0], s.length);
    for (const k of s.slice(1)) followers.add(k);
  }
  const hung = new Set(layout.hung);
  const surface = new Set(layout.surface ?? []);

  const shapes: UnionShape[] = [];
  for (const p of layout.placements) {
    if (followers.has(p.pieceKey)) continue;
    const g = G.get(p.pieceKey);
    if (!g) continue;
    const pts = simplifyRing(
      g.rs.map((q) => flip(apply(p.T, q))),
      tol,
    );
    let mark: Pt2 | null = null;
    if (hung.has(p.pieceKey) && p.attachedVia) {
      const e = resolveEdge(p.attachedVia, G);
      const host = e ? layout.placements.find((x) => x.pieceKey === e.pieceKey) : undefined;
      if (e && host) {
        // In the gap: halfway between the middle of the host edge and the nearest point of the
        // hung piece — the «~» names the join, not either piece.
        const mid = flip(apply(host.T, midOf(e.pts)));
        let near = pts[0];
        let best = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const l2 = dx * dx + dy * dy;
          const t =
            l2 > 0
              ? Math.max(0, Math.min(1, ((mid[0] - a[0]) * dx + (mid[1] - a[1]) * dy) / l2))
              : 0;
          const q: Pt2 = [a[0] + t * dx, a[1] + t * dy];
          const d = Math.hypot(q[0] - mid[0], q[1] - mid[1]);
          if (d < best) {
            best = d;
            near = q;
          }
        }
        mark = [(mid[0] + near[0]) / 2, (mid[1] + near[1]) / 2];
      }
    }
    // Lines the layout carries for the piece, else the piece's own darts (read off its marks).
    const own = layout.marks?.[p.pieceKey] ?? dartsOf(g).map((d) => d.legs);
    const lines = own.filter((l) => l.length >= 2).map((l) => l.map((q) => flip(apply(p.T, q))));
    shapes.push({
      pieceKey: p.pieceKey,
      pts,
      cloth: g.cloth,
      count: countOf.get(p.pieceKey) ?? 1,
      hung: hung.has(p.pieceKey),
      surface: surface.has(p.pieceKey),
      mark,
      share: 0,
      lines,
    });
  }
  const areas = shapes.map((s) => (s.surface ? 0 : ringArea(s.pts)));
  const total = areas.reduce((a, b) => a + b, 0) || 1;
  shapes.forEach((s, i) => (s.share = s.surface ? ringArea(s.pts) / total : areas[i] / total));

  return {
    w,
    h,
    shapes,
    pieceCount: shapes.reduce((n, s) => n + s.count, 0),
    overflow: layout.overflow,
    underlay: layout.underlay ?? [],
    overlap: layout.overlap ?? 0,
  };
}
