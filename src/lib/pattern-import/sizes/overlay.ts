// sizes/ (MOOD Ф3, R5) — OVERLAY lines: one edge every size draws in one place, each in its own pen.
//
// Mood draws an edge several sizes share (the top of the back, a facing fold, a collar side) once
// PER SIZE, each in the size's own pen, ≤ 0.03 mm apart — to the eye one line (MOOD-DIAG §1.3, 03).
// Where the lines of ≥ 3 DIFFERENT sizes coincide (≤ 0.15 mm: 0.1 mm + the 0.05 mm curve sagitta)
// and run parallel, the place is proven by three pens: it is an edge of those sizes, not a page
// line, not a guide. Consumers:
//   recover (R5)     a line lying on an overlay whose look names no size is NOT common (a wall of
//                    every size, the sizes that do not run there included): it stays without a size
//                    (orphan) and the legend step asks — never a borrowed wall;
//   continuity (Ф3.2, pieces/walls.ts) a size with no line of its own on an overlay stretch (a motif
//                    whose beads are not read there) closes along the overlay between its OWN two
//                    dangling ends — every millimetre of the stretch proven by three other pens.
import type { PtMm } from 'lib/pattern-import/types';

/** Lines of different sizes within this of each other coincide, mm. */
export const OVERLAY_TOL_MM = 0.15;
/** An overlay is proven by this many different sizes' lines. */
export const OVERLAY_MIN_PENS = 3;
/** …running parallel: |cos| of the angle between them at least this. */
const PARALLEL_COS = 0.96;

/** A segment grid (chains/geom and pieces/geom both have one). */
export type OverlayGrid = {
  near(p: PtMm, r: number, visit: (owner: number, seg: number) => void): void;
};

export type OverlayLines = {
  grid: OverlayGrid;
  /** The polyline of a chain in the grid (closed chains: the grid holds the closing segment). */
  pts: (id: number) => readonly PtMm[] | undefined;
  /** The size rank of a chain in the grid (undefined: not a size line). */
  rank: (id: number) => number | undefined;
};

/** Nearest point on segment a–b, its distance and parameter. */
function foot(p: PtMm, a: PtMm, b: PtMm) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let u = L2 > 1e-12 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  const q = { x: a.x + u * dx, y: a.y + u * dy };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), u, q };
}

/**
 * The size lines through `p` (≤ `tol`), parallel to `t` when given (else to one another's
 * majority): their distinct ranks, the chains, and the overlay's direction there.
 */
export function overlayAt(
  p: PtMm,
  t: PtMm | null,
  L: OverlayLines,
  not: number | null = null,
  tol = OVERLAY_TOL_MM,
): { ranks: Set<number>; chains: Set<number>; dir: PtMm | null } {
  const hits: { id: number; r: number; d: PtMm }[] = [];
  const seen = new Set<number>();
  L.grid.near(p, tol, (id, s) => {
    if (seen.has(id)) return;
    const r = L.rank(id);
    if (r === undefined || r === not) return;
    const pts = L.pts(id);
    if (!pts || pts.length < 2) return;
    const a = pts[s];
    const b = s + 1 < pts.length ? pts[s + 1] : pts[0];
    if (!a || !b) return;
    if (foot(p, a, b).d > tol) return;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-6) return;
    seen.add(id);
    hits.push({ id, r, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } });
  });
  const along = (d: PtMm) =>
    hits.filter((h) => Math.abs(h.d.x * d.x + h.d.y * d.y) >= PARALLEL_COS);
  // no direction given: the one most of the lines share (a line crossing the overlay is not on it)
  let keep: typeof hits = [];
  if (t) keep = along(t);
  else for (const h of hits) if (along(h.d).length > keep.length) keep = along(h.d);
  return {
    ranks: new Set(keep.map((h) => h.r)),
    chains: new Set(keep.map((h) => h.id)),
    dir: keep[0]?.d ?? null,
  };
}

/**
 * Share of a polyline (sampled every `stepMm`, at most 400 samples) lying on an overlay of
 * ≥ `OVERLAY_MIN_PENS` sizes other than `not`, parallel to it.
 */
export function overlayShare(
  pts: readonly PtMm[],
  L: OverlayLines,
  not: number | null = null,
  stepMm = 1,
): number {
  if (pts.length < 2) return 0;
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++)
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  if (total < 1e-6) return 0;
  const step = Math.max(stepMm, total / 400);
  let n = 0;
  let on = 0;
  // samples at arc step/2, 3·step/2, … (never on a vertex the chain shares with a neighbour)
  let next = step / 2;
  let s0 = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-9) continue;
    const t = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    for (; next <= s0 + l; next += step) {
      const k = next - s0;
      n++;
      if (
        overlayAt({ x: a.x + t.x * k, y: a.y + t.y * k }, t, L, not).ranks.size >= OVERLAY_MIN_PENS
      )
        on++;
    }
    s0 += l;
  }
  return n ? on / n : 0;
}

/**
 * MOOD Ф3.2: walk an overlay from `from` along `dir` in 1 mm steps, each step snapped back onto an
 * overlay line (≤ 0.5 mm, parallel — the line walked so far while it lasts, else the nearest) and
 * proven again (≥ `OVERLAY_MIN_PENS` sizes other than `not` within `OVERLAY_TOL_MM`). Stops where
 * the proof fails, where `arrive` says so (`arrived`), or after `maxMm`. Returns the walk as runs,
 * one per line walked on (each run starts where the walk stepped onto that line).
 */
export function walkOverlay(
  from: PtMm,
  dir: PtMm,
  L: OverlayLines,
  not: number | null,
  maxMm: number,
  arrive: (p: PtMm) => boolean,
): { runs: { chain: number; pts: PtMm[] }[]; arrived: boolean } {
  const STEP = 1;
  const SNAP = 0.5;
  const runs: { chain: number; pts: PtMm[] }[] = [];
  let p = from;
  let d = dir;
  for (let walked = 0; walked < maxMm; walked += STEP) {
    const q0 = { x: p.x + d.x * STEP, y: p.y + d.y * STEP };
    const cur = runs.length ? runs[runs.length - 1].chain : null;
    type Hit = { id: number; q: PtMm; t: PtMm; dd: number };
    let best: Hit | null = null;
    let same: Hit | null = null;
    L.grid.near(q0, SNAP, (id, s) => {
      const r = L.rank(id);
      if (r === undefined || r === not) return;
      const ps = L.pts(id);
      if (!ps || ps.length < 2) return;
      const a = ps[s];
      const b = s + 1 < ps.length ? ps[s + 1] : ps[0];
      if (!a || !b) return;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l < 1e-6) return;
      let t = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
      const c = t.x * d.x + t.y * d.y;
      if (Math.abs(c) < PARALLEL_COS) return;
      if (c < 0) t = { x: -t.x, y: -t.y };
      const f = foot(q0, a, b);
      if (f.d > SNAP) return;
      const h = { id, q: f.q, t, dd: f.d };
      if (!best || f.d < best.dd) best = h;
      if (id === cur && (!same || f.d < same.dd)) same = h;
    });
    const pick = (same ?? best) as Hit | null;
    if (!pick) return { runs, arrived: false };
    if (overlayAt(pick.q, pick.t, L, not).ranks.size < OVERLAY_MIN_PENS)
      return { runs, arrived: false };
    if (pick.id !== cur) runs.push({ chain: pick.id, pts: [p] });
    runs[runs.length - 1].pts.push(pick.q);
    p = pick.q;
    d = pick.t;
    if (arrive(pick.q)) return { runs, arrived: true };
  }
  return { runs, arrived: false };
}
