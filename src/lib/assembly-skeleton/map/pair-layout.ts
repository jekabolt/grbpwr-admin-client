// THE STEP PICTURE — a step's inputs laid along the seams it sews, then pulled apart (§4 zone 3).
//
// `unionLayout` over the step's leaf pieces with the seams INSIDE each input (already sewn — they
// keep the input's shape) ∪ the step's own seams; then each input group is pushed `explode` of the
// extent away from the centre of the sewn edges, so the two sides of a seam read as two edges that
// are about to meet. The sewn edges come back as polylines on BOTH pieces, with their notches.
//
// No seams → no picture (D6): a template-only join is never drawn with invented edges.

import type { Pt2, SeamCandidate } from '../types';
import { unionLayout } from '../union/layout';
import { unionPicture } from '../union/picture';
import { bboxOf, centroidOf, edgeNotchesLocal, edgesOf, framer, type MapNotch } from './frame';
import { seamEdgeIds, type MapRead } from './step-seams';
import { pieceKeyOf, resolveEdge } from '../union/layout';

export type PairShape = {
  pieceKey: string;
  /** Index of the step input the piece belongs to. */
  input: number;
  /** Closed outline, y down, mm from the picture's top-left. */
  pts: Pt2[];
  /** Identical layers drawn as this one shape. */
  count: number;
  hung: boolean;
};

export type PairSide = {
  edgeId: string;
  pieceKey: string;
  input: number;
  pts: Pt2[];
  notches: MapNotch[];
};

export type PairLabel = { input: number; at: Pt2; pieces: number };

export type PairPicture = {
  w: number;
  h: number;
  shapes: PairShape[];
  sides: PairSide[];
  /** One per input that has a drawn shape: at the group's centroid. */
  labels: PairLabel[];
  /** Leaf pieces that could not be drawn (no contour, or would overlap). */
  overflow: string[];
  /** Largest pairwise overlap of the laid-out shapes BEFORE the explode (0..1). */
  overlap: number;
};

export type PairOptions = {
  /** A step with more leaf pieces than this gets no picture (the 25-piece shirt is no pictogram). */
  maxPieces?: number;
  /** Share of the extent each input group moves away from the seam centre. */
  explode?: number;
};

export function pairPicture(read: MapRead, i: number, opts: PairOptions = {}): PairPicture | null {
  const maxPieces = opts.maxPieces ?? 16;
  const explode = opts.explode ?? 0.07;
  const step = read.steps[i];
  const sew = read.seams[i] ?? [];
  if (!step || sew.length === 0) return null;
  const leaves = read.inputLeaves[i] ?? [];
  const inputOf = new Map<string, number>();
  leaves.forEach((set, k) => {
    for (const p of set) if (!inputOf.has(p)) inputOf.set(p, k);
  });
  const keys = [...inputOf.keys()].filter((k) => read.geoms.has(k));
  if (keys.length === 0 || keys.length > maxPieces) return null;

  // Already sewn inside each input: both ends in one input.
  const inner: SeamCandidate[] = read.graph.chosen.filter((c) => {
    if (c.kind === 'closure-not-seam') return false;
    const ia = inputOf.get(pieceKeyOf(c.a));
    return ia != null && ia === inputOf.get(pieceKeyOf(c.b));
  });
  const layout = unionLayout(keys, [...inner, ...sew], read.geoms);
  const pic = unionPicture(layout, read.geoms);
  if (pic.shapes.length === 0) return null;
  const { x0, y1 } = layout.bbox;
  const T = new Map(layout.placements.map((p) => [p.pieceKey, p.T]));

  const sides: PairSide[] = [];
  for (const c of sew)
    for (const id of seamEdgeIds(c)) {
      const pk = pieceKeyOf(id);
      const g = read.geoms.get(pk);
      const t = T.get(pk);
      const e = resolveEdge(id, read.geoms);
      if (!g || !t || !e || edgesOf(id, g).length === 0) continue;
      const F = framer(t, x0, y1);
      sides.push({
        edgeId: id,
        pieceKey: pk,
        input: inputOf.get(pk) ?? -1,
        pts: e.pts.map(F.pt),
        notches: edgeNotchesLocal(id, g).map((n) => ({ at: F.pt(n.at), inward: F.dir(n.inward) })),
      });
    }

  // Explode: every input group away from the centre of the sewn edges.
  const groups = new Map<number, Pt2[]>();
  for (const s of pic.shapes) {
    const k = inputOf.get(s.pieceKey) ?? -1;
    groups.set(k, [...(groups.get(k) ?? []), ...s.pts]);
  }
  const seamPts = sides.flatMap((s) => s.pts);
  const centre = centroidOf(seamPts.length ? seamPts : pic.shapes.flatMap((s) => s.pts));
  const gap = groups.size > 1 ? Math.max(pic.w, pic.h) * explode : 0;
  const shift = new Map<number, Pt2>();
  for (const [k, pts] of groups) {
    const c = centroidOf(pts);
    const dx = c[0] - centre[0];
    const dy = c[1] - centre[1];
    const L = Math.hypot(dx, dy);
    shift.set(k, L > 1e-6 ? [(dx / L) * gap, (dy / L) * gap] : [0, 0]);
  }
  const mv = (k: number) => {
    const d = shift.get(k) ?? [0, 0];
    return (p: Pt2): Pt2 => [p[0] + d[0], p[1] + d[1]];
  };
  const shapes: PairShape[] = pic.shapes.map((s) => {
    const k = inputOf.get(s.pieceKey) ?? -1;
    return { pieceKey: s.pieceKey, input: k, pts: s.pts.map(mv(k)), count: s.count, hung: s.hung };
  });
  for (const s of sides) {
    const m = mv(s.input);
    s.pts = s.pts.map(m);
    s.notches = s.notches.map((n) => ({ at: m(n.at), inward: n.inward }));
  }
  // Re-origin at the top-left of what is drawn.
  const B = bboxOf(shapes.flatMap((s) => s.pts));
  const o = (p: Pt2): Pt2 => [p[0] - B.x0, p[1] - B.y0];
  for (const s of shapes) s.pts = s.pts.map(o);
  for (const s of sides) {
    s.pts = s.pts.map(o);
    s.notches = s.notches.map((n) => ({ at: o(n.at), inward: n.inward }));
  }
  const labels: PairLabel[] = [];
  for (const k of [...new Set(shapes.map((s) => s.input))].sort((a, b) => a - b)) {
    const mine = shapes.filter((s) => s.input === k);
    labels.push({
      input: k,
      at: centroidOf(mine.flatMap((s) => s.pts)),
      pieces: mine.reduce((n, s) => n + s.count, 0),
    });
  }
  return {
    w: B.x1 - B.x0,
    h: B.y1 - B.y0,
    shapes,
    sides,
    labels,
    overflow: [...pic.overflow, ...[...inputOf.keys()].filter((k) => !read.geoms.has(k))],
    overlap: pic.overlap,
  };
}
