// Fold pieces (owner decision 8): a piece drawn as a half against a fold edge ("on fold", "im
// Stoffbruch", "сгиб", "au pli", AAMA layer 6 mirror line) is exported WHOLE — mirrored across the
// fold line — and the fold line is kept as an internal line (layer 8, written with ≥ 3 vertices by
// the writer, K1 obligation 14). The fold edge has no allowance: unfolding happens BEFORE any
// offset, so the derived cut/seam line simply runs across where the fold was.

import type { BoxMm, FoldFeature, PtMm } from '../types';
import { PIECE_NO_SRC } from '../pieces/seeds';
import {
  SegIndex,
  applyAffine,
  areaOf,
  bboxOf,
  ccw,
  closestOnPolyline,
  convexHull,
  dist,
  lineHits,
  reflection,
  sampleAlong,
  selfIntersects,
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
export function unfold(
  pts: readonly PtMm[],
  fold: FoldLine,
  /** On-line tolerance; above FOLD_TOL_MM the vertices within it are snapped onto the line (E4). */
  tol = FOLD_TOL_MM,
): Unfolded | null {
  if (!(dist(fold.a, fold.b) > 0)) return null;
  let src = ccw([...pts]);
  const n = src.length;
  if (n < 3) return null;
  // a hand-drawn or scanned fold edge wanders by a millimetre or two (redcafe 44: a 2 mm notch
  // bump and a 0.3° drift); it becomes interior once unfolded, so it is straightened onto the line
  // Only the edge's own run is straightened: vertices within tol inside its span; at its ends only
  // what pokes past the line or lies within 1 mm of it, so a hem or neck vertex keeps its place.
  if (tol > FOLD_TOL_MM) {
    const L = dist(fold.a, fold.b);
    const mass = src.reduce((a, p) => a + sideOf(fold, p), 0);
    src = src.map((p) => {
      const sd = sideOf(fold, p);
      if (Math.abs(sd) > tol) return p;
      const t = along(fold, p);
      const outer = Math.sign(sd) !== Math.sign(mass) && Math.abs(sd) > FOLD_TOL_MM;
      const nearEnd = t > -5 && t < L + 5;
      return (t > 5 && t < L - 5) || (nearEnd && (outer || Math.abs(sd) <= 1))
        ? onLine(fold, p)
        : p;
    });
  }
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

// ── fold evidence → edge → verified unfold (E1a, D3: what the drawing does not prove is asked) ──
//
// A fold WORD is evidence, never an edge. It unfolds a piece only when it is bound to a straight
// edge of THAT piece's own outline — the text near that edge, roughly parallel to it, and no other
// drawn line nearer to it (a word printed beside another piece's facing line belongs to that line)
// — and when the unfolded outline is a believable whole piece (`foldShapeProblem`). Anything less
// is a question for the operator: pick the edge, or "not a fold".

/** Shortest straight edge a fold may be, mm (a waistband's CB end is ~60 mm). */
export const FOLD_EDGE_MIN_MM = 30;
/** A fold word's centre lies within this of its edge (or 4 × its font size), mm. */
export const FOLD_TEXT_MAX_MM = 40;
/** …and its baseline within this of the edge's direction, degrees. */
export const FOLD_TEXT_ANGLE_DEG = 20;
/** The same fold edge in another size: parallel within this, degrees… */
export const FOLD_MATCH_ANGLE_DEG = 3;
/** …and its line within this of the reference edge's midpoint, mm. */
export const FOLD_MATCH_OFFSET_MM = 60;

export type FoldEdge = FoldLine & { lenMm: number };

const dirDeg = (f: FoldLine) => (Math.atan2(f.b.y - f.a.y, f.b.x - f.a.x) * 180) / Math.PI;
/** Smallest angle between two undirected directions, degrees (0…90). */
const lineAngle = (d1: number, d2: number) => {
  const x = (((d1 - d2) % 180) + 180) % 180;
  return Math.min(x, 180 - x);
};
/** Parameter of p's foot along f (0 at a, |ab| at b), mm. */
const along = (f: FoldLine, p: PtMm) => {
  const u = unit(f);
  return (p.x - f.a.x) * u.x + (p.y - f.a.y) * u.y;
};

/**
 * The straight edges a half can be unfolded across: edges of its convex hull (the half lies on one
 * side) that the outline itself runs along for ≥ 90 % of their length, at least `minMm` long.
 * Longest first.
 */
export function foldEdges(outline: readonly PtMm[], minMm = FOLD_EDGE_MIN_MM): FoldEdge[] {
  const pts = ccw([...outline]);
  const n = pts.length;
  if (n < 3) return [];
  const hull = convexHull(pts);
  const out: FoldEdge[] = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = dist(a, b);
    if (len < minMm) continue;
    const line = { a, b };
    let run = 0;
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % n];
      if (Math.abs(sideOf(line, p)) <= FOLD_TOL_MM && Math.abs(sideOf(line, q)) <= FOLD_TOL_MM)
        run += dist(p, q);
    }
    if (run >= len * 0.9) out.push({ a, b, lenMm: len });
  }
  return out.sort((x, y) => y.lenMm - x.lenMm);
}

