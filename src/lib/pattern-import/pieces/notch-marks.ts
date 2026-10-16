// SHAPE (owner 16.10, card 49 = kombinezon): a notch drawn as a small closed MARK centred on the
// size line — a circle (Ø ≈ 8 mm, kombinezon), a triangle, a square — is a notch, never outline
// geometry. The fill takes such a mark as a wall of the size whose pen it is drawn in, and the
// outline then runs around half of it: a dip or a bump in the cut line that the offset makes worse,
// in some sizes only (the ones the mark's pen belongs to).
//
// Two passes:
//   1. clean (pieces stage, `cleanNotchMarks`, every fill / refill / edit) — each size's outline
//      stretch that runs ALONG a mark centred on that stretch is replaced by the size's own drawn
//      line under the mark (a wall chain through both ends), else the line straight across, else
//      the corner the two edges meet at; the mark leaves the size's walls (`notchMarks` keeps it).
//      Everything after — offset (seam / cut), the gate's walls (G3/G4), the preview — sees the
//      clean line;
//   2. read (semantics, `readNotchMarks`, per family) — a mark whose centre lies ON a size's clean outline is that size's notch (layer 4) when a
//      second, independent evidence says it belongs to that size (D3):
//        • pen    — the mark's class is one of this size's wall classes, or a common / notch class;
//        • wall   — the fill used the mark as this size's wall (its outline ran along it);
//        • series — the family draws one such mark per size: the mark is centred on exactly this
//                   size's line, and marks of about its size sit centred on ≥ 3 sizes' lines
//                   nearby — the graded copies of one notch.
//      A series mark drawn a little off its size's line (it crosses exactly one size's line, and
//      that size has no notch at that spot) is that size's copy (series + crossing).
//      A size whose line carries no mark of its own gets none here: nothing is invented. The family
//      gate (gate/shape.ts, in G5) then holds the export when the sizes differ.
//
// This module is deliberately narrow: the GRADE phase (auto/GRADE-BRIEF.md) may replace it with a
// grading-aware transfer.

import type { ChainId, ChainSet, NotchFeature, PieceCandidate, PieceFamily, PtMm } from '../types';
import { PATIMPORT } from '../types';
import { areaOf, bboxOf, closestOnPolyline, dist, pointInPolygon } from '../semantics/geom';

/** A mark is at most this big across (its bbox's longer side), mm — a notch circle (kombinezon:
 * 11.3 mm), not a buttonhole. */
export const MARK_MAX_MM = 13;
export const MARK_MIN_MM = 3;
/** …and compact: its box's shorter side at least this share of the longer. */
const MARK_COMPACT = 0.6;
/** An outline vertex this close to a mark runs along it, mm. */
const ALONG_MM = 0.5;
/** A mark's centre this close to a size's clean outline sits ON it: 15 % of the mark, 0.75–1.5 mm. */
export const MARK_ON_MM = 0.75;
const onTol = (m: { across: number }) => Math.min(1.5, Math.max(MARK_ON_MM, 0.15 * m.across));
/**
 * A mark STRADDLES a line when its centre is within this share of its size of it (the line runs
 * through its middle part): enough to clean the outline around it, and — with the size's own
 * wall — to read it as that size's notch.
 */
const CROSS_SHARE = 0.35;
/** A stretch is only cleaned when it leaves the clean line by at least this much, mm. */
const DETOUR_MIN_MM = 0.75;
/** Series copies: a sibling mark within this distance, its size within this share. */
const SERIES_REACH_MM = 60;
/** …and graded copies when they sit on at least this many sizes' lines (one size each). */
const SERIES_MIN_RANKS = 3;
const SERIES_SIZE_TOL = 0.3;

type Mark = {
  id: ChainId;
  pts: PtMm[];
  centre: PtMm;
  across: number;
  box: ReturnType<typeof bboxOf>;
};

export type MarkRead = {
  /** The clean outline (same orientation as the candidate's). */
  outer: PtMm[];
  /** Marks the outline ran around and now crosses straight. */
  cleaned: ChainId[];
  notches: NotchFeature[];
  /** Marks centred on this size's line refused for want of a second evidence. */
  refused: ChainId[];
};

