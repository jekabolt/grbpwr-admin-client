// pieces/ — the nesting judge: does a size's outline nest between its neighbours' outlines?
//
// One definition for the probe (scripts/pattern-import/nest-check.mjs) and for the pipeline's
// consumers (LADDER_RESCUE first; the 104 on-trend truncations; later the drawer). Pure: it takes
// a family's closed outlines by rank, and optionally the drawn chains by rank, and calls a verdict.
//
// Bracket rule (nest-check, ported one to one; a pair test cannot tell which cell is wrong). For a
// closed cell c with closed neighbours lo (smaller) and hi (larger):
//   step    = median over adjacent closed pairs of the pair's p95 outline distance per rank, floor
//             1 mm. ROBUST (the default here): the top quartile of pair steps is dropped first —
//             the cells under judgement inflate a plain median (Memoir A H CFL 60.7 vs 7.2 mm).
//   lim     = max(10 mm, 3 · step · rank gap)   (filled outlines carry fill artefacts)
//   out(a,b)= longest run (3 mm samples) of a's outline outside b deeper than lim
//   judged  = out(lo, hi) < 20                  (the neighbours agree)
//   trunc   = out(lo, c) ≥ 20                   (the smaller size sticks out: c is cut short)
//   over    = out(c, hi) ≥ 20                   (c sticks out of the larger size)
// Exactly two passes: pass 1 flags; pass 2 judges every cell against the neighbours pass 1 left
// unflagged. No iteration.
//
// on-neighbour (f3, 16 Nov): a cell closed on its NEIGHBOUR's line sits "on lo", which the bracket
// calls fine — nest-check's "cut alike" blind spot. From the drawn chains: the outline runs within
// 0.25 · step of lo's or hi's chain for ≥ 20 mm where lo and hi do NOT converge (> 1.5 · step
// apart locally). Where they converge it is a shared edge, and fine.
//
// BLIND by construction: runs of sizes cut alike (bracket), edge sizes (no bracket), strip
// ladders, truncations shallower than lim; and when two adjacent cells are flagged, pass 2 judges
// each against the next unflagged size, so a cut shallower than one step + lim disappears. `unjudged` is never "inside": consumers keep status quo.
import type { PtMm } from 'lib/pattern-import/types';

import { pointInPoly, segNearest } from './geom';

const ST = 3;
const RUN = 20;

export type NestCell = { rank: number; outer: readonly PtMm[] };

export type NestVerdict = {
  kind: 'ok' | 'trunc' | 'over' | 'both' | 'unjudged';
  lo?: number;
  hi?: number;
  /** Longest run (mm) of lo outside the cell / of the cell outside hi, deeper than lim. */
  truncMm?: number;
  overMm?: number;
};

export type NestOpts = {
  /** Drop the top quartile of pair steps before the median (default true; false = nest-check plain). */
  robust?: boolean;
  /** Cap on the verdict lim, mm (never on the lo↔hi bracket test). Default none. */
  limCap?: number;
  /**
   * 'outline' (default, nest-check parity): lim = max(10, 3 · step · gap) — filled outlines carry
   * fill artefacts. 'chain': lim = max(2, 0.5 · step · gap) — for drawn / read lines, and for an
   * acceptance test that must see a miss of a few mm. Applies to the lo↔hi bracket test as well.
   */
  lim?: 'outline' | 'chain';
};

function resample(o: readonly PtMm[], closed: boolean): PtMm[] {
  const r: PtMm[] = [];
  const n = closed ? o.length : o.length - 1;
  for (let i = 0; i < n; i++) {
    const a = o[i];
    const b = o[(i + 1) % o.length];
    const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / ST));
    for (let j = 0; j < k; j++)
      r.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  if (!closed && o.length) r.push(o[o.length - 1]);
  return r;
}

function dPoly(p: PtMm, P: readonly PtMm[], closed = true): number {
  let d = Infinity;
  const n = closed ? P.length : P.length - 1;
  for (let i = 0; i < n; i++) d = Math.min(d, segNearest(p, P[i], P[(i + 1) % P.length]).d);
  return d;
}

const sortNum = (a: readonly number[]) => [...a].sort((x, y) => x - y);
const pct = (a: readonly number[], q: number) => {
  const s = sortNum(a);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};
const median = (a: readonly number[]) => {
  const s = sortNum(a);
  return s.length ? s[s.length >> 1] : 0;
};

/** Longest cyclic run of samples meeting pred, in mm. */
function runMax(arr: readonly number[], pred: (v: number) => boolean): number {
  const n = arr.length;
  const s = arr.findIndex((v) => !pred(v));
  if (s < 0) return n * ST;
  let best = 0;
  let cur = 0;
  for (let k = 1; k <= n; k++) {
    if (pred(arr[(s + k) % n])) best = Math.max(best, ++cur);
    else cur = 0;
  }
  return best * ST;
}

/**
 * The family's verdicts by rank, and its grade step (mm per rank). Cells must be one piece's closed
 * outlines; ranks are the card indices (gaps allowed).
 */