/**
 * The edge among `edges` that is `ref` in another size: parallel (≤ 3°), its line ≤ 60 mm from
 * ref's midpoint, overlapping ref along its direction; the nearest such. When the sizes are not
 * drawn in one frame (a file per size, redcafe 44…54) and the boxes are given, the fallback is the
 * parallel edge at the same place RELATIVE to its outline's box (≤ 15 % of the box away) and of a
 * similar length (0.6–1.6×). Null when none.
 */
export function matchFoldEdge(
  edges: readonly FoldEdge[],
  ref: FoldLine,
  refBox?: BoxMm | null,
  box?: BoxMm | null,
): FoldEdge | null {
  const mid = { x: (ref.a.x + ref.b.x) / 2, y: (ref.a.y + ref.b.y) / 2 };
  const rd = dirDeg(ref);
  let best: { e: FoldEdge; d: number } | null = null;
  for (const e of edges) {
    if (lineAngle(dirDeg(e), rd) > FOLD_MATCH_ANGLE_DEG) continue;
    const d = Math.abs(sideOf(e, mid));
    if (d > FOLD_MATCH_OFFSET_MM) continue;
    const t0 = along(e, ref.a);
    const t1 = along(e, ref.b);
    if (Math.max(t0, t1) < 0 || Math.min(t0, t1) > e.lenMm) continue;
    if (!best || d < best.d) best = { e, d };
  }
  if (best || !refBox || !box) return best?.e ?? null;
  const rel = (p: PtMm, b: BoxMm) => ({
    x: (p.x - b.minX) / Math.max(1e-6, b.maxX - b.minX),
    y: (p.y - b.minY) / Math.max(1e-6, b.maxY - b.minY),
  });
  const rm = rel(mid, refBox);
  const refLen = dist(ref.a, ref.b);
  for (const e of edges) {
    if (lineAngle(dirDeg(e), rd) > FOLD_MATCH_ANGLE_DEG) continue;
    const r = e.lenMm / refLen;
    if (r < 0.6 || r > 1.6) continue;
    const em = rel({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, box);
    const d = Math.hypot(em.x - rm.x, em.y - rm.y);
    if (d <= 0.15 && (!best || d < best.d)) best = { e, d };
  }
  return best?.e ?? null;
}

/** Tolerance of the loose match: how far a drawn fold edge may wander off its line, mm. */
export const FOLD_LOOSE_TOL_MM = 3;

/**
 * The fold edge of another size when no clean straight edge matches `ref` (E4: redcafe 44 draws
 * its CB with a notch bump and a slight drift): the outline's supporting line on ref's side, its
 * direction refitted to the outline vertices within 3 mm of it, kept when that run spans ≥ 60 % of
 * ref's length. Unfold it with `unfold(…, FOLD_LOOSE_TOL_MM)` — the run is straightened onto the
 * line. Null when the outline has no such run.
 */
export function looseFoldEdge(
  outline: readonly PtMm[],
  ref: FoldLine,
  refBox: BoxMm,
  box: BoxMm,
): FoldEdge | null {
  const pts = ccw([...outline]);
  if (pts.length < 3) return null;
  let u = unit(ref);
  // ref's side of its own outline, relative to the box centre: the same side here
  const c0 = { x: (refBox.minX + refBox.maxX) / 2, y: (refBox.minY + refBox.maxY) / 2 };
  const rm = { x: (ref.a.x + ref.b.x) / 2, y: (ref.a.y + ref.b.y) / 2 };
  const nrm = (v: PtMm) => ({ x: -v.y, y: v.x });
  let n = nrm(u);
  const sign = Math.sign((rm.x - c0.x) * n.x + (rm.y - c0.y) * n.y) || 1;
  const runOf = (tol: number) => {
    const h = pts.map((p) => sign * (p.x * n.x + p.y * n.y));
    const top = Math.max(...h);
    return { run: pts.filter((_, i) => top - h[i] <= tol), top };
  };
  // pass 1 along ref's direction, generous; refit the direction to that run; pass 2 tight
  const first = runOf(FOLD_LOOSE_TOL_MM * 2).run;
  if (first.length >= 2) {
    const mx = first.reduce((a, p) => a + p.x, 0) / first.length;
    const my = first.reduce((a, p) => a + p.y, 0) / first.length;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const p of first) {
      sxx += (p.x - mx) ** 2;
      sxy += (p.x - mx) * (p.y - my);
      syy += (p.y - my) ** 2;
    }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const v = { x: Math.cos(th), y: Math.sin(th) };
    if (lineAngle(dirDeg({ a: { x: 0, y: 0 }, b: v }), dirDeg(ref)) <= 5) {
      u = v.x * u.x + v.y * u.y >= 0 ? v : { x: -v.x, y: -v.y };
      n = nrm(u);
    }
  }
  const { run } = runOf(FOLD_LOOSE_TOL_MM);
  if (run.length < 2) return null;
  const t = run.map((p) => p.x * u.x + p.y * u.y);
  const t0 = Math.min(...t);
  const t1 = Math.max(...t);
  if (t1 - t0 < 0.6 * dist(ref.a, ref.b)) return null;
  // the line where most of the run lies (its median offset): a notch bump is an outlier, snapped in
  const offs = run.map((p) => p.x * n.x + p.y * n.y).sort((a, b) => a - b);
  const off = offs[Math.floor(offs.length / 2)];
  const at = (tt: number) => ({ x: u.x * tt + n.x * off, y: u.y * tt + n.y * off });
  void box;
  return { a: at(t0), b: at(t1), lenMm: t1 - t0 };
}