function marksOf(set: ChainSet, box: ReturnType<typeof bboxOf>): Mark[] {
  const out: Mark[] = [];
  for (const ch of set.chains) {
    if (!ch.closed || ch.pts.length < 3) continue;
    const b = bboxOf(ch.pts);
    const across = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    if (across > MARK_MAX_MM || across < MARK_MIN_MM) continue;
    // compact (a circle, a square, a triangle) — a buttonhole or a slot is long and thin
    if (Math.min(b.maxX - b.minX, b.maxY - b.minY) < MARK_COMPACT * across) continue;
    if (b.maxX < box.minX || b.minX > box.maxX || b.maxY < box.minY || b.minY > box.maxY) continue;
    out.push({
      id: ch.id,
      pts: ch.pts,
      centre: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      across,
      box: b,
    });
  }
  return out;
}

/** Marks with ≥ SERIES_MIN_RANKS alike marks (itself included) within reach: graded copies. */
const seriesOf = (marks: readonly Mark[]): Set<ChainId> =>
  new Set(
    marks
      .filter(
        (m) =>
          marks.filter(
            (o) =>
              dist(o.centre, m.centre) <= SERIES_REACH_MM &&
              Math.abs(o.across - m.across) <= SERIES_SIZE_TOL * m.across,
          ).length >= SERIES_MIN_RANKS,
      )
      .map((m) => m.id),
  );

const near = (m: Mark, p: PtMm, tol: number) =>
  p.x >= m.box.minX - tol &&
  p.x <= m.box.maxX + tol &&
  p.y >= m.box.minY - tol &&
  p.y <= m.box.maxY + tol &&
  closestOnPolyline(p, m.pts, true).d <= tol;

/** Point `d` mm back (dir −1) / forward (dir 1) from vertex i along the ring, not entering `skip`. */
function walk(pts: readonly PtMm[], i: number, dir: 1 | -1, d: number): PtMm {
  const n = pts.length;
  let k = i;
  let left = d;
  for (let s = 0; s < n; s++) {
    const j = (k + dir + n) % n;
    const L = dist(pts[k], pts[j]);
    if (L >= left && L > 0) {
      const t = left / L;
      return { x: pts[k].x + (pts[j].x - pts[k].x) * t, y: pts[k].y + (pts[j].y - pts[k].y) * t };
    }
    left -= L;
    k = j;
  }
  return pts[k];
}

/** Where line P + t·u meets line Q + s·v (t, s along each), or null when nearly parallel. */
function meet(P: PtMm, u: PtMm, Q: PtMm, v: PtMm): { X: PtMm; t: number; s: number } | null {
  const den = u.x * v.y - u.y * v.x;
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  if (!lu || !lv || Math.abs(den) / (lu * lv) < Math.sin((15 * Math.PI) / 180)) return null;
  const t = ((Q.x - P.x) * v.y - (Q.y - P.y) * v.x) / den;
  const s = ((Q.x - P.x) * u.y - (Q.y - P.y) * u.x) / den;
  return { X: { x: P.x + t * u.x, y: P.y + t * u.y }, t, s };
}

/**
 * The stretch of one drawn line (a wall chain of the size) from P to Q — both within ALONG_MM + 0.2
 * of it — when it is short (≤ 1.6 × the chord + 1 mm): the size's own line under a mark.
 */
