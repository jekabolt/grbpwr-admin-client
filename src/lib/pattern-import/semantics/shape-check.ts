// SHAPE (owner 16.10, card 49): one piece is ONE shape graded across sizes — every size carries the
// same features (notches, drills) and the same outline structure; only the dimensions change. This
// module measures a size's structure and compares the sizes of one family; the writer's gate uses it
// to hold a family whose sizes differ (D3: a question, never a silent pass).
//
// Corners: the cut line simplified at 0.4 mm, a vertex is a corner when the line turns there by more
// than CORNER_STRONG_DEG over ±CORNER_REACH_MM of line. Grading moves corners and bends curves a
// little, so the comparison uses hysteresis: a size whose STRONG corners outnumber another size's
// WEAK ones (turn > CORNER_WEAK_DEG) has a corner the other lacks — an extra bump, a notch cut into
// the line, a step.

import { simplify } from '../write/geom';
import type { PieceSizeSpec, PtMm } from '../types';

export const CORNER_STRONG_DEG = 60;
export const CORNER_WEAK_DEG = 25;
/** the turn at a vertex is measured between the line this far before and after it, mm */
export const CORNER_REACH_MM = 1.5;

export type SizeShape = {
  notches: number;
  drills: number;
  /** strong corners (turn > CORNER_STRONG_DEG) */
  corners: PtMm[];
  /** weak corners (turn > CORNER_WEAK_DEG), counted */
  weak: number;
};

/** The point `d` mm along the closed polyline from vertex i, forward (dir 1) or back (dir −1). */
function along(pts: readonly PtMm[], i: number, d: number, dir: 1 | -1): PtMm {
  const n = pts.length;
  let k = i;
  let left = d;
  for (let s = 0; s < n; s++) {
    const a = pts[k];
    const j = (k + dir + n) % n;
    const b = pts[j];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L >= left && L > 0)
      return { x: a.x + ((b.x - a.x) * left) / L, y: a.y + ((b.y - a.y) * left) / L };
    left -= L;
    k = j;
  }
  return pts[k];
}

/** Turn angles (deg, 0 = straight) at each vertex of the simplified closed outline. */
export function turnsOf(outline: readonly PtMm[]): { at: PtMm; deg: number }[] {
  let pts = simplify(outline, true, 0.4);
  if (
    pts.length > 2 &&
    Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6
  )
    pts = pts.slice(0, -1);
  if (pts.length < 3) return [];
  const out: { at: PtMm; deg: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = along(pts, i, CORNER_REACH_MM, -1);
    const b = along(pts, i, CORNER_REACH_MM, 1);
    const u = { x: p.x - a.x, y: p.y - a.y };
    const v = { x: b.x - p.x, y: b.y - p.y };
    const lu = Math.hypot(u.x, u.y);
    const lv = Math.hypot(v.x, v.y);
    if (lu < 1e-6 || lv < 1e-6) continue;
    const c = Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)));
    out.push({ at: p, deg: (Math.acos(c) * 180) / Math.PI });
  }
  // a corner turned over two close vertices counts once: keep local maxima 2 mm apart
  const keep: { at: PtMm; deg: number }[] = [];
  const order = out.map((_, i) => i).sort((x, y) => out[y].deg - out[x].deg);
  for (const i of order) {
    const t = out[i];
    if (keep.some((k) => Math.hypot(k.at.x - t.at.x, k.at.y - t.at.y) < 2 * CORNER_REACH_MM))
      continue;
    keep.push(t);
  }
  return keep;
}

export function shapeOf(z: Pick<PieceSizeSpec, 'cut' | 'notches' | 'drills'>): SizeShape {
  const t = turnsOf(z.cut);
  return {
    notches: z.notches.length,
    drills: z.drills.length,
    corners: t.filter((x) => x.deg > CORNER_STRONG_DEG).map((x) => x.at),
    weak: t.filter((x) => x.deg > CORNER_WEAK_DEG).length,
  };
}

/**
 * The first difference between the sizes of one family, or null when they are one shape:
 * a feature count that differs, or a size with more strong corners than another has weak ones.
 * Indices are into the given array.
 */
export function shapeMismatch(
  sh: readonly SizeShape[],
): { what: string; a: number; b: number } | null {
  for (let i = 1; i < sh.length; i++) {
    if (sh[i].notches !== sh[0].notches)
      return { what: `notches ${sh[0].notches}≠${sh[i].notches}`, a: 0, b: i };
    if (sh[i].drills !== sh[0].drills)
      return { what: `drills ${sh[0].drills}≠${sh[i].drills}`, a: 0, b: i };
  }
  for (let i = 0; i < sh.length; i++)
    for (let j = 0; j < sh.length; j++)
      if (i !== j && sh[i].corners.length > sh[j].weak)
        return { what: `corners ${sh[i].corners.length}>${sh[j].weak}`, a: i, b: j };
  return null;
}
