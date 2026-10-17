// pieces/gfit (GRADE P2/P3, PROBE ONLY — not wired into the pipeline): shared checks for repaired
// and generated sizes — the canonical topology carried through a set of sizes (one geometry), edge
// lengths between grade points, self-intersection, nesting, ring-to-ring distances. Pure, mm.
import type { PtMm } from 'lib/pattern-import/types';
import { pointInPoly, segIntersect, segNearest, SegGrid } from 'lib/pattern-import/pieces/geom';

import { matchCorners, type GfitMatch } from './match';
import { analyseOutline, chordBumps, type GfitOutline } from './outline';

const hyp = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

const centroid = (ps: readonly PtMm[]): PtMm => {
  let x = 0;
  let y = 0;
  for (const p of ps) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, ps.length), y: y / Math.max(1, ps.length) };
};

export type GfitTopology = {
  ok: boolean;
  /** Why not: a pair has no match, the built size loses grade points, or the order changes. */
  why?: 'no-match' | 'lost-points' | 'order' | 'few-points';
  /** Per outline (input order): ring indices of the grade points (strong by majority), in ring order. */
  idx: number[][];
  /** Grade points carried through the drawn outlines alone / with the candidate inserted. */
  pointsDrawn: number;
  pointsWith: number;
  /** Strong corners of the candidate its neighbours leave unmatched (information: reading noise
   * of the drawn sizes shows up the same way). */
  extraStrong: number;
};

const anaMemo = new WeakMap<readonly PtMm[], GfitOutline | null>();
/** analyseOutline memoised on the outline array. */
export function outlineOf(outer: readonly PtMm[]): GfitOutline | null {
  let o = anaMemo.get(outer);
  if (o === undefined) anaMemo.set(outer, (o = analyseOutline(outer, undefined, true)));
  return o;
}
const pairMemo = new WeakMap<GfitOutline, WeakMap<GfitOutline, Map<string, GfitMatch | null>>>();
function matchMemo(a: GfitOutline, b: GfitOutline, offA: PtMm, offB: PtMm, usePos = true) {
  let m1 = pairMemo.get(a);
  if (!m1) pairMemo.set(a, (m1 = new WeakMap()));
  let m2 = m1.get(b);
  if (!m2) m1.set(b, (m2 = new Map()));
  const k = `${offA.x},${offA.y},${offB.x},${offB.y},${usePos}`;
  let m = m2.get(k);
  if (m === undefined) m2.set(k, (m = matchCorners(a, b, { offA, offB, usePos, stepPair: true })));
  return m;
}

/**
 * The better of the positional match and the shape-only match (turn + arc position): the positional
 * one forbids pairs farther than max(15 mm, 5σ) with σ the MEDIAN corner displacement — on a piece
 * whose corners mostly stay put (shared lines) a corner that moves 12 mm per size between sizes two
 * apart is never paired, and the arc mapping then cuts it. Unique matches only; fewer unmatched
 * strong corners wins, the positional one on a tie.
 */
export function bestMatch(a: GfitOutline, b: GfitOutline, offA: PtMm, offB: PtMm) {
  const m1 = matchMemo(a, b, offA, offB, true);
  const m2 = matchMemo(a, b, offA, offB, false);
  const ok = (m: GfitMatch | null) => !!m && m.unique;
  const sk = (m: GfitMatch) => m.skipStrongA + m.skipStrongB;
  if (ok(m1) && ok(m2)) return sk(m2!) < sk(m1!) ? m2 : m1;
  return ok(m1) ? m1 : ok(m2) ? m2 : m1;
}