export function judgeNest(
  cells: readonly NestCell[],
  opts: NestOpts = {},
): { verdicts: Map<number, NestVerdict>; step: number; plainStep: number } {
  const robust = opts.robust ?? true;
  const limCap = opts.limCap ?? Infinity;
  const [limFloor, limK] = opts.lim === 'chain' ? [2, 0.5] : [10, 3];
  const C = cells.filter((c) => c.outer.length > 2).sort((a, b) => a.rank - b.rank);
  const verdicts = new Map<number, NestVerdict>();
  for (const c of C) verdicts.set(c.rank, { kind: 'unjudged' });
  if (C.length < 3) return { verdicts, step: 0, plainStep: 0 };
  const S = C.map((c) => resample(c.outer, true));
  const memo = new Map<string, number[]>();
  // signed distance of a's samples to b's outline: negative inside
  const sd = (a: number, b: number) => {
    const k = `${a},${b}`;
    let v = memo.get(k);
    if (!v) {
      const P = C[b].outer;
      v = S[a].map((q) => (pointInPoly(q, P) ? -1 : 1) * dPoly(q, P));
      memo.set(k, v);
    }
    return v;
  };
  const steps: number[] = [];
  for (let k = 0; k + 1 < C.length; k++) {
    const p95 = Math.max(
      pct(sd(k, k + 1).map(Math.abs), 0.95),
      pct(sd(k + 1, k).map(Math.abs), 0.95),
    );
    steps.push(p95 / (C[k + 1].rank - C[k].rank));
  }
  const plainStep = Math.max(1, median(steps));
  const keep = sortNum(steps).slice(0, Math.max(1, Math.ceil(steps.length * 0.75)));
  const step = robust ? Math.max(1, median(keep)) : plainStep;
  const lim = (a: number, b: number, cap: boolean) => {
    const v = Math.max(limFloor, limK * step * Math.abs(C[b].rank - C[a].rank));
    return cap ? Math.min(limCap, v) : v;
  };
  const out = (a: number, b: number, cap = true) => runMax(sd(a, b), (v) => v > lim(a, b, cap));
  let bad = new Set<number>();
  for (let pass = 0; pass < 2; pass++) {
    const nb = new Set<number>();
    for (let j = 1; j + 1 < C.length; j++) {
      let lo = -1;
      let hi = -1;
      for (let k = j - 1; k >= 0 && lo < 0; k--) if (!bad.has(k)) lo = k;
      for (let k = j + 1; k < C.length && hi < 0; k++) if (!bad.has(k)) hi = k;
      if (lo < 0 || hi < 0 || out(lo, hi, false) >= RUN) continue;
      const truncMm = out(lo, j);
      const overMm = out(j, hi);
      const t = truncMm >= RUN;
      const o = overMm >= RUN;
      const kind = t ? (o ? 'both' : 'trunc') : o ? 'over' : 'ok';
      if (kind !== 'ok') nb.add(j);
      if (pass === 1)
        verdicts.set(C[j].rank, { kind, lo: C[lo].rank, hi: C[hi].rank, truncMm, overMm });
    }
    bad = nb;
  }
  return { verdicts, step, plainStep };
}

/** Distance from p to the nearest of a rank's drawn chains (open polylines). */
function dChains(p: PtMm, chains: readonly (readonly PtMm[])[]): number {
  let d = Infinity;
  for (const ch of chains) if (ch.length > 1) d = Math.min(d, dPoly(p, ch, false));
  return d;
}

/**
 * on-neighbour: the longest run (mm) of `outer` lying on rank `nb`'s drawn chains (within
 * 0.25 · step) where the bracketing ranks lo and hi do NOT converge (their chains > 1.5 · step
 * apart at that sample) and the size's OWN drawn line runs beside (0.5–2 steps away) instead. A run
 * ≥ 20 mm means the outline was closed on its neighbour's line. `chains` maps rank → that rank's
 * drawn chains, the cell's own rank included; lo / hi are the nearest other ranks present.
 */
export function onNeighbour(
  outer: readonly PtMm[],
  rank: number,
  chains: ReadonlyMap<number, readonly (readonly PtMm[])[]>,
  step: number,
): { nb: number; runMm: number } | null {
  const ranks = [...chains.keys()].sort((a, b) => a - b);
  const lo = ranks.filter((r) => r < rank).pop();
  const hi = ranks.find((r) => r > rank);
  const ownChains = chains.get(rank);
  if ((lo === undefined && hi === undefined) || !ownChains) return null;
  const S = resample(outer, true);
  const dLo = lo === undefined ? null : S.map((q) => dChains(q, chains.get(lo)!));
  const dHi = hi === undefined ? null : S.map((q) => dChains(q, chains.get(hi)!));
  const dOwn = S.map((q) => dChains(q, ownChains));
  const on = 0.25 * step;
  let best: { nb: number; runMm: number } | null = null;
  for (const [nb, dNb, dOther] of [
    [lo, dLo, dHi],
    [hi, dHi, dLo],
  ] as const) {
    if (nb === undefined || !dNb) continue;
    // converge: the other bracketing rank also passes by this sample (a shared edge);
    // own line elsewhere: the size's OWN line runs beside (within 2 steps) but not here. A line
    // drawn once for two sizes (stepped grading) is ranked to one of them: the other has no own
    // line beside it, and running on it is not a wrong close.
    const flag = S.map(
      (_, i) =>
        dNb[i] <= on &&
        !(dOther && dOther[i] <= 1.5 * step) &&
        dOwn[i] > 0.5 * step &&
        dOwn[i] <= 2 * step,
    );
    const runMm = runMax(
      flag.map((f) => (f ? 1 : 0)),
      (v) => v === 1,
    );
    if (runMm >= RUN && (!best || runMm > best.runMm)) best = { nb, runMm };
  }
  return best;
}
