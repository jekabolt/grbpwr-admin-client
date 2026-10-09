// Fold pieces (owner decision 8): a piece drawn as a half against a fold edge ("on fold", "im
// Stoffbruch", "сгиб", "au pli", AAMA layer 6 mirror line) is exported WHOLE — mirrored across the
// fold line — and the fold line is kept as an internal line (layer 8, written with ≥ 3 vertices by
// the writer, K1 obligation 14). The fold edge has no allowance: unfolding happens BEFORE any
// offset, so the derived cut/seam line simply runs across where the fold was.

import type { FoldFeature, PtMm } from '../types';
import {
  areaOf,
  ccw,
  convexHull,
  dist,
  lineHits,
  reflection,
  applyAffine,
  signedArea,
} from './geom';

/** A vertex is ON the fold line within this distance, mm. */
export const FOLD_TOL_MM = 0.5;
/** The fold edge must be at least this long, mm. */
export const FOLD_MIN_MM = 10;

export type FoldLine = { a: PtMm; b: PtMm };

const unit = (f: FoldLine) => {
  const L = dist(f.a, f.b);
  return { x: (f.b.x - f.a.x) / L, y: (f.b.y - f.a.y) / L };
};
/** Signed distance of p from the fold line (left of a→b positive). */
export const sideOf = (f: FoldLine, p: PtMm) => {
  const u = unit(f);
  return u.x * (p.y - f.a.y) - u.y * (p.x - f.a.x);
};
/** p projected onto the fold line. */
const onLine = (f: FoldLine, p: PtMm): PtMm => {
  const u = unit(f);
  const t = (p.x - f.a.x) * u.x + (p.y - f.a.y) * u.y;
  return { x: f.a.x + u.x * t, y: f.a.y + u.y * t };
};

export type Unfolded = {
  pts: PtMm[];
  /** The fold edge as it lay on the contour (its two end vertices), on the line exactly. */
  edge: [PtMm, PtMm];
};

/**
 * Mirror a closed half outline across its fold edge into the whole outline. Null when the line is
 * not an edge of the outline (no run of ≥ 2 vertices on it ≥ 10 mm long) or the half straddles it.
 */
export function unfold(pts: readonly PtMm[], fold: FoldLine): Unfolded | null {
  if (!(dist(fold.a, fold.b) > 0)) return null;
  const src = ccw([...pts]);
  const n = src.length;
  if (n < 3) return null;
  const s = src.map((p) => sideOf(fold, p));
  const hi = Math.max(...s);
  const lo = Math.min(...s);
  if (hi > FOLD_TOL_MM && lo < -FOLD_TOL_MM) return null; // straddles: not a fold edge
  const on = s.map((v) => Math.abs(v) <= FOLD_TOL_MM);
  if (on.every(Boolean)) return null;
  // longest circular run of on-line vertices (measured along the line)
  let best: { i0: number; i1: number; len: number } | null = null;
  const start = on.findIndex((v) => !v); // a vertex off the line: runs never wrap past it
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (!on[i] || on[(i - 1 + n) % n]) continue;
    let j = i;
    while (on[(j + 1) % n] && (j + 1) % n !== i) j = (j + 1) % n;
    const len = dist(src[i], src[j]);
    if (j !== i && (!best || len > best.len)) best = { i0: i, i1: j, len };
  }
  if (!best || best.len < FOLD_MIN_MM) return null;
  // Q = the non-fold path from the run's end around to its start (both ends snapped onto the line)
  const Q: PtMm[] = [];
  for (let k = best.i1; ; k = (k + 1) % n) {
    Q.push(src[k]);
    if (k === best.i0) break;
  }
  Q[0] = onLine(fold, Q[0]);
  Q[Q.length - 1] = onLine(fold, Q[Q.length - 1]);
  const M = reflection(fold.a, fold.b);
  const back: PtMm[] = [];
  for (let k = Q.length - 2; k >= 1; k--) back.push(applyAffine(M, Q[k]));
  const whole = ccw([...Q, ...back]);
  return { pts: whole, edge: [Q[Q.length - 1], Q[0]] };
}

/** Mirror image of points across the fold line, dropping those ON the line (they map to themselves). */
export function mirrorOff(points: readonly PtMm[], fold: FoldLine): PtMm[] {
  const M = reflection(fold.a, fold.b);
  return points
    .filter((p) => Math.abs(sideOf(fold, p)) > FOLD_TOL_MM)
    .map((p) => applyAffine(M, p));
}

/**
 * The fold line as written: the fold LINE clipped to the whole cut outline (G6: both ends on the
 * cut line ±0.3 mm). The span is the pair of hits that brackets the fold edge.
 */
export function foldLineOnCut(edge: [PtMm, PtMm], cut: readonly PtMm[]): [PtMm, PtMm] {
  const L = dist(edge[0], edge[1]);
  const u = { x: (edge[1].x - edge[0].x) / L, y: (edge[1].y - edge[0].y) / L };
  const hits = lineHits(edge[0], u, cut);
  const t0 = 0;
  const t1 = L;
  const before = hits.filter((t) => t <= t0 + 0.5);
  const after = hits.filter((t) => t >= t1 - 0.5);
  const ta = before.length ? before[before.length - 1] : t0;
  const tb = after.length ? after[0] : t1;
  const at = (t: number) => ({ x: edge[0].x + u.x * t, y: edge[0].y + u.y * t });
  return [at(ta), at(tb)];
}

/**
 * A fold edge for a piece whose TEXT says "on fold" but carries no fold line: the longest straight
 * run of the outline that is an edge of its convex hull (the half lies on one side of it) and at
 * least a quarter of the piece's long side. Null when there is none.
 */
export function straightFoldEdge(outline: readonly PtMm[]): FoldLine | null {
  const pts = ccw([...outline]);
  const n = pts.length;
  if (n < 3) return null;
  const hull = convexHull(pts);
  const span = Math.max(...hull.map((p) => Math.max(...hull.map((q) => dist(p, q)))));
  let best: { line: FoldLine; len: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = dist(a, b);
    if (len < Math.max(FOLD_MIN_MM * 3, span * 0.25)) continue;
    const line = { a, b };
    // the outline must actually run along this hull edge (not just touch it at two corners)
    let along = 0;
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % n];
      if (Math.abs(sideOf(line, p)) <= FOLD_TOL_MM && Math.abs(sideOf(line, q)) <= FOLD_TOL_MM)
        along += dist(p, q);
    }
    if (along < len * 0.95) continue;
    if (!best || len > best.len) best = { line, len };
  }
  return best?.line ?? null;
}

/** The fold feature written for an unfolded size: line across the whole piece, cut to cut. */
export function foldFeature(
  ends: [PtMm, PtMm],
  base: Pick<FoldFeature, 'origin' | 'ranges' | 'confidence' | 'label'>,
): FoldFeature {
  return { kind: 'fold', a: ends[0], b: ends[1], ...base };
}

/** |area(whole) − 2·area(half)| / 2·area(half) — the unfold check of the probe. */
export const unfoldAreaError = (half: readonly PtMm[], whole: readonly PtMm[]) =>
  Math.abs(areaOf(whole) - 2 * areaOf(half)) / (2 * areaOf(half));

export { signedArea };