function lineUnder(
  lines: readonly { pts: readonly PtMm[]; closed: boolean }[],
  P: PtMm,
  Q: PtMm,
): PtMm[] | null {
  const tol = ALONG_MM + 0.2;
  const chord = dist(P, Q);
  let best: PtMm[] | null = null;
  let bestLen = Infinity;
  // every short path found: two drawn lines that disagree under the mark (> 0.3 mm) = no answer
  const found: PtMm[][] = [];
  const apart = (a: PtMm[], b: PtMm[]) =>
    a.some((q) => closestOnPolyline(q, b, false).d > 0.3) ||
    b.some((q) => closestOnPolyline(q, a, false).d > 0.3);
  for (const l of lines) {
    const n = l.pts.length;
    if (n < 2) continue;
    const a = closestOnPolyline(P, l.pts, l.closed);
    if (a.d > tol) continue;
    const b = closestOnPolyline(Q, l.pts, l.closed);
    if (b.d > tol) continue;
    const sa = a.seg + a.t;
    const sb = b.seg + b.t;
    const fwd = (from: { seg: number }, to: { seg: number }, wrap: boolean): PtMm[] => {
      const mid: PtMm[] = [];
      let i = from.seg + 1;
      for (let s = 0; s < n; s++, i = (i + 1) % n) {
        if (!wrap && i > to.seg) break;
        if (wrap && i === (to.seg + 1) % n) break;
        mid.push(l.pts[i % n]);
      }
      return mid;
    };
    const ways: PtMm[][] = [];
    if (sa <= sb) ways.push([P, ...fwd(a, b, false), Q]);
    else ways.push([Q, ...fwd(b, a, false), P].reverse());
    if (l.closed) {
      // the other way round the ring
      if (sa <= sb) ways.push([Q, ...fwd(b, a, true), P].reverse());
      else ways.push([P, ...fwd(a, b, true), Q]);
    }
    for (const w of ways) consider(w);
  }
  if (found.length > 1 && found.some((w) => apart(w, found[0]))) return null;
  if (best) return best;
  // the line split where the mark sits on it: P on one chain, Q on another, two of their ends meet
  // (≤ 1 mm) between them
  const toEnds = (l: { pts: readonly PtMm[] }, from: PtMm) => {
    const f = closestOnPolyline(from, l.pts, false);
    if (f.d > tol) return [];
    return [
      [from, ...l.pts.slice(0, f.seg + 1).reverse()],
      [from, ...l.pts.slice(f.seg + 1)],
    ];
  };
  const open = lines.filter((l) => !l.closed && l.pts.length >= 2);
  for (const A of open)
    for (const pa of toEnds(A, P))
      for (const B of open) {
        if (B === A) continue;
        for (const qb of toEnds(B, Q)) {
          const ea = pa[pa.length - 1];
          const eb = qb[qb.length - 1];
          if (dist(ea, eb) <= 1) consider([...pa, ...[...qb].reverse()]);
        }
      }
  return best;

  function consider(w: PtMm[]) {
    let L = 0;
    for (let i = 1; i < w.length; i++) L += dist(w[i - 1], w[i]);
    if (L > 1.6 * chord + 1) return;
    found.push(w);
    if (L < bestLen) {
      best = w;
      bestLen = L;
    }
  }
}

function distToPath(p: PtMm, path: readonly PtMm[]): number {
  return closestOnPolyline(p, path, false).d;
}

