// Small plane geometry for fold lines: the seam frame's inverse, a line clipped to the sewing loop,
// the edge a line runs along. Millimetres in the piece's `rs` frame unless named otherwise.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { rotatePt } from 'lib/pom/upright';
import {
  contourSig,
  frameOf,
  runSamples,
  runsOfPiece,
  toUV,
  type PieceFrame,
  type SeamRun,
} from 'lib/seams/frame';
import type { Frame } from 'lib/seams/types';
import { FOLDS, type FoldEdge, type UV } from './types';

/** The seam frame's unit square → a drawing point (mm, `rs` frame). The inverse of `toUV`. */
export function fromUV(f: PieceFrame, [u, v]: UV): Pt2 {
  const q: Pt2 = [f.x0 + u * f.w, f.y0 + v * f.h];
  return f.deg ? rotatePt(q, -f.deg, f.c) : q;
}

/** How a stored (u, v) point reads on today's piece, given how today's piece sits against the stored one. */
export function mapUV([u, v]: UV, frame: Frame): UV {
  switch (frame) {
    case 'asis':
      return [u, v];
    case 'rot180':
      return [1 - u, 1 - v];
    case 'mirrorU':
      return [1 - u, v];
    case 'mirrorV':
      return [u, 1 - v];
  }
}

export const clampUV = ([u, v]: UV): UV => [
  Math.min(1, Math.max(0, u)),
  Math.min(1, Math.max(0, v)),
];

export const sub = (a: Pt2, b: Pt2): Pt2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Pt2, b: Pt2): Pt2 => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: Pt2, k: number): Pt2 => [a[0] * k, a[1] * k];
export const cross = (a: Pt2, b: Pt2) => a[0] * b[1] - a[1] * b[0];
export const len = (a: Pt2) => Math.hypot(a[0], a[1]);
export const unit = (a: Pt2): Pt2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** Left-hand normal of a direction (positive side of `cross(d, ·)`). */
export const perp = (d: Pt2): Pt2 => [-d[1], d[0]];

/** Even-odd point-in-polygon. */
export function inside(poly: readonly Pt2[], p: Pt2): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Signed distance of p from the infinite line a→b (positive on the left). */
export function sideDist(a: Pt2, b: Pt2, p: Pt2): number {
  return cross(unit(sub(b, a)), sub(p, a));
}

/** Distance from p to the polygon's boundary. */
export function distToPoly(poly: readonly Pt2[], p: Pt2): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const ab = sub(poly[i], a);
    const l2 = ab[0] ** 2 + ab[1] ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
    best = Math.min(best, len(sub(p, add(a, mul(ab, t)))));
  }
  return best;
}

/**
 * The infinite line through `p` along `d`, clipped to the polygon: the inside stretch that contains
 * `p` (or, when `p` itself is outside, null). Returns the two contour crossings, ordered along `d`.
 */
export function clipThrough(poly: readonly Pt2[], p: Pt2, d: Pt2): [Pt2, Pt2] | null {
  const dir = unit(d);
  const ts: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const e = sub(poly[i], a);
    const den = cross(dir, e);
    if (Math.abs(den) < 1e-12) continue;
    const ap = sub(a, p);
    const t = cross(ap, e) / den;
    const s = cross(ap, dir) / den;
    // Half-open on the segment so a crossing at a shared vertex counts once.
    if (s >= 0 && s < 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  for (let k = 0; k + 1 < ts.length; k += 2) {
    if (ts[k] <= 1e-9 && ts[k + 1] >= -1e-9) {
      return [add(p, mul(dir, ts[k])), add(p, mul(dir, ts[k + 1]))];
    }
  }
  return null;
}

/** The biggest distance of a polyline's vertices from its chord, mm. */
export function chordDeviation(pts: readonly Pt2[]): number {
  if (pts.length < 3) return 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (len(sub(b, a)) < 1e-9) return Infinity;
  return Math.max(...pts.map((p) => Math.abs(sideDist(a, b, p))));
}

/** Acute angle between two directions, degrees. */
export function angleBetween(d1: Pt2, d2: Pt2): number {
  const c = Math.abs((d1[0] * d2[0] + d1[1] * d2[1]) / ((len(d1) || 1) * (len(d2) || 1)));
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

/**
 * The inward distance of a fold line from an edge's chord, mm: the line's midpoint against the chord,
 * signed so the piece's inside is positive. The resolver lays the line back at exactly this distance,
 * so a locator written here and read there round-trips.
 */
export function offsetFromRun(piece: PieceGeom, run: SeamRun, lineMm: readonly [Pt2, Pt2]): number {
  const a = run.pts[0];
  const b = run.pts[run.pts.length - 1];
  const mid = mul(add(lineMm[0], lineMm[1]), 0.5);
  return sideDist(a, b, mid) * inwardSign(piece, run);
}

/** +1 when the inside of the piece is on the left of the run's chord, −1 when on the right. */
export function inwardSign(piece: PieceGeom, run: SeamRun): number {
  const a = run.pts[0];
  const b = run.pts[run.pts.length - 1];
  const n = perp(unit(sub(b, a)));
  const m = run.pts[Math.floor(run.pts.length / 2)];
  for (const step of [2, 5, 1, 10]) {
    if (inside(piece.rs, add(m, mul(n, step)))) return 1;
    if (inside(piece.rs, add(m, mul(n, -step)))) return -1;
  }
  return 1;
}

/**
 * The single edge a straight line runs along: parallel within `parallelDeg`, inside the reach, the
 * nearest one. Chains are not candidates (a hem runs along one edge).
 */
export function edgeAlong(
  piece: PieceGeom,
  lineMm: readonly [Pt2, Pt2],
  t: Partial<typeof FOLDS> = {},
): SeamRun | null {
  const th = { ...FOLDS, ...t };
  const d = sub(lineMm[1], lineMm[0]);
  let best: { run: SeamRun; off: number } | null = null;
  for (const run of runsOfPiece(piece, 1)) {
    const a = run.pts[0];
    const b = run.pts[run.pts.length - 1];
    if (len(sub(b, a)) < th.minLenMm) continue;
    if (angleBetween(d, sub(b, a)) > th.parallelDeg) continue;
    const off = offsetFromRun(piece, run, lineMm);
    if (off <= 0 || off > th.edgeReachMm) continue;
    if (!best || off < best.off) best = { run, off };
  }
  return best?.run ?? null;
}

/** An edge locator for a line along `run`, in the piece's seam frame. */
export function foldEdgeOf(
  piece: PieceGeom,
  f: PieceFrame,
  run: SeamRun,
  lineMm: readonly [Pt2, Pt2],
): FoldEdge | null {
  const off = Math.round(offsetFromRun(piece, run, lineMm) * 100) / 100;
  if (!(off > 0)) return null;
  return { hint: run.id, samples: runSamples(f, run), offsetMm: off };
}

export { contourSig, frameOf, toUV };