/** Corners of the middle outline carried through all outlines by consecutive matches. */
function carry(os: readonly GfitOutline[], offs: readonly PtMm[]) {
  const maps: { f: Map<number, number>; b: Map<number, number> }[] = [];
  for (let k = 1; k < os.length; k++) {
    const m = bestMatch(os[k - 1], os[k], offs[k - 1], offs[k]);
    if (!m) return null;
    maps.push({
      f: new Map(m.pairs.map(([x, y]) => [x, y])),
      b: new Map(m.pairs.map(([x, y]) => [y, x])),
    });
  }
  const mid = os.length >> 1;
  const idx: number[][] = os.map(() => []);
  const chains: number[][] = [];
  for (let c = 0; c < os[mid].corners.length; c++) {
    const ch = new Array<number>(os.length).fill(-1);
    ch[mid] = c;
    let ok = true;
    for (let k = mid; k + 1 < os.length && ok; k++) {
      const v = maps[k].f.get(ch[k]);
      if (v === undefined) ok = false;
      else ch[k + 1] = v;
    }
    for (let k = mid; k > 0 && ok; k--) {
      const v = maps[k - 1].b.get(ch[k]);
      if (v === undefined) ok = false;
      else ch[k - 1] = v;
    }
    if (!ok) continue;
    const nStrong = ch.filter((ci, k) => os[k].corners[ci].strong).length;
    if (2 * nStrong < os.length) continue;
    chains.push(ch);
  }
  chains.sort((x, y) => os[mid].corners[x[mid]].i - os[mid].corners[y[mid]].i);
  for (const ch of chains) ch.forEach((ci, k) => idx[k].push(os[k].corners[ci].i));
  return idx;
}

/**
 * One geometry: the grade points (corners carried through every drawn outline, strong by majority)
 * must survive with the candidate (a built or repaired size, at `cand` in rank order) inserted —
 * none lost, all in the same ring order. Outlines in rank order.
 */
export function canonTopology(
  os: readonly GfitOutline[],
  frame: 'stacked' | 'registered' = 'stacked',
  cand = -1,
): GfitTopology {
  const offs = os.map((o) => (frame === 'stacked' ? { x: 0, y: 0 } : centroid(o.pts)));
  const res: GfitTopology = { ok: false, idx: [], pointsDrawn: 0, pointsWith: 0, extraStrong: 0 };
  const drawnI = os.map((_, k) => k).filter((k) => k !== cand);
  if (drawnI.length < 1 || os.length < 2) return { ...res, why: 'few-points' };
  const dIdx =
    drawnI.length >= 2
      ? carry(
          drawnI.map((k) => os[k]),
          drawnI.map((k) => offs[k]),
        )
      : [os[drawnI[0]].corners.filter((c) => c.strong).map((c) => c.i)];
  const wIdx = carry(os, offs);
  if (!dIdx || !wIdx) return { ...res, why: 'no-match' };
  res.pointsDrawn = dIdx[0].length;
  res.pointsWith = wIdx[0].length;
  res.idx = wIdx;
  if (cand >= 0)
    for (const k of [cand - 1, cand + 1]) {
      if (k < 0 || k >= os.length) continue;
      const m = bestMatch(os[cand], os[k], offs[cand], offs[k]);
      res.extraStrong = Math.max(res.extraStrong, m ? m.skipStrongA : 0);
    }
  if (res.pointsWith < 2) return { ...res, why: 'few-points' };
  if (res.pointsWith < res.pointsDrawn) return { ...res, why: 'lost-points' };
  for (const ix of wIdx) {
    const r = ix.indexOf(Math.min(...ix));
    const rot = [...ix.slice(r), ...ix.slice(0, r)];
    for (let j = 1; j < rot.length; j++) if (rot[j] <= rot[j - 1]) return { ...res, why: 'order' };
  }
  return { ...res, ok: true };
}

/** Arc length of each edge between consecutive grade points (ring indices). */
export function edgeLengths(o: GfitOutline, idx: readonly number[]): number[] {
  const n = o.pts.length;
  const out: number[] = [];
  for (let e = 0; e < idx.length; e++) {
    const a = idx[e];
    const b = idx[(e + 1) % idx.length];
    const len = (((b - a) % n) + n) % n;
    let L = 0;
    for (let j = 0; j < len; j++) L += hyp(o.pts[(a + j) % n], o.pts[(a + j + 1) % n]);
    out.push(L);
  }
  return out;
}

/** A closed ring crosses itself (non-adjacent segments intersect). */
export function selfIntersects(ring: readonly PtMm[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  const grid = new SegGrid(4);
  grid.addPolyline(0, ring, true);
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    let hit = false;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    grid.near(mid, hyp(a, b) / 2 + 0.01, (_o, j) => {
      if (hit) return;
      const d = Math.min((i - j + n) % n, (j - i + n) % n);
      if (d <= 1) return;
      const x = segIntersect(a, b, ring[j], ring[(j + 1) % n]);
      if (x && x.t > 1e-9 && x.t < 1 - 1e-9 && x.u > 1e-9 && x.u < 1 - 1e-9) hit = true;
    });
    if (hit) return true;
  }
  return false;
}