/** One size's outline with every stretch running around a centred mark replaced (see top). */
export function cleanAroundMarks(
  outer: readonly PtMm[],
  marks: readonly Mark[],
  lines: readonly { pts: readonly PtMm[]; closed: boolean }[] = [],
  log?: string[],
  /** marks of a graded series (≥ 3 alike nearby): only these may be crossed without a drawn line */
  series?: ReadonlySet<ChainId>,
): { outer: PtMm[]; cleaned: ChainId[] } {
  const n = outer.length;
  if (n < 4 || !marks.length) return { outer: [...outer], cleaned: [] };
  const on: number[] = outer.map((p) => {
    for (let k = 0; k < marks.length; k++) if (near(marks[k], p, ALONG_MM)) return k;
    return -1;
  });
  if (on.every((k) => k >= 0)) return { outer: [...outer], cleaned: [] };
  // start the scan on a vertex that runs along no mark: every run is then contiguous
  const start = on.findIndex((k) => k < 0);
  type Run = { s: number; e: number; mark: number };
  const runs: Run[] = [];
  for (let t = 0; t < n; t++) {
    const i = (start + t) % n;
    const k = on[i];
    if (k < 0) continue;
    const last = runs[runs.length - 1];
    if (last && last.mark === k && last.e === (i - 1 + n) % n) last.e = i;
    else runs.push({ s: i, e: i, mark: k });
  }
  const verts = (s0: number, e0: number) => {
    const v: PtMm[] = [];
    for (let i = s0; ; i = (i + 1) % n) {
      v.push(outer[i]);
      if (i === e0) break;
    }
    return v;
  };
  const replace = new Map<number, { e: number; path: PtMm[] }>();
  const cleaned: ChainId[] = [];
  for (const r of runs) {
    if (r.s === r.e) continue;
    const m = marks[r.mark];
    // a stretch around most of the mark is not a notch on a line (the piece is the mark, or worse)
    const run0 = verts(r.s, r.e);
    let runLen = 0;
    for (let i = 1; i < run0.length; i++) runLen += dist(run0[i - 1], run0[i]);
    let markLen = 0;
    for (let i = 0; i < m.pts.length; i++) markLen += dist(m.pts[i], m.pts[(i + 1) % m.pts.length]);
    log?.push(`#${m.id} run ${r.s}-${r.e} len ${runLen.toFixed(1)}/${markLen.toFixed(1)}`);
    if (runLen > 0.75 * markLen) continue;
    // the size's own line under the mark — the fill may leave the mark a vertex early / late (a
    // short cut across to the line): the stretch widens by one vertex on that side when that vertex
    // is close to the mark and runs along no other
    const sp = (r.s - 1 + n) % n;
    const ep = (r.e + 1) % n;
    const close = (i: number) =>
      on[i] < 0 && closestOnPolyline(outer[i], m.pts, true).d <= m.across / 4;
    let s0 = r.s;
    let e0 = r.e;
    let path: PtMm[] | null = null;
    let how = 'drawn';
    for (const [a, b] of [
      [r.s, r.e],
      [r.s, ep],
      [sp, r.e],
      [sp, ep],
    ] as const) {
      if ((a !== r.s && !close(a)) || (b !== r.e && !close(b)) || a === b) continue;
      path = lineUnder(lines, outer[a], outer[b]);
      if (path) {
        s0 = a;
        e0 = b;
        break;
      }
    }
    // else straight across, or the corner the two edges meet at — only for a mark of a graded
    // series (the mark's kind is proven by its copies; one lone mark without the line under it is
    // left as drawn and the family gate asks)
    if (!path && series && !series.has(m.id)) continue;
    if (!path) {
      const P = outer[r.s];
      const Q = outer[r.e];
      path = [P, Q];
      how = 'chord';
      const before = walk(outer, r.s, -1, 2);
      const after = walk(outer, r.e, 1, 2);
      const u = { x: P.x - before.x, y: P.y - before.y };
      const v = { x: after.x - Q.x, y: after.y - Q.y };
      const x = meet(P, u, Q, { x: -v.x, y: -v.y });
      if (x && x.t > 0 && x.s > 0 && dist(x.X, m.centre) <= m.across / 2) {
        path = [P, x.X, Q];
        how = 'corner';
      }
    }
    const run = verts(s0, e0);
    const dev = Math.max(...run.map((q) => distToPath(q, path!)));
    log?.push(
      `#${m.id} path ${how} centre ${distToPath(m.centre, path).toFixed(2)} dev ${dev.toFixed(2)}`,
    );
    // the mark must straddle the line it interrupts (a notch mark sits on it)…
    if (distToPath(m.centre, path) > CROSS_SHARE * m.across) continue;
    // …and the outline must actually leave that line around it
    if (dev < DETOUR_MIN_MM) continue;
    replace.set(s0, { e: e0, path });
    cleaned.push(m.id);
  }
  if (!replace.size) return { outer: [...outer], cleaned };
  const res: PtMm[] = [];
  for (let t = 0; t < n; ) {
    const i = (start + t) % n;
    const rep = replace.get(i);
    if (rep) {
      res.push(...rep.path.slice(0, -1));
      t += (rep.e - i + n) % n; // the exit vertex is pushed next
      continue;
    }
    res.push(outer[i]);
    t++;
  }
  return { outer: res, cleaned };
}

/** A notch at the point of `outer` nearest to `p`, pointing inward, depth from the mark. */
function notchAt(outer: readonly PtMm[], p: PtMm, across: number): NotchFeature {
  const f = closestOnPolyline(p, outer, true);
  const a = outer[f.seg];
  const b = outer[(f.seg + 1) % outer.length];
  const L = dist(a, b) || 1;
  let nx = -(b.y - a.y) / L;
  let ny = (b.x - a.x) / L;
  if (!pointInPolygon({ x: f.q.x + nx * 0.5, y: f.q.y + ny * 0.5 }, outer)) {
    nx = -nx;
    ny = -ny;
  }
  const depth = Math.min(PATIMPORT.notchMaxMm, Math.max(PATIMPORT.notchMinMm, across / 2));
  return {
    kind: 'notch',
    at: f.q,
    seg: [f.q, { x: f.q.x + nx * depth, y: f.q.y + ny * depth }],
    depthMm: depth,
    origin: 'detected',
    ranges: [],
    confidence: 0.85,
  };
}

/**
 * Every size of one family (candidates of one seed, any order): the clean outline and the notch
 * marks of each, keyed by rank. Families without marks come back unchanged (empty map).
 */
