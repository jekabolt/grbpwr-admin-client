// pieces/gfit · GRADE P1 (owner 16.10, card 49: "the same piece has the same outline in every
// size"): notches of one piece across its sizes, placed on the piece's CANONICAL topology — the grade
// points (corners carried through every size by the cyclic correspondence, checks.ts canonTopology)
// cut each size's line into edges, and a notch is (edge, t = arc share of the edge).
//
//   • a notch drawn in ≥ 2 sizes at a grade-consistent position (same edge, its position along the
//     edge linear in rank) is the piece's notch: it is placed on every size that lacks it
//     (`add`, flagged graded — D5: recorded, counted in the manifest, never presented as drawn);
//   • a notch seen in 1 size of ≥ 3 is a question (`lone`): "in every size / in none / only in this
//     one" — the answer (keyed by `loneKey`) is the operator's, the autopilot never gives it;
//   • without one canonical topology (no unique correspondence, a grade point lost) nothing moves.
// Pure, mm. The notches themselves never touch the outline here (a notch drawn as an outline bump is
// cleaned before: pieces/notch-marks.ts, semantics stripSpikes / slitNotches).
import type { PtMm } from 'lib/pattern-import/types';
import { bboxOf, dist } from 'lib/pattern-import/pieces/geom';

import { canonTopology, outlineOf } from './checks';
import type { GfitOutline } from './outline';

/** A notch farther than this from its size's line is not placed (mm). */
const ON_LINE_MM = 2.5;
/** Two sizes' notches farther apart along their edge than this are not one notch (mm). */
const PAIR_MAX_MM = 15;
/** Leaving a notch unpaired costs this (mm) — the order-keeping alignment's gap. */
const GAP_MM = 10;
/** A track is grade-consistent when its positions along the edge fit a line in rank within this. */
export const NOTCH_TRACK_RESID_MM = 4;
/** A notch is placed at most this many ranks beyond its outermost drawn copy (design: ≤ 2 steps). */
const EXTRAP_MAX_RANKS = 2;
/** Second evidence (stacked sheets): the placed notch lies within this of the drawn copies' linear
 * grade in the sheet frame (mm) — the canonical-edge place and the drawn places agree. */
const ABS_MM = 8;
/** Two drawn copies only: their place along the edge moves at most this per rank (mm). */
const PAIR_SLIDE_MM = 15;
/** A size that already has a notch this close to the placed one keeps its own (mm). */
const OWN_NEAR_MM = 6;

export type NgSize = {
  rank: number;
  token: string;
  /** The line the size's notches sit on (any orientation), closed. */
  ring: readonly PtMm[];
  notches: readonly { at: PtMm; depthMm: number }[];
};

/** The operator's answer to a lone notch: in every size / in none / only in the size it is drawn. */
export type LoneAnswer = 'all' | 'none' | 'only';

export type NgAdd = {
  /** index into the input sizes */
  k: number;
  at: PtMm;
  /** inward end of the notch segment */
  tip: PtMm;
  depthMm: number;
  /** the sizes it is drawn in (tokens) */
  from: string[];
  /** answered (`all`) rather than graded from ≥ 2 drawn copies */
  answered?: boolean;
  /** index into `tracks` */
  track: number;
};

export type NgLone = {
  k: number;
  /** index into that size's notches */
  n: number;
  at: PtMm;
  key: string;
  edge: number;
  t: number;
  answer?: LoneAnswer;
};

export type NgResult = {
  ok: boolean;
  why?: string;
  add: NgAdd[];
  /** notches answered "none": [size index, notch index] */
  remove: { k: number; n: number }[];
  /** notches seen in 1 size of ≥ 3 (answered or not) */
  lone: NgLone[];
  tracks: {
    edge: number;
    ranks: number[];
    consistent: boolean;
    resid: number;
    /** the drawn notches of the track: [size index, notch index] */
    members: { k: number; n: number }[];
  }[];
  /** tracks of ≥ 2 sizes whose positions do not grade linearly (nothing transferred) */
  inconsistent: number;
  /** per track and size lacking it: why no place was derived (the operator's "all" is refused) */
  skips: { track: number; k: number; why: string }[];
};