/** Nearest distance from p to a ring, over a segment grid (built once per ring). */
export function ringDistance(ring: readonly PtMm[]): (p: PtMm, r?: number) => number {
  const grid = new SegGrid(4);
  grid.addPolyline(0, ring, true);
  const n = ring.length;
  return (p, r = 12) => {
    let best = Infinity;
    for (let rr = r; ; rr *= 4) {
      grid.near(p, rr, (_o, i) => {
        const d = segNearest(p, ring[i], ring[(i + 1) % n]).d;
        if (d < best) best = d;
      });
      if (best <= rr || rr > 4000) return best;
    }
  };
}

/** Every point of `a` lies inside `b` or within `tol` of b's boundary. */
export function insideWithin(a: readonly PtMm[], b: readonly PtMm[], tol = 0.3): boolean {
  const d = ringDistance(b);
  for (const p of a) if (!pointInPoly(p, b) && d(p, tol + 1) > tol) return false;
  return true;
}

/** Both-way point distances between two rings (every sample of each to the other ring). */
export function ringErrors(a: readonly PtMm[], b: readonly PtMm[]): number[] {
  const da = ringDistance(b);
  const db = ringDistance(a);
  return [...a.map((p) => da(p)), ...b.map((p) => db(p))];
}

/**
 * A ring with SLIT notches cut off by their chord: a stretch whose ends come back within `mouthMm`
 * of each other after ≥ 3 mm of path (≤ `maxPathMm`) — a slit / very narrow notch drawn into the
 * outline, which excursionsOf (mouth ≥ 0.8 mm) does not chord. Measurement helper.
 */
export function cutSlits(ring: readonly PtMm[], mouthMm = 1.0, maxPathMm = 24): PtMm[] {
  const n = ring.length;
  const out: PtMm[] = [];
  let i = 0;
  while (i < n) {
    out.push(ring[i]);
    let path = 0;
    let jump = -1;
    for (let j = i + 1; j < n && path <= maxPathMm; j++) {
      path += hyp(ring[j - 1], ring[j]);
      if (path >= 3 && hyp(ring[i], ring[j]) <= mouthMm) jump = j;
    }
    i = jump > 0 ? jump : i + 1;
  }
  return out;
}