/** A fold word as printed: the text, its glyph-box centre, baseline direction and font size. */
export type FoldText = { text: string; at: PtMm; dirDeg: number; sizeMm: number };

/**
 * The edge a fold word labels, or null: its centre within max(40 mm, 4 × font) of the edge's line
 * and projecting onto the edge (±10 %), its baseline within 20° of the edge, and no OTHER drawn line
 * nearer to it — `nearerLine(p, d, edge)` says whether a line that is not this edge lies within d of
 * p. The nearest qualifying edge wins.
 */
export function bindFoldText(
  t: FoldText,
  edges: readonly FoldEdge[],
  nearerLine: (p: PtMm, d: number, edge: FoldEdge) => boolean,
): { edge: FoldEdge; d: number } | null {
  let best: { edge: FoldEdge; d: number } | null = null;
  const maxD = Math.max(FOLD_TEXT_MAX_MM, 4 * t.sizeMm);
  for (const e of edges) {
    const s = along(e, t.at);
    if (s < -0.1 * e.lenMm || s > 1.1 * e.lenMm) continue;
    const d = Math.abs(sideOf(e, t.at));
    if (d > maxD) continue;
    if (lineAngle(t.dirDeg, dirDeg(e)) > FOLD_TEXT_ANGLE_DEG) continue;
    if (nearerLine(t.at, d, e)) continue;
    if (!best || d < best.d) best = { edge: e, d };
  }
  return best;
}

