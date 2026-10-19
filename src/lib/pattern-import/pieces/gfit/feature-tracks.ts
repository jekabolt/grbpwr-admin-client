// pieces/gfit · GRADE P1 follow-up: drills and internal lines of one piece across its sizes, as
// TRACKS — the same mark in each size, matched by its place graded linearly by rank (sheet frame on a
// stacked sheet; each size's own centroid frame when the sizes are drawn apart). Used only to apply
// the operator's answer to a count question (semantics/grade-shape.ts):
//   none — the tracks some sizes lack are removed where drawn (counts then equal, else refused);
//   all  — a track drawn in ≥ 2 sizes at grade-consistent places is placed in the sizes lacking it,
//          at its graded place, never more than two sizes beyond the outermost drawn copy, inside the
//          piece; an internal line only when every point of it (both ends included) grades; else
//          refused with the reason. Never automatic.
// Pure, mm.
import type { PtMm } from 'lib/pattern-import/types';
import {
  bboxOf,
  dist,
  pointInPoly,
  segIntersect,
  segNearest,
} from 'lib/pattern-import/pieces/geom';

export type FtItem = { pts: readonly PtMm[]; closed?: boolean; label?: string };
export type FtSize = {
  rank: number;
  token: string;
  cut: readonly PtMm[];
  items: readonly FtItem[];
};
/**
 * `ambiguous`: at some size another mark competed for the same pairing (two marks within reach of
 * one track, or one mark within reach of two) — which copy belongs to which track is then a guess,
 * so no answer is applied on a read with any ambiguous track (Codex r3).
 */
export type FtTrack = {
  members: { k: number; i: number }[];
  consistent: boolean;
  ambiguous: boolean;
};

const K = 17; // points an open line is read at (arc fractions)
const PAIR_PER_RANK_MM = 12;
const RESID_MM = 4;
const PAIR_SLIDE_MM = 15;
const EXTRAP_MAX_RANKS = 2;
const OWN_NEAR_MM = 4;

const centroid = (ps: readonly PtMm[]): PtMm => {
  let x = 0;
  let y = 0;
  for (const p of ps) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, ps.length), y: y / Math.max(1, ps.length) };
};

function byArc(pts: readonly PtMm[], n = K): PtMm[] {
  if (pts.length === 1) return [pts[0]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1];
  const out: PtMm[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < pts.length - 1 && cum[j] < s) j++;
    const a = pts[j - 1];
    const b = pts[j];
    const seg = cum[j] - cum[j - 1];
    const t = seg > 1e-9 ? Math.min(1, Math.max(0, (s - cum[j - 1]) / seg)) : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

const lenOf = (pts: readonly PtMm[], closed = false) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) L += dist(pts[pts.length - 1], pts[0]);
  return L;
};

function fit(xs: readonly number[], ys: readonly number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const b = sxx > 1e-12 ? sxy / sxx : 0;
  const a = my - b * mx;
  let resid = 0;
  for (let i = 0; i < n; i++) resid = Math.max(resid, Math.abs(ys[i] - (a + b * xs[i])));
  return { at: (x: number) => a + b * x, resid };
}

export type FtRead = {
  tracks: FtTrack[];
  /** per size: the frame offset subtracted (zero on a stacked sheet) */
  off: PtMm[];
  /** per size × item: its points in the frame (a drill: one; an open line: K, one orientation per track) */
  rep: PtMm[][][];
};

