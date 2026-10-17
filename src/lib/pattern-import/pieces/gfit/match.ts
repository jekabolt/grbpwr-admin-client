// pieces/gfit (GRADE P0, PROBE ONLY): corner correspondence between two sizes of one piece — cyclic
// DP that keeps order, turn sign, arc position and displacement against the typical step; every
// start pairing of two strong corners is a phase hypothesis; the answer must be UNIQUE (the best
// different mapping ≥ 1.5× dearer), else there is no correspondence.
import type { PtMm } from 'lib/pattern-import/types';

import { gfitP1Silent, type GfitCorner, type GfitOutline } from './outline';

export const MATCH_MARGIN = 1.5;
const SKIP_STRONG = 4;
const SKIP_WEAK = 0.5;
const MAX_CORNERS = 80;

export type GfitMatch = {
  /** [index into a.corners, index into b.corners], in a's cyclic order. */
  pairs: [number, number][];
  cost: number;
  /** Cost of the best alignment at another phase — the piece read rotated (Infinity: none). */
  second: number;
  ratio: number;
  unique: boolean;
  skipStrongA: number;
  skipStrongB: number;
  sigma: number;
};

export type MatchOpts = {
  /** Gauge offsets subtracted from positions (registered frame); zero on a stacked sheet. */
  offA?: PtMm;
  offB?: PtMm;
  /** Use displacement in the cost (false: shape-only). */
  usePos?: boolean;
  /** GRADE P1: the farthest pair follows the outlines' grade step too (see below). */
  stepPair?: boolean;
};

const circ = (x: number) => {
  const d = ((x % 1) + 1) % 1;
  return Math.min(d, 1 - d);
};

function capped(cs: readonly GfitCorner[]): number[] {
  const idx = cs.map((_, i) => i);
  if (cs.length <= MAX_CORNERS) return idx;
  const keep = idx
    .slice()
    .sort(
      (x, y) =>
        Number(cs[y].strong) - Number(cs[x].strong) || Math.abs(cs[y].turn) - Math.abs(cs[x].turn),
    )
    .slice(0, MAX_CORNERS);
  return keep.sort((x, y) => x - y);
}