/** K+1 points at equal arc fractions along an open polyline. */
function byArcK(pts: readonly PtMm[], K: number): PtMm[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hyp(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1];
  const out: PtMm[] = [];
  let j = 1;
  for (let k = 0; k <= K; k++) {
    const s = (L * k) / K;
    while (j < pts.length - 1 && cum[j] < s) j++;
    const a = pts[j - 1];
    const b = pts[j] ?? a;
    const seg = cum[j] - cum[j - 1];
    const t = seg > 1e-9 ? (s - cum[j - 1]) / seg : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function ringSlice(p: readonly PtMm[], i0: number, i1: number): PtMm[] {
  const n = p.length;
  const len = (((i1 - i0) % n) + n) % n || n;
  const out: PtMm[] = [];
  for (let j = 0; j <= len; j++) out.push(p[(i0 + j) % n]);
  return out;
}

const chordMemo = new WeakMap<GfitOutline, PtMm[]>();
function chordedOf(o: GfitOutline): PtMm[] {
  let c = chordMemo.get(o);
  if (!c) chordMemo.set(o, (c = chordBumps(o.pts)));
  return c;
}

export type GfitPairPrediction = {
  pts: PtMm[];
  /** Per sample: the step per rank between the two basis outlines, mm. */
  step: number[];
  /** Per sample: the step's component normal to the line (tangential sliding of the arc mapping
   * removed), mm per rank — the corridor's measure. */
  stepN: number[];
  /** Grade points used (corners matched between the two basis sizes). */
  points: number;
};

/**
 * The PAIR grade model: grade points = the corners matched between the two basis sizes (not only
 * those carried through every anchor — one noisy anchor would otherwise drop a corner for the whole
 * family and the prediction would cut it); each edge maps by arc fraction; the ring at w (0 = o1,
 * 1 = o2; outside [0, 1] = extrapolation). Null without a unique match of ≥ 2 points.
 */
export function predictPair(
  o1: GfitOutline,
  o2: GfitOutline,
  w: number,
  dr: number,
  frame: 'stacked' | 'registered' = 'stacked',
): GfitPairPrediction | null {
  const z = { x: 0, y: 0 };
  const off1 = frame === 'stacked' ? z : centroid(o1.pts);
  const off2 = frame === 'stacked' ? z : centroid(o2.pts);
  const m = bestMatch(o1, o2, off1, off2);
  if (!m || !m.unique || m.pairs.length < 2) return null;
  const P = m.pairs.map(([a, b]) => [o1.corners[a].i, o2.corners[b].i] as [number, number]);
  // the b side must run in the same cyclic order
  const bs = P.map((p) => p[1]);
  const r = bs.indexOf(Math.min(...bs));
  const rot = [...bs.slice(r), ...bs.slice(0, r)];
  for (let j = 1; j < rot.length; j++) if (rot[j] <= rot[j - 1]) return null;
  const off = { x: off1.x + (off2.x - off1.x) * w, y: off1.y + (off2.y - off1.y) * w };
  // notches are marks: every notch-like bump the reader left in a basis ring is chorded first (a
  // notch chorded in one basis size and not in the other would otherwise be lerped — at w outside
  // [0, 1] into a dent twice its depth)
  const c1 = chordedOf(o1);
  const c2 = chordedOf(o2);
  const pts: PtMm[] = [];
  const step: number[] = [];
  const stepN: number[] = [];
  for (let e = 0; e < P.length; e++) {
    const [a0, b0] = P[e];
    const [a1, b1] = P[(e + 1) % P.length];
    const s1 = ringSlice(c1, a0, a1).map((p) => ({ x: p.x - off1.x, y: p.y - off1.y }));
    const s2 = ringSlice(c2, b0, b1).map((p) => ({ x: p.x - off2.x, y: p.y - off2.y }));
    const len = Math.max(s1.length, s2.length) * 0.5;
    const K = Math.max(8, Math.min(800, Math.round(len)));
    const e1 = byArcK(s1, K);
    const e2 = byArcK(s2, K);
    for (let k = 0; k < K; k++) {
      pts.push({
        x: e1[k].x + (e2[k].x - e1[k].x) * w + off.x,
        y: e1[k].y + (e2[k].y - e1[k].y) * w + off.y,
      });
      const adr = Math.max(1e-9, Math.abs(dr));
      step.push(hyp(e1[k], e2[k]) / adr);
      // the NORMAL part of the step: along an edge the arc mapping slides points tangentially
      // (that sliding is no displacement of the line); near the grade points the full step
      const ta = e1[Math.max(0, k - 1)];
      const tb = e1[Math.min(K, k + 1)];
      const tl = hyp(ta, tb);
      const dx = e2[k].x - e1[k].x;
      const dy = e2[k].y - e1[k].y;
      const nearEnd = k < 3 || k > K - 3;
      stepN.push(
        nearEnd || tl < 1e-9
          ? Math.hypot(dx, dy) / adr
          : Math.abs((dx * -(tb.y - ta.y) + dy * (tb.x - ta.x)) / tl) / adr,
      );
    }
  }
  return { pts, step, stepN, points: P.length };
}

/** Strong corners of `a` that the match a → b leaves unmatched (stacked/registered as given). */
export function lostStrong(
  a: GfitOutline,
  b: GfitOutline,
  frame: 'stacked' | 'registered' = 'stacked',
): number {
  const z = { x: 0, y: 0 };
  const m = bestMatch(
    a,
    b,
    frame === 'stacked' ? z : centroid(a.pts),
    frame === 'stacked' ? z : centroid(b.pts),
  );
  return m ? m.skipStrongA : a.corners.filter((c) => c.strong).length;
}

// notch-like bumps (chordBumps) live with the outline read (outline.ts) — re-exported here
export { bumpSpans, chordBumps, notchBumps } from './outline';