/** The question's key: piece seed, the size it is drawn in, its edge and place (2 decimals). */
export const loneKey = (seed: number, token: string, edge: number, t: number) =>
  `notch|${seed}|${token}|e${edge}|t${t.toFixed(2)}`;

type Placed = { k: number; n: number; e: number; t: number; s: number; depth: number };

/** Cumulative arc length along a closed ring (cum[i] = arc from 0 to i; cum[n] = L). */
function cumOf(p: readonly PtMm[]): number[] {
  const c = [0];
  for (let i = 0; i < p.length; i++) c.push(c[i] + dist(p[i], p[(i + 1) % p.length]));
  return c;
}

/** Arc from ring index a forward to b. */
function arc(cum: readonly number[], a: number, b: number): number {
  const L = cum[cum.length - 1];
  const d = cum[b] - cum[a];
  return d >= 0 ? d : d + L;
}

/** The edge (between grade points idx[e] and idx[e+1], cyclic) that ring index i lies on. */
function edgeAt(idx: readonly number[], i: number, n: number): number {
  for (let e = 0; e < idx.length; e++) {
    const a = idx[e];
    const b = idx[(e + 1) % idx.length];
    const len = (((b - a) % n) + n) % n || n;
    const off = (((i - a) % n) + n) % n;
    if (off < len) return e;
  }
  return 0;
}

/** The point at arc `s` forward of ring index a, and its ring index. */
function pointAt(p: readonly PtMm[], cum: readonly number[], a: number, s: number) {
  const n = p.length;
  const L = cum[n];
  const target = (cum[a] + s) % L;
  // binary search in cum
  let lo = 0;
  let hi = n;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  const i = lo % n;
  const seg = cum[lo + 1] - cum[lo];
  const u = seg > 1e-9 ? (target - cum[lo]) / seg : 0;
  const A = p[i];
  const B = p[(i + 1) % n];
  return { q: { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u }, i };
}

/** Inward unit normal of a CCW ring at index i. */
function inward(p: readonly PtMm[], i: number): PtMm {
  const n = p.length;
  const a = p[(i - 3 + n) % n];
  const b = p[(i + 3) % n];
  const L = Math.max(1e-9, dist(a, b));
  return { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
}

/** Linear fit y = a + b·x; the max residual. */
function lineFit(xs: readonly number[], ys: readonly number[]) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
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
  return { a, b, resid };
}

/** t at rank r from a track's members: piecewise linear, outside — the nearest two extended. */
function tAtRank(ms: readonly { rank: number; t: number }[], r: number): number {
  const s = [...ms].sort((x, y) => x.rank - y.rank);
  if (s.length === 1) return s[0].t;
  let i = 0;
  if (r <= s[0].rank) i = 0;
  else if (r >= s[s.length - 1].rank) i = s.length - 2;
  else while (i < s.length - 2 && s[i + 1].rank < r) i++;
  const a = s[i];
  const b = s[i + 1];
  const w = b.rank === a.rank ? 0 : (r - a.rank) / (b.rank - a.rank);
  return a.t + (b.t - a.t) * w;
}

/**
 * Notches of one piece across its sizes (rank order not required): what to place where it is
 * missing, what to ask. `answers` = the operator's answers to lone notches by `loneKey`.
 */