export function readNotchMarks(
  cands: readonly PieceCandidate[],
  set: ChainSet,
  log?: string[],
): Map<number, MarkRead> {
  const out = new Map<number, MarkRead>();
  const live = cands.filter((c) => c.outer.length >= 3);
  if (!live.length) return out;
  const pad = MARK_MAX_MM;
  const fb = bboxOf(
    live.flatMap((c) => [
      { x: c.bbox.minX - pad, y: c.bbox.minY - pad },
      { x: c.bbox.maxX + pad, y: c.bbox.maxY + pad },
    ]),
  );
  const marks = marksOf(set, fb);
  if (!marks.length) return out;
  const clsOf = new Map<number, { id: number; role: string }>();
  for (const k of set.classes) for (const ch of k.chains) clsOf.set(ch, { id: k.id, role: k.role });
  // 1 · clean every size (a no-op after the pieces stage's cleanNotchMarks, kept for the DXF-less
  // callers and as the read's own outline)
  const series = seriesOf(marks);
  const clean = live.map((c) => {
    log?.push(`r${c.rank}:`);
    return { c, ...cleanAroundMarks(c.outer, marks, linesOf(c, set), log, series) };
  });
  // 2 · which sizes' clean lines each mark is centred on (and how far each line passes it)
  const dOf = new Map<ChainId, Map<number, number>>();
  const onRanks = new Map<ChainId, Set<number>>();
  for (const m of marks) {
    const ds = new Map<number, number>();
    const rs = new Set<number>();
    for (const x of clean) {
      const d = closestOnPolyline(m.centre, x.outer, true).d;
      ds.set(x.c.rank, d);
      if (d <= onTol(m)) rs.add(x.c.rank);
    }
    dOf.set(m.id, ds);
    onRanks.set(m.id, rs);
  }
  const ranks = new Set(clean.map((x) => x.c.rank));
  // series: marks of about one size near each other (union-find); a series is graded copies when
  // its marks are centred on at least SERIES_MIN_RANKS distinct sizes' lines, one size each
  const parent = marks.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < marks.length; a++)
    for (let b = a + 1; b < marks.length; b++)
      if (
        dist(marks[a].centre, marks[b].centre) <= SERIES_REACH_MM &&
        Math.abs(marks[a].across - marks[b].across) <= SERIES_SIZE_TOL * marks[a].across
      )
        parent[find(a)] = find(b);
  const seriesRanks = new Map<number, Set<number>>();
  marks.forEach((m, i) => {
    const rs = onRanks.get(m.id)!;
    if (rs.size !== 1) return;
    const g = find(i);
    const set0 = seriesRanks.get(g) ?? new Set<number>();
    for (const r of rs) set0.add(r);
    seriesRanks.set(g, set0);
  });
  const inSeries = (i: number) =>
    ranks.size >= 2 &&
    (seriesRanks.get(find(i))?.size ?? 0) >= Math.min(SERIES_MIN_RANKS, ranks.size);
  const accepted = new Map<
    number,
    { notches: NotchFeature[]; refused: ChainId[]; groups: Set<number> }
  >();
  for (const x of clean) {
    const r = x.c.rank;
    const wallCls = new Set(
      x.c.walls.flatMap((w) => {
        const k = clsOf.get(w);
        return k && k.role === 'size' ? [k.id] : [];
      }),
    );
    const walls = new Set(x.c.walls);
    const notches: NotchFeature[] = [];
    const refused: ChainId[] = [];
    const groups = new Set<number>();
    marks.forEach((m, i) => {
      const rs = onRanks.get(m.id)!;
      if (!rs.has(r)) return;
      const k = clsOf.get(m.id);
      const ownPen =
        !!k &&
        (k.role === 'common' || k.role === 'notch' || (k.role === 'size' && wallCls.has(k.id)));
      // the mark's pen is another size whose line passes it too (lines coincide): that size's mark
      const otherSizeOnIt =
        !!k &&
        k.role === 'size' &&
        !wallCls.has(k.id) &&
        clean.some(
          (o) =>
            o.c.rank !== r && rs.has(o.c.rank) && o.c.walls.some((w) => clsOf.get(w)?.id === k.id),
        );
      const wall = walls.has(m.id) || x.cleaned.includes(m.id) || !!x.c.notchMarks?.includes(m.id);
      const ok = !otherSizeOnIt && (ownPen || wall || (rs.size === 1 && inSeries(i)));
      if (ok) {
        notches.push(notchAt(x.outer, m.centre, m.across));
        groups.add(find(i));
      } else refused.push(m.id);
    });
    // a mark the size's own outline ran around (its wall) that straddles its line off centre: the
    // size's notch (wall + straddle), unless another size's line passes its centre
    marks.forEach((m, i) => {
      const rs = onRanks.get(m.id)!;
      if (rs.size) return;
      const wall = walls.has(m.id) || x.cleaned.includes(m.id) || !!x.c.notchMarks?.includes(m.id);
      const d = dOf.get(m.id)!.get(r) ?? Infinity;
      const ok = wall && d <= CROSS_SHARE * m.across;
      if (ok) {
        notches.push(notchAt(x.outer, m.centre, m.across));
        groups.add(find(i));
      }
    });
    accepted.set(r, { notches, refused, groups });
  }
  // 3 · a series mark drawn off its size's line (kombinezon P01: sizes 8 and 18, ~3 mm off): it
  // crosses exactly one size's line, no size's line passes its centre, and that size has no mark of
  // this series yet — the size's copy of the graded notch (series + crossing: two evidences)
  marks.forEach((m, i) => {
    if (onRanks.get(m.id)!.size || !inSeries(i)) return;
    const ds = [...dOf.get(m.id)!].sort((a, b) => a[1] - b[1]);
    const [r, d] = ds[0] ?? [-1, Infinity];
    if (!(d <= m.across / 2) || (ds[1] && ds[1][1] < 2 * d)) return;
    const acc = accepted.get(r);
    if (!acc) return;
    const x = clean.find((c) => c.c.rank === r)!;
    const n = notchAt(x.outer, m.centre, m.across);
    // the size already has a notch at this spot (its own mark): not a second one
    if (acc.notches.some((o) => dist(o.at, n.at) < m.across)) return;
    acc.notches.push(n);
  });
  for (const x of clean) {
    const acc = accepted.get(x.c.rank)!;
    out.set(x.c.rank, {
      outer: x.outer,
      cleaned: x.cleaned,
      notches: acc.notches,
      refused: acc.refused,
    });
  }
  return out;
}