/**
 * Unfold sanity: no bay deeper than this many times its width opens along the fold line (a plunging
 * V neck at 7° from the fold is the steepest real shape that still passes).
 */
export const FOLD_SLOT_DEPTH_RATIO = 4;
/** …counted only past this overhang beyond the fold line's ends, mm. */
export const FOLD_SLOT_MIN_MM = 30;
/** A whole piece larger than this either way is not believable, mm. */
export const FOLD_MAX_SIDE_MM = 2000;

/**
 * Why `whole` — a half mirrored across `axis` (the fold line, end to end on the outline) — is not a
 * believable whole piece, or null:
 *   • the outline crosses itself (and the half did not);
 *   • its area is not twice the half's (± 1 %), when the half is given;
 *   • it is not mirror-symmetric about the axis (± 1 mm);
 *   • a slot opens along the axis: outline running beyond the fold line's ends close to the axis
 *     (deeper than 4 × the slot's width) — a half unfolded across the wrong edge (palto 22: the
 *     back mirrored across its vent edge made a C with the vent cut out of its middle);
 *   • it is larger than 2 m either way.
 * Shared by semantics (before a size is written) and the gate (G6, on the written cut line).
 */
export function foldShapeProblem(
  whole: readonly PtMm[],
  axis: readonly [PtMm, PtMm],
  half?: readonly PtMm[] | null,
): string | null {
  const f = { a: axis[0], b: axis[1] };
  const L = dist(f.a, f.b);
  if (!(L > 0)) return 'the fold line has no length';
  // a half that already crosses itself is the fill's defect (the offset blocks it), not the fold's
  if (selfIntersects(whole) && !(half && selfIntersects(half)))
    return 'the unfolded outline crosses itself';
  if (half && half.length >= 3) {
    const e = unfoldAreaError(half, whole);
    if (!(e <= 0.01))
      return `the unfolded area is not twice the half (${(e * 100).toFixed(1)} % off)`;
  }
  const b = bboxOf(whole);
  if (b.maxX - b.minX > FOLD_MAX_SIDE_MM || b.maxY - b.minY > FOLD_MAX_SIDE_MM)
    return `the unfolded piece is ${(b.maxX - b.minX).toFixed(0)} × ${(b.maxY - b.minY).toFixed(0)} mm`;
  const samples = sampleAlong(whole, true, 5);
  const M = reflection(f.a, f.b);
  const idx = new SegIndex([{ pts: whole, closed: true }], 10);
  let asym = 0;
  for (const p of samples) asym = Math.max(asym, idx.nearest(applyAffine(M, p), 50));
  if (asym > 1)
    return `the unfolded outline is not symmetric about the fold (${asym === Infinity ? '> 50' : asym.toFixed(1)} mm)`;
  // Past the fold line's ends the outline must turn away from the axis. Two signatures of a half
  // unfolded across the wrong edge: a narrow slot (deeper than 4 × its width), or a stretch running
  // PARALLEL to the axis (≤ 15°) close to it (< ½ the fold length) for > max(100 mm, 0.3 × fold) —
  // palto 22's CB above its vent, 128 mm off the vent edge it was unfolded across. A neckline
  // turning up at the end of a CF fold rises away from the axis, so it passes.
  let slot: { o: number; h: number } | null = null;
  let run = 0;
  let worstRun = 0;
  let prev: { s: number; h: number; side: number } | null = null;
  for (let i = 0; i <= samples.length; i++) {
    const p = samples[i % samples.length];
    const s = along(f, p);
    const o = s < 0 ? -s : s > L ? s - L : 0;
    const h = Math.abs(sideOf(f, p));
    const side = s < 0 ? -1 : s > L ? 1 : 0;
    if (
      o > FOLD_SLOT_MIN_MM &&
      o > FOLD_SLOT_DEPTH_RATIO * 2 * h &&
      (!slot || o / Math.max(h, 1e-6) > slot.o / Math.max(slot.h, 1e-6))
    )
      slot = { o, h };
    const cur = { s, h, side };
    if (prev && o > FOLD_SLOT_MIN_MM && side === prev.side && h < 0.5 * L) {
      const ds = Math.abs(s - prev.s);
      const dh = Math.abs(h - prev.h);
      if (ds > 0 && dh <= ds * Math.tan((15 * Math.PI) / 180)) run += Math.hypot(ds, dh);
      else run = 0;
    } else run = 0;
    worstRun = Math.max(worstRun, run);
    prev = cur;
  }
  if (slot)
    return `a ${(2 * slot.h).toFixed(0)} mm slot runs ${slot.o.toFixed(0)} mm along the fold line — not a fold edge`;
  if (worstRun > Math.max(100, 0.3 * L))
    return `the outline runs ${worstRun.toFixed(0)} mm along the fold line past its end — not a fold edge`;
  return null;
}