export function gradeNotches(
  sizes: readonly NgSize[],
  seed: number,
  answers: Readonly<Record<string, LoneAnswer>> = {},
  /** place graded notches automatically (false: only read the tracks and ask — every size already
   * draws as many notches as the others, so a missing one is not proven) */
  transfer = true,
  /** appended to every question key: the piece's geometry (a changed outline asks again) */
  keyTag = '',
): NgResult {
  const res: NgResult = {
    ok: false,
    add: [],
    remove: [],
    lone: [],
    tracks: [],
    inconsistent: 0,
    skips: [],
  };
  if (sizes.length < 2) return { ...res, why: 'one size' };
  const order = sizes.map((_, k) => k).sort((a, b) => sizes[a].rank - sizes[b].rank);
  const outs: (GfitOutline | null)[] = sizes.map((s) => outlineOf(s.ring));
  if (outs.some((o) => !o)) return { ...res, why: 'bad-outline' };
  const os = order.map((k) => outs[k]!);
  // stacked (the sizes drawn over each other) unless the first and last sizes lie apart
  const b0 = bboxOf(sizes[order[0]].ring);
  const b1 = bboxOf(sizes[order[order.length - 1]].ring);
  const overlap =
    Math.min(b0.maxX, b1.maxX) > Math.max(b0.minX, b1.minX) &&
    Math.min(b0.maxY, b1.maxY) > Math.max(b0.minY, b1.minY);
  const topo = canonTopology(os, overlap ? 'stacked' : 'registered');
  if (!topo.ok) return { ...res, why: `topology ${topo.why ?? ''}`.trim() };
  // idx per input size
  const idxOf = new Map<number, number[]>();
  order.forEach((k, j) => idxOf.set(k, topo.idx[j]));
  const E = topo.idx[0].length;
  const cums = new Map<number, number[]>();
  for (const k of order) cums.set(k, cumOf(outs[k]!.pts));
  const edgeLen = (k: number, e: number) => {
    const idx = idxOf.get(k)!;
    const a = idx[e];
    const b = idx[(e + 1) % E];
    return arc(cums.get(k)!, a, b) || cums.get(k)![outs[k]!.pts.length];
  };
  // every notch on its size's canonical line: (edge, t, s)
  const placed: Placed[] = [];
  for (const k of order) {
    const o = outs[k]!;
    const idx = idxOf.get(k)!;
    const cum = cums.get(k)!;
    sizes[k].notches.forEach((nt, n) => {
      let bi = -1;
      let bd = Infinity;
      for (let i = 0; i < o.pts.length; i++) {
        const d = dist(o.pts[i], nt.at);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      if (bi < 0 || bd > ON_LINE_MM) return;
      const e = edgeAt(idx, bi, o.pts.length);
      const s = arc(cum, idx[e], bi);
      const L = edgeLen(k, e);
      placed.push({ k, n, e, t: L > 0 ? s / L : 0, s, depth: nt.depthMm });
    });
  }
  if (!placed.length) return { ...res, ok: true };
  // tracks per edge: order-keeping alignment of each size's notches to the tracks so far
  type Track = { e: number; m: Placed[] };
  const tracks: Track[] = [];
  const rankOf = (k: number) => sizes[k].rank;
  for (let e = 0; e < E; e++) {
    const byK = new Map<number, Placed[]>();
    for (const q of placed)
      if (q.e === e)
        byK.set(
          q.k,
          [...(byK.get(q.k) ?? []), q].sort((a, b) => a.t - b.t),
        );
    if (!byK.size) continue;
    // the size with the most notches here first (ties: the middle rank), then by rank distance
    const ks = [...byK.keys()].sort(
      (a, b) =>
        byK.get(b)!.length - byK.get(a)!.length ||
        Math.abs(order.indexOf(a) - order.length / 2) -
          Math.abs(order.indexOf(b) - order.length / 2),
    );
    const ref = ks[0];
    const rest = ks
      .slice(1)
      .sort((a, b) => Math.abs(rankOf(a) - rankOf(ref)) - Math.abs(rankOf(b) - rankOf(ref)));
    const mine: Track[] = byK.get(ref)!.map((q) => ({ e, m: [q] }));
    // every size that notches this edge draws the same number of notches: one track per place, by
    // order (a graded notch may slide far along its edge; the fit below judges the places)
    const c0 = byK.get(ref)!.length;
    if ([...byK.values()].every((qs) => qs.length === c0)) {
      const zip: Track[] = byK.get(ref)!.map((q) => ({ e, m: [q] }));
      for (const k of rest) byK.get(k)!.forEach((q, i) => zip[i].m.push(q));
      // by order; a track whose places do not grade (S:A, M:A, L:B) is judged inconsistent below
      // and nothing moves on it (pairing it apart would turn A and B into two "graded" notches)
      tracks.push(...zip);
      continue;
    }
    for (const k of rest) {
      const qs = byK.get(k)!;
      const L = edgeLen(k, e);
      const tr = mine
        .map((t) => ({
          t,
          at: tAtRank(
            t.m.map((x) => ({ rank: rankOf(x.k), t: x.t })),
            rankOf(k),
          ),
        }))
        .sort((a, b) => a.at - b.at);
      // DP: qs (i) against tr (j), order kept
      const N = qs.length;
      const M = tr.length;
      const D = Array.from({ length: N + 1 }, () => new Float64Array(M + 1));
      const T = Array.from({ length: N + 1 }, () => new Uint8Array(M + 1));
      for (let i = 1; i <= N; i++) {
        D[i][0] = D[i - 1][0] + GAP_MM;
        T[i][0] = 2;
      }
      for (let j = 1; j <= M; j++) {
        D[0][j] = D[0][j - 1];
        T[0][j] = 3;
      }
      for (let i = 1; i <= N; i++)
        for (let j = 1; j <= M; j++) {
          const d = Math.abs(qs[i - 1].t - tr[j - 1].at) * L;
          let v = d <= PAIR_MAX_MM ? D[i - 1][j - 1] + d : Infinity;
          let t = 1;
          if (D[i - 1][j] + GAP_MM < v) {
            v = D[i - 1][j] + GAP_MM;
            t = 2;
          }
          if (D[i][j - 1] < v) {
            v = D[i][j - 1];
            t = 3;
          }
          D[i][j] = v;
          T[i][j] = t;
        }
      let i = N;
      let j = M;
      const fresh: Placed[] = [];
      while (i > 0 || j > 0) {
        const t = T[i][j];
        if (i > 0 && j > 0 && t === 1) {
          tr[j - 1].t.m.push(qs[i - 1]);
          i--;
          j--;
        } else if (i > 0 && (t === 2 || j === 0)) {
          fresh.push(qs[i - 1]);
          i--;
        } else j--;
      }
      for (const q of fresh) mine.push({ e, m: [q] });
    }
    tracks.push(...mine);
  }
  // each track: consistent → transfer; one size of ≥ 3 → question
  const stacked = overlap;
  for (const tr of tracks) {
    const ms = tr.m;
    const ranks = ms.map((q) => rankOf(q.k));
    let consistent = ms.length >= 2;
    let resid = 0;
    if (ms.length >= 3) {
      const f = lineFit(
        ranks,
        ms.map((q) => q.s),
      );
      resid = f.resid;
      consistent = f.resid <= NOTCH_TRACK_RESID_MM;
    } else if (ms.length === 2) {
      resid = Math.abs(ms[0].s - ms[1].s);
      consistent = resid <= PAIR_SLIDE_MM * Math.max(1, Math.abs(ranks[0] - ranks[1]));
    }
    // a size between the drawn copies that lacks this notch but notches the same edge elsewhere:
    // the copies are two different notches read as one (interleaved places) — not one track
    if (consistent && ms.length >= 2) {
      const lo = Math.min(...ranks);
      const hi = Math.max(...ranks);
      const pts0 = ms.map((q) => ({ rank: rankOf(q.k), t: q.t }));
      for (const k of order) {
        const r = rankOf(k);
        if (r <= lo || r >= hi || ms.some((q) => q.k === k)) continue;
        const tp = tAtRank(pts0, r);
        const L = edgeLen(k, tr.e);
        if (
          placed.some((q) => q.k === k && q.e === tr.e && Math.abs(q.t - tp) * L <= 2 * PAIR_MAX_MM)
        )
          consistent = false;
      }
    }
    const ti = res.tracks.length;
    const missing = order.filter((k) => !ms.some((q) => q.k === k));
    const skip = (k: number, why: string) => res.skips.push({ track: ti, k, why });
    res.tracks.push({
      edge: tr.e,
      ranks: [...ranks].sort((a, b) => a - b),
      consistent,
      resid,
      members: ms.map((q) => ({ k: q.k, n: q.n })),
    });
    if (ms.length >= 2 && !consistent) res.inconsistent++;
    let answer: LoneAnswer | undefined;
    if (ms.length === 1 && sizes.length >= 3) {
      const q = ms[0];
      const key = `${loneKey(seed, sizes[q.k].token, tr.e, q.t)}${keyTag}`;
      answer = answers[key];
      res.lone.push({
        k: q.k,
        n: q.n,
        at: sizes[q.k].notches[q.n].at,
        key,
        edge: tr.e,
        t: q.t,
        ...(answer ? { answer } : {}),
      });
      if (answer === 'none') res.remove.push({ k: q.k, n: q.n });
      if (answer !== 'all') {
        for (const k of missing) skip(k, `drawn in size ${sizes[q.k].token} only`);
        continue;
      }
    } else if (!consistent || !transfer) {
      for (const k of missing)
        skip(
          k,
          ms.length < 2
            ? 'drawn in one size only'
            : !consistent
              ? 'its drawn places do not grade from size to size'
              : 'every size draws as many notches — none is missing there',
        );
      continue;
    }
    const pts = ms.map((q) => ({ rank: rankOf(q.k), t: q.t }));
    const depth = [...ms.map((q) => q.depth)].sort((a, b) => a - b)[ms.length >> 1];
    const from = [...ms].sort((a, b) => rankOf(a.k) - rankOf(b.k)).map((q) => sizes[q.k].token);
    const lo = Math.min(...ms.map((q) => rankOf(q.k)));
    const hi = Math.max(...ms.map((q) => rankOf(q.k)));
    for (const k of order) {
      if (ms.some((q) => q.k === k)) continue;
      const r = rankOf(k);
      // past the outermost drawn copy by more than two steps: not graded that far
      // (the operator's "in every size" has no such limit)
      if (answer !== 'all' && (r < lo - EXTRAP_MAX_RANKS || r > hi + EXTRAP_MAX_RANKS)) {
        skip(k, 'more than two sizes beyond the sizes that draw it');
        continue;
      }
      const t = tAtRank(pts, r);
      // the place runs off its edge (past a grade point): the notch's place in this size is not
      // known on the canonical topology — no guess
      if (t < 0 || t > 1) {
        skip(k, 'its graded place falls past the corner of its edge');
        continue;
      }
      const L = edgeLen(k, tr.e);
      const o = outs[k]!;
      let at = pointAt(o.pts, cums.get(k)!, idxOf.get(k)![tr.e], t * L);
      // second evidence on a stacked sheet: the drawn copies' own places, graded linearly in the
      // sheet frame, land here too — and then the notch goes where they say, on this size's line
      // (a tick drawn across nested lines grades exactly there), within the same edge
      if (stacked && ms.length >= 2) {
        const xs = ms.map((q) => sizes[q.k].notches[q.n].at);
        const rs = ms.map((q) => rankOf(q.k));
        const fx = lineFit(
          rs,
          xs.map((p) => p.x),
        );
        const fy = lineFit(
          rs,
          xs.map((p) => p.y),
        );
        const P = { x: fx.a + fx.b * r, y: fy.a + fy.b * r };
        if (dist(P, at.q) > ABS_MM) {
          skip(k, 'the sheet-frame grade of the drawn copies does not land on this size’s line');
          continue;
        }
        const idx = idxOf.get(k)!;
        const a0 = idx[tr.e];
        const n = o.pts.length;
        const len = (((idx[(tr.e + 1) % E] - a0) % n) + n) % n || n;
        let bi = -1;
        let bd = Infinity;
        for (let j = 0; j <= len; j++) {
          const i = (a0 + j) % n;
          const d = dist(o.pts[i], P);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        if (bi >= 0 && bd <= ABS_MM) at = { q: o.pts[bi], i: bi };
      }
      // the size draws a notch here already (not paired: another track) — its own stays
      if (sizes[k].notches.some((x) => dist(x.at, at.q) < OWN_NEAR_MM)) {
        skip(k, 'the size draws its own notch there');
        continue;
      }
      const u = inward(o.pts, at.i);
      res.add.push({
        k,
        at: at.q,
        tip: { x: at.q.x + u.x * depth, y: at.q.y + u.y * depth },
        depthMm: depth,
        from,
        track: ti,
        ...(answer === 'all' ? { answered: true } : {}),
      });
    }
  }
  return { ...res, ok: true };
}