/** The tracks of one kind of mark across the sizes (any order). */
export function featureTracks(sizes: readonly FtSize[]): FtRead {
  const order = sizes.map((_, k) => k).sort((a, b) => sizes[a].rank - sizes[b].rank);
  const b0 = bboxOf(sizes[order[0]].cut);
  const b1 = bboxOf(sizes[order[order.length - 1]].cut);
  const stacked =
    Math.min(b0.maxX, b1.maxX) > Math.max(b0.minX, b1.minX) &&
    Math.min(b0.maxY, b1.maxY) > Math.max(b0.minY, b1.minY);
  const off = sizes.map((s) => (stacked ? { x: 0, y: 0 } : centroid(s.cut)));
  const rep = sizes.map((s, k) =>
    s.items.map((it) =>
      (it.closed ? [centroid(it.pts)] : byArc(it.pts)).map((p) => ({
        x: p.x - off[k].x,
        y: p.y - off[k].y,
      })),
    ),
  );
  const tracks: FtTrack[] = [];
  const mid = (pts: PtMm[]) => pts[pts.length >> 1];
  // the track's points at rank r: per point index, linear in rank over its members
  const predict = (t: FtTrack, r: number): PtMm[] => {
    const ms = t.members;
    const pts0 = rep[ms[0].k][ms[0].i];
    if (ms.length === 1) return pts0;
    const rs = ms.map((m) => sizes[m.k].rank);
    return pts0.map((_, j) => ({
      x: fit(
        rs,
        ms.map((m) => rep[m.k][m.i][j]?.x ?? 0),
      ).at(r),
      y: fit(
        rs,
        ms.map((m) => rep[m.k][m.i][j]?.y ?? 0),
      ).at(r),
    }));
  };
  for (const k of order) {
    const r = sizes[k].rank;
    const its = sizes[k].items;
    const cands: { i: number; t: number; d: number; flip: boolean }[] = [];
    its.forEach((it, i) => {
      const p = rep[k][i];
      tracks.forEach((t, ti) => {
        const m0 = sizes[t.members[0].k].items[t.members[0].i];
        if (!!m0.closed !== !!it.closed || p.length !== rep[t.members[0].k][t.members[0].i].length)
          return;
        if ((m0.label ?? '') !== (it.label ?? '')) return;
        const L0 = lenOf(m0.pts, m0.closed);
        const L1 = lenOf(it.pts, it.closed);
        if (Math.abs(L0 - L1) > 0.3 * Math.max(L0, L1) + 10) return;
        const near = Math.min(...t.members.map((m) => Math.abs(sizes[m.k].rank - r)));
        const pr = predict(t, r);
        // an open line may be drawn the other way round
        const dF = Math.max(
          dist(p[0], pr[0]),
          dist(mid(p), mid(pr)),
          dist(p[p.length - 1], pr[pr.length - 1]),
        );
        const dR = Math.max(
          dist(p[0], pr[pr.length - 1]),
          dist(mid(p), mid(pr)),
          dist(p[p.length - 1], pr[0]),
        );
        const flip = dR < dF;
        const d = Math.min(dF, dR);
        if (d <= PAIR_PER_RANK_MM * Math.max(1, near)) cands.push({ i, t: ti, d, flip });
      });
    });
    cands.sort((a, b) => a.d - b.d);
    // a pairing with a competitor (an item within reach of two tracks, a track of two items):
    // every track touched by it is ambiguous, and so is a track an item so contested starts
    const perI = new Map<number, number>();
    const perT = new Map<number, number>();
    for (const c of cands) {
      perI.set(c.i, (perI.get(c.i) ?? 0) + 1);
      perT.set(c.t, (perT.get(c.t) ?? 0) + 1);
    }
    const contestedI = new Set<number>();
    for (const c of cands)
      if ((perI.get(c.i) ?? 0) > 1 || (perT.get(c.t) ?? 0) > 1) {
        tracks[c.t].ambiguous = true;
        contestedI.add(c.i);
      }
    const usedI = new Set<number>();
    const usedT = new Set<number>();
    for (const c of cands) {
      if (usedI.has(c.i) || usedT.has(c.t)) continue;
      usedI.add(c.i);
      usedT.add(c.t);
      if (c.flip) rep[k][c.i] = [...rep[k][c.i]].reverse();
      tracks[c.t].members.push({ k, i: c.i });
    }
    its.forEach((_, i) => {
      if (!usedI.has(i))
        tracks.push({
          members: [{ k, i }],
          consistent: true,
          ambiguous: contestedI.has(i) || cands.some((c) => c.i === i),
        });
    });
  }
  // consistency: every point of the mark linear in rank (≥ 3 copies), or a small slide (2 copies);
  // a size inside the span that lacks it but draws another mark there: two marks read as one
  for (const t of tracks) {
    const ms = t.members;
    if (ms.length < 2) continue;
    const rs = ms.map((m) => sizes[m.k].rank);
    const P = rep[ms[0].k][ms[0].i].length;
    let ok = true;
    for (let j = 0; j < P && ok; j++) {
      const xs = ms.map((m) => rep[m.k][m.i][j]);
      if (ms.length >= 3) {
        ok =
          fit(
            rs,
            xs.map((p) => p.x),
          ).resid <= RESID_MM &&
          fit(
            rs,
            xs.map((p) => p.y),
          ).resid <= RESID_MM;
      } else ok = dist(xs[0], xs[1]) <= PAIR_SLIDE_MM * Math.max(1, Math.abs(rs[0] - rs[1]));
    }
    if (ok) {
      const lo = Math.min(...rs);
      const hi = Math.max(...rs);
      for (const k of order) {
        const r = sizes[k].rank;
        if (r <= lo || r >= hi || ms.some((m) => m.k === k)) continue;
        const pr = predict(t, r);
        if (
          rep[k].some(
            (p) => p.length === pr.length && dist(mid(p), mid(pr)) <= 2 * PAIR_PER_RANK_MM,
          )
        )
          ok = false;
      }
    }
    t.consistent = ok;
  }
  return { tracks, off, rep };
}