/**
 * "Cut on fold" as a cutting-list phrase — never the bare verb ("9 Fold igen ærmerne sammen" is a
 * sewing step): on fold, mod fold, im (Stoff)bruch, со сгибом, по сгибу, au pli, na zgięciu, al
 * doblez, sulla piega, op de vouw, centre back fold.
 */
const CUT_ON_FOLD =
  /on\s+(?:the\s+)?fold|mod\s+fold|im\s*(?:stoff)?bruch|stoffbruch|со\s+сгибом|по\s+сгибу|au\s+pli|na\s+zgi[eę]ciu|al\s+doblez|sulla\s+piega|op\s+de\s+vouw|(?:centre|center|cb)\s+(?:back\s+)?fold/iu;
/** A numbered cutting-list line: "26 Обтачка горловины спинки со сгибом 1х", "67. Forstykke, 1 gang mod fold". */
const LIST_LINE = new RegExp(String.raw`^\s*(${PIECE_NO_SRC})\s*[.\-–:)]?\s+\S`, 'iu');
/** List-shaped: a line that starts with a digit (a piece number the grammar may not take). */
const LIST_SHAPED = /^\s*\d/u;

/** One "cut on fold" line of the cutting list. */
export type FoldListEntry = {
  /** As printed ("1 - Спинка со сгибом 1 дет."). */
  text: string;
  /** Its piece number ("1", "9", "2a"). */
  no: string;
  /** The piece's name words, lower case, without the number, the fold phrase and the count. */
  words: string[];
  /**
   * T4 backstop: a list-shaped "cut on fold" line the number grammar does not take ("1234 BACK
   * …"). Never bound to a piece, never dropped — an unbound file-level entry.
   */
  unparsed?: boolean;
};

const LIST_NOISE =
  /on\s+(?:the\s+)?fold|mod\s+fold|im\s*(?:stoff)?bruch|stoffbruch|со\s+сгибом|по\s+сгибу|au\s+pli|na\s+zgi[eę]ciu|al\s+doblez|sulla\s+piega|op\s+de\s+vouw|\bcut\b|\bgang\b|\bdet\b|дет|\d+\s*[xх×]|[xх×]\s*\d+|\d+/giu;

/**
 * The cutting list's fold pieces, from the document's text (instruction pages): numbered lines that
 * say "cut on fold", one per number. The sheet may draw these pieces with curves only (r4454), so
 * each entry is bound to a piece only by its printed number or name (`bindFoldListEntry`).
 */
export function foldListEntries(texts: readonly string[]): FoldListEntry[] {
  const byNo = new Map<string, FoldListEntry>();
  const unparsed = new Map<string, FoldListEntry>();
  for (const raw of texts) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!CUT_ON_FOLD.test(t)) continue;
    const m = LIST_LINE.exec(t);
    if (!m) {
      if (LIST_SHAPED.test(t) && !unparsed.has(t))
        unparsed.set(t, { text: t, no: '', words: [], unparsed: true });
      continue;
    }
    const no = m[1].toLowerCase();
    if (byNo.has(no)) continue;
    const words = t
      .slice(m[0].length - 1)
      .replace(LIST_NOISE, ' ')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 3);
    byNo.set(no, { text: t, no, words });
  }
  return [...byNo.values(), ...unparsed.values()];
}