export function matchCorners(a: GfitOutline, b: GfitOutline, o: MatchOpts = {}): GfitMatch | null {
  const ia = capped(a.corners);
  const ib = capped(b.corners);
  const A = ia.map((i) => a.corners[i]);
  const B = ib.map((i) => b.corners[i]);
  const n = A.length;
  const m = B.length;
  if (!n || !m) return null;
  const oa = o.offA ?? { x: 0, y: 0 };
  const ob = o.offB ?? { x: 0, y: 0 };
  const usePos = o.usePos !== false;
  const pa = A.map((c) => ({ x: c.p.x - oa.x, y: c.p.y - oa.y }));
  const pb = B.map((c) => ({ x: c.p.x - ob.x, y: c.p.y - ob.y }));
  // the typical step: median nearest-corner distance from a's strong corners
  const near: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!A[i].strong) continue;
    let best = Infinity;
    for (let j = 0; j < m; j++)
      best = Math.min(best, Math.hypot(pa[i].x - pb[j].x, pa[i].y - pb[j].y));
    near.push(best);
  }
  near.sort((x, y) => x - y);
  const sigma = Math.max(1, near.length ? near[near.length >> 1] : 1);
  // GRADE P1 (P23 to-do): the farthest pair allowed follows the grade STEP between the two outlines,
  // not only the median corner shift — on a piece whose corners mostly stay put (shared lines) a
  // corner that moves 12 mm per size was never paired between sizes two apart. The step = how far
  // the outlines' boxes move (registered: after the gauge offsets). The P1 path asks for it
  // (`stepPair`); the SILENT G26 model keeps the median rule unless GFIT_P1_SILENT=1.
  const bx = (o: GfitOutline, off: PtMm) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of o.pts) {
      x0 = Math.min(x0, p.x - off.x);
      y0 = Math.min(y0, p.y - off.y);
      x1 = Math.max(x1, p.x - off.x);
      y1 = Math.max(y1, p.y - off.y);
    }
    return [x0, y0, x1, y1];
  };
  const ba = bx(a, oa);
  const bb = bx(b, ob);
  const boxStep = Math.max(...ba.map((v, i) => Math.abs(v - bb[i])));
  const pairMax =
    o.stepPair || gfitP1Silent()
      ? Math.max(15, 5 * sigma, 1.5 * boxStep + 3)
      : Math.max(15, 5 * sigma);
  const skipA = A.map((c) => (c.strong ? SKIP_STRONG : SKIP_WEAK));
  const skipB = B.map((c) => (c.strong ? SKIP_STRONG : SKIP_WEAK));
  const pairCost = (i: number, j: number, phi: number) => {
    const x = A[i];
    const y = B[j];
    if (Math.sign(x.turn) !== Math.sign(y.turn)) return Infinity;
    let c = Math.abs(x.turn - y.turn) / 30 + circ(x.f - y.f - phi) / 0.03;
    if (usePos) {
      const d = Math.hypot(pa[i].x - pb[j].x, pa[i].y - pb[j].y);
      // a pair far beyond the typical step is no pair (cheaper than two skips otherwise)
      if (d > pairMax) return Infinity;
      c += d / (3 * sigma);
    }
    return c;
  };
  const strongA = A.map((c) => c.strong);
  const strongB = B.map((c) => c.strong);
  const anyStrong = strongA.some(Boolean) && strongB.some(Boolean);
  type Run = { cost: number; pairs: [number, number][]; key: string; phi: number };
  const runs = new Map<string, Run>();
  const explained = new Set<number>();
  // DP over a rotated from i0 and b rotated from j0, the first pair forced
  const align = (i0: number, j0: number): Run | null => {
    const phi = A[i0].f - B[j0].f;
    const c0 = pairCost(i0, j0, phi);
    if (!Number.isFinite(c0)) return null;
    const N = n - 1;
    const M = m - 1;
    const W = M + 1;
    const D = new Float64Array((N + 1) * W);
    const T = new Uint8Array((N + 1) * W); // 1 match, 2 skip a, 3 skip b
    const ai = (k: number) => (i0 + 1 + k) % n;
    const bj = (k: number) => (j0 + 1 + k) % m;
    for (let i = 1; i <= N; i++) {
      D[i * W] = D[(i - 1) * W] + skipA[ai(i - 1)];
      T[i * W] = 2;
    }
    for (let j = 1; j <= M; j++) {
      D[j] = D[j - 1] + skipB[bj(j - 1)];
      T[j] = 3;
    }
    for (let i = 1; i <= N; i++)
      for (let j = 1; j <= M; j++) {
        const mc = D[(i - 1) * W + j - 1] + pairCost(ai(i - 1), bj(j - 1), phi);
        const sa = D[(i - 1) * W + j] + skipA[ai(i - 1)];
        const sb = D[i * W + j - 1] + skipB[bj(j - 1)];
        let v = mc;
        let t = 1;
        if (sa < v) {
          v = sa;
          t = 2;
        }
        if (sb < v) {
          v = sb;
          t = 3;
        }
        D[i * W + j] = v;
        T[i * W + j] = t;
      }
    const pairs: [number, number][] = [];
    let i = N;
    let j = M;
    while (i > 0 || j > 0) {
      const t = T[i * W + j];
      if (t === 1) {
        pairs.push([ai(i - 1), bj(j - 1)]);
        i--;
        j--;
      } else if (t === 2) i--;
      else j--;
    }
    pairs.push([i0, j0]);
    pairs.reverse();
    const key = pairs
      .filter(([x, y]) => strongA[x] || strongB[y])
      .map(([x, y]) => `${x}:${y}`)
      .sort()
      .join(',');
    // the alignment's phase: circular mean of the matched arc offsets
    let sx = 0;
    let sy = 0;
    for (const [x, y] of pairs) {
      const d = 2 * Math.PI * (A[x].f - B[y].f);
      sx += Math.cos(d);
      sy += Math.sin(d);
    }
    const ph = Math.atan2(sy, sx) / (2 * Math.PI);
    return { cost: c0 + D[N * W + M], pairs, key, phi: ph };
  };
  for (let i0 = 0; i0 < n; i0++) {
    if (anyStrong && !strongA[i0]) continue;
    for (let j0 = 0; j0 < m; j0++) {
      if (anyStrong && !strongB[j0]) continue;
      if (explained.has(i0 * m + j0)) continue;
      const r = align(i0, j0);
      if (!r) continue;
      for (const [x, y] of r.pairs) explained.add(x * m + y);
      const prev = runs.get(r.key);
      if (!prev || r.cost < prev.cost) runs.set(r.key, r);
    }
  }
  const all = [...runs.values()].sort((x, y) => x.cost - y.cost);
  if (!all.length) return null;
  const best = all[0];
  // the rival: the best alignment at another PHASE (≥ 5 % of the ring away) — a symmetric piece read
  // the other way round; two adjacent corners swapped at the same phase is not a rival
  const rival = all.find((r) => r !== best && circ(r.phi - best.phi) >= 0.05);
  const second = rival ? rival.cost : Infinity;
  const ratio = (second + 1) / (best.cost + 1);
  const pairs = best.pairs
    .map(([x, y]) => [ia[x], ib[y]] as [number, number])
    .sort((p, q) => a.corners[p[0]].i - a.corners[q[0]].i);
  const usedA = new Set(best.pairs.map((p) => p[0]));
  const usedB = new Set(best.pairs.map((p) => p[1]));
  return {
    pairs,
    cost: best.cost,
    second,
    ratio,
    unique: ratio >= MATCH_MARGIN,
    skipStrongA: A.filter((c, i) => c.strong && !usedA.has(i)).length,
    skipStrongB: B.filter((c, i) => c.strong && !usedB.has(i)).length,
    sigma,
  };
}