const distToRing = (p: PtMm, ring: readonly PtMm[]) => {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++)
    best = Math.min(best, segNearest(p, ring[i], ring[(i + 1) % ring.length]).d);
  return best;
};

/**
 * The operator's "in every size" for one track: per size lacking it, the graded mark (in the
 * size's own frame) — or why there is none (then nothing is placed for this track).
 */
export function placeTrack(
  sizes: readonly FtSize[],
  read: FtRead,
  t: FtTrack,
): { ok: true; add: { k: number; item: FtItem; from: string[] }[] } | { ok: false; why: string } {
  const ms = t.members;
  const from = [...ms]
    .sort((a, b) => sizes[a.k].rank - sizes[b.k].rank)
    .map((m) => sizes[m.k].token);
  if (ms.length < 2) return { ok: false, why: `drawn in size ${sizes[ms[0].k].token} only` };
  if (!t.consistent) return { ok: false, why: 'its drawn places do not grade from size to size' };
  if (read.tracks.some((x) => x.ambiguous))
    return { ok: false, why: 'marks lie too close to tell which is which across sizes' };
  const first = sizes[ms[0].k].items[ms[0].i];
  if (first.closed && first.pts.length > 1)
    return { ok: false, why: 'a closed internal line: no grade-derived place for it' };
  const rs = ms.map((m) => sizes[m.k].rank);
  const lo = Math.min(...rs);
  const hi = Math.max(...rs);
  const P = read.rep[ms[0].k][ms[0].i].length;
  const add: { k: number; item: FtItem; from: string[] }[] = [];
  for (let k = 0; k < sizes.length; k++) {
    if (ms.some((m) => m.k === k)) continue;
    const r = sizes[k].rank;
    if (r < lo - EXTRAP_MAX_RANKS || r > hi + EXTRAP_MAX_RANKS)
      return {
        ok: false,
        why: `size ${sizes[k].token} is more than two sizes beyond the sizes that draw it`,
      };
    const pts: PtMm[] = [];
    for (let j = 0; j < P; j++) {
      const xs = ms.map((m) => read.rep[m.k][m.i][j]);
      const x = fit(
        rs,
        xs.map((p) => p.x),
      ).at(r);
      const y = fit(
        rs,
        xs.map((p) => p.y),
      ).at(r);
      pts.push({ x: x + read.off[k].x, y: y + read.off[k].y });
    }
    const cut = sizes[k].cut;
    // inside the piece: every point (only a line's two ends may lie on its cut line, within 1 mm),
    // and no stretch of the line crosses the cut line between its points (a concave outline)
    const outside = {
      ok: false as const,
      why: `its graded place falls outside size ${sizes[k].token}'s outline`,
    };
    for (let j = 0; j < P; j++) {
      const end = P > 1 && (j === 0 || j === P - 1);
      if (!pointInPoly(pts[j], cut) && !(end && distToRing(pts[j], cut) <= 1)) return outside;
    }
    for (let j = 1; j < P; j++)
      for (let e = 0; e < cut.length; e++) {
        const x = segIntersect(pts[j - 1], pts[j], cut[e], cut[(e + 1) % cut.length]);
        if (x && dist(x.p, pts[0]) > 1 && dist(x.p, pts[P - 1]) > 1) return outside;
      }
    if (P === 1 && distToRing(pts[0], cut) < 1)
      return { ok: false, why: `its graded place in size ${sizes[k].token} falls on the outline` };
    // the size draws its own mark there already (read apart): not a second one
    if (
      read.rep[k].some(
        (q) =>
          q.length === P &&
          dist(q[q.length >> 1], {
            x: pts[P >> 1].x - read.off[k].x,
            y: pts[P >> 1].y - read.off[k].y,
          }) < OWN_NEAR_MM,
      )
    )
      return { ok: false, why: `size ${sizes[k].token} draws a mark of its own there` };
    add.push({ k, item: { pts }, from });
  }
  return { ok: true, add };
}