const normLabel = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,:;()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The piece a cutting-list entry names (S5: entries are bound, never counted): a piece whose label
 * (its seed's text, or a title label inside it) IS the entry's number ("1", "9." for 9), else the
 * one piece whose title holds every name word of the entry. Null when no piece, or more than one,
 * fits — the entry then stays a file-level question.
 */
export function bindFoldListEntry<S>(
  e: FoldListEntry,
  pieces: readonly { seed: S; labels: readonly string[] }[],
): S | null {
  if (e.unparsed || !e.no) return null;
  const byNo = pieces.filter((p) => p.labels.some((l) => normLabel(l) === e.no));
  if (byNo.length === 1) return byNo[0].seed;
  if (byNo.length > 1 || !e.words.length) return null;
  const byName = pieces.filter((p) =>
    p.labels.some((l) => {
      const ws = normLabel(l).split(/[^\p{L}]+/u);
      return e.words.every((w) =>
        ws.some((x) => x.startsWith(w) || (w.startsWith(x) && x.length >= 4)),
      );
    }),
  );
  return byName.length === 1 ? byName[0].seed : null;
}

/** The drawn lines around a piece that are not its own outline (any size): see `foldWordRole`. */
export type OtherLines = {
  /** Is a line other than `edge` within d of p? */
  nearer: (p: PtMm, d: number, edge: FoldEdge) => boolean;
  /** The nearest such line within maxD of p, with its direction at the nearest point. */
  nearest: (
    p: PtMm,
    maxD: number,
  ) => { pts: PtMm[]; closed: boolean; d: number; dirDeg: number } | null;
};

/**
 * What a fold word in or beside a piece says about it:
 *   • 'edge'     — it labels a straight edge of the outline (`bindFoldText`), or the line it labels
 *                  runs along such an edge (a fold bracket / symbol line): a cut-on-fold claim;
 *   • 'internal' — it labels a line that crosses the piece from outline to outline (a welt's or a
 *                  facing's fold-back line, zhaket 10 "Umbruch"): kept as an internal line, no claim;
 *   • 'label'    — it labels no line ("Спинка со сгибом" beside the grain arrow): a claim with no
 *                  edge — the operator is asked.
 */
export function foldWordRole(
  t: FoldText,
  edges: readonly FoldEdge[],
  outer: readonly PtMm[],
  lines: OtherLines,
):
  | { kind: 'edge'; edge: FoldEdge; d: number; how: 'text' | 'symbol' }
  | { kind: 'internal' }
  | { kind: 'label' } {
  const b = bindFoldText(t, edges, lines.nearer);
  if (b) return { kind: 'edge', edge: b.edge, d: b.d, how: 'text' };
  const maxD = Math.max(FOLD_TEXT_MAX_MM, 4 * t.sizeMm);
  const L = lines.nearest(t.at, maxD);
  if (!L || lineAngle(L.dirDeg, t.dirDeg) > FOLD_TEXT_ANGLE_DEG) return { kind: 'label' };
  if (!L.closed && L.pts.length >= 2) {
    const e0 = closestOnPolyline(L.pts[0], outer, true).d;
    const e1 = closestOnPolyline(L.pts[L.pts.length - 1], outer, true).d;
    if (e0 <= 3 && e1 <= 3) return { kind: 'internal' };
  }
  const chord = { a: L.pts[0], b: L.pts[L.pts.length - 1] };
  if (dist(chord.a, chord.b) > 0)
    for (const e of edges) {
      if (lineAngle(dirDeg(chord), dirDeg(e)) > 10) continue;
      const fits = L.pts.every((q) => {
        const s = along(e, q);
        return Math.abs(sideOf(e, q)) <= maxD && s >= -0.1 * e.lenMm && s <= 1.1 * e.lenMm;
      });
      if (fits) return { kind: 'edge', edge: e, d: Math.abs(sideOf(e, t.at)), how: 'symbol' };
    }
  return { kind: 'label' };
}