/** The size's own drawn lines (its walls that are no mark), for the line under a mark. */
function linesOf(c: PieceCandidate, set: ChainSet): { pts: PtMm[]; closed: boolean }[] {
  // the size's own pen (its longest size class among its walls) and the common lines — never
  // another size's line that also bounds it somewhere
  const clsOf = new Map<number, { id: number; role: string }>();
  for (const k of set.classes) for (const ch of k.chains) clsOf.set(ch, { id: k.id, role: k.role });
  const lenBy = new Map<number, number>();
  for (const id of c.walls) {
    const k = clsOf.get(id);
    if (k?.role === 'size')
      lenBy.set(k.id, (lenBy.get(k.id) ?? 0) + (set.chains[id]?.lengthMm ?? 0));
  }
  const own = [...lenBy].sort((a, b) => b[1] - a[1])[0]?.[0];
  return c.walls.flatMap((id) => {
    const ch = set.chains[id];
    if (!ch || ch.pts.length < 2) return [];
    const k = clsOf.get(id);
    if (k && k.role !== 'common' && !(k.role === 'size' && k.id === own)) return [];
    const b = bboxOf(ch.pts);
    if (Math.max(b.maxX - b.minX, b.maxY - b.minY) <= MARK_MAX_MM && ch.closed) return [];
    return [{ pts: ch.pts, closed: ch.closed }];
  });
}

/**
 * Pieces stage (session, after every fill / refill / edit): every candidate's outline stretch that
 * runs around a notch mark centred on it is replaced (see top), the mark leaves the candidate's
 * walls and is kept in `notchMarks`. Candidates without such a stretch are returned as they are.
 */
export function cleanNotchMarks(families: PieceFamily[], set: ChainSet): PieceFamily[] {
  return families.map((f) => {
    const live = f.candidates.filter((c) => c.outer.length >= 3);
    if (!live.length) return f;
    const pad = MARK_MAX_MM;
    const fb = bboxOf(
      live.flatMap((c) => [
        { x: c.bbox.minX - pad, y: c.bbox.minY - pad },
        { x: c.bbox.maxX + pad, y: c.bbox.maxY + pad },
      ]),
    );
    const marks = marksOf(set, fb);
    if (!marks.length) return f;
    const series = seriesOf(marks);
    let changed = false;
    const candidates = f.candidates.map((c) => {
      if (c.outer.length < 3 || c.features?.length) return c;
      const r = cleanAroundMarks(c.outer, marks, linesOf(c, set), undefined, series);
      if (!r.cleaned.length) return c;
      changed = true;
      const gone = new Set(r.cleaned);
      return {
        ...c,
        outer: r.outer,
        walls: c.walls.filter((w) => !gone.has(w)),
        notchMarks: [...new Set([...(c.notchMarks ?? []), ...r.cleaned])],
        areaMm2: areaOf(r.outer),
        bbox: bboxOf(r.outer),
      };
    });
    return changed ? { ...f, candidates } : f;
  });
}
