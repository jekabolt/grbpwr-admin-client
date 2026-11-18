// pieces/ — LADDER_RESCUE: a rescued 'ignore' line that is a rung of a ranked ladder.
//
// A rescued line (walls.ts rescuedIgnored) walls every rank it touches. When it runs parallel to
// lines of ≥ 2 ranks it is itself a rung of that ladder: some size's line, drawn in the wrong pen.
// A size that closed on it then often closed on ANOTHER size's line, and its area falls off the
// family's trend. Such a cell is withdrawn from the rung and filled again without it (fill.ts
// ladderPass); here are the rung detector, the "uses R" test and the per-family trend verdicts.
//
// The rule is the dry run's (scripts: fires4.py, 16 Nov 2026), ported one to one so the code
// fires on the same cells:
//   rung      rescued, unranked, open, ≥ 15 mm; ranked parallels (mean offset 2–60 mm, sd < 1 mm,
//             length ±25 %) of ≥ 2 ranks
//   uses R    R walls the cell's rank, and ≥ 15 of R's 1 mm samples lie within 1 mm of the outline
//   trend     one local trend per cell, from the family's clean closed cells (iterative outlier
//             rejection, floored at max(3, ½ closed)); between the nearest clean sizes below and
//             above, or one step past an end
//   verdict   keep (on trend) · withdraw (off) · suppressed (noisy family) · notrend · collapsed
import type { ChainId, ChainSet, PtMm } from 'lib/pattern-import/types';

import { bboxOf, segNearest, signedArea } from './geom';
import type { WallModel } from './walls';

const PAR_STD = 1;
const PAR_MIN = 2;
const PAR_MAX = 60;
const ALONG = 1;
const RUN = 15;
const MIN_LEN = 15;
/** Least relative tolerance (sizes of almost equal area). */
const FLOOR = 0.03;
/** A family whose local size step is > 10 % of its area is too noisy to judge. */
const NOISE = 0.1;

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * On unless `LADDER_RESCUE_OFF=1`. No `process` (the browser) leaves it on: the operator's fill
 * is the same fill the corpus measured.
 */
export function ladderOn(): boolean {
  return typeof process === 'undefined' || process.env?.LADDER_RESCUE_OFF !== '1';
}

/** On unless `LADDER_JUDGE_OFF=1`. The judge runs inside the rescue pass, so rescue off skips it. */
export function ladderJudgeOn(): boolean {
  return typeof process === 'undefined' || process.env?.LADDER_JUDGE_OFF !== '1';
}

/** Points every ≤ step mm along an open polyline: each segment split evenly, plus the last point. */
function samples(pts: readonly PtMm[], step: number): PtMm[] {
  const out: PtMm[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}

function dLine(p: PtMm, pts: readonly PtMm[]): number {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segNearest(p, pts[i], pts[i + 1]).d);
  return d;
}

function length(pts: readonly PtMm[]): number {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++)
    s += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return s;
}

const grow = (b: Box, m: number): Box => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});
const hit = (a: Box, b: Box) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

export type Rung = {
  id: ChainId;
  pts: PtMm[];
  box: Box;
  /** Ranks whose walls carry it (rescued items of that rank). */
  walls: Set<number>;
  /** Ranks of its ranked parallels. */
  parallel: number[];
};

/** The rescued lines that are rungs of a ranked ladder (see the head of the file). */
export function ladderRungs(
  set: ChainSet,
  m: WallModel,
  rescuedOfRank: (r: number) => readonly ChainId[],
): Map<ChainId, Rung> {
  const rankOf = new Map<ChainId, Set<number>>();
  m.byRank.forEach((ids, r) =>
    ids.forEach((id) => {
      let s = rankOf.get(id);
      if (!s) rankOf.set(id, (s = new Set()));
      s.add(r);
    }),
  );
  const wallsOf = new Map<ChainId, Set<number>>();
  for (let r = 0; r < m.n; r++)
    for (const id of rescuedOfRank(r)) {
      let s = wallsOf.get(id);
      if (!s) wallsOf.set(id, (s = new Set()));
      s.add(r);
    }
  const ranked = [...rankOf]
    .map(([id, ks]) => ({ id, ks, c: set.chains[id] }))
    .filter((x) => x.c && !x.c.closed && x.c.pts.length > 1)
    .map((x) => ({ ...x, len: length(x.c.pts), box: bboxOf(x.c.pts) }));
  const out = new Map<ChainId, Rung>();
  for (const [id, walls] of wallsOf) {
    const c = set.chains[id];
    if (!c || c.closed || rankOf.has(id) || c.pts.length < 2) continue;
    const len = length(c.pts);
    if (len < MIN_LEN) continue;
    const s4 = samples(c.pts, 4);
    const reach = grow(bboxOf(c.pts), PAR_MAX);
    const par = new Set<number>();
    for (const o of ranked) {
      if (!hit(reach, o.box) || Math.abs(o.len - len) > 0.25 * len) continue;
      const ds = s4.map((q) => dLine(q, o.c.pts));
      const mean = ds.reduce((a, d) => a + d, 0) / ds.length;
      const sd = Math.sqrt(ds.reduce((a, d) => a + (d - mean) ** 2, 0) / ds.length);
      if (mean > PAR_MIN && mean < PAR_MAX && sd < PAR_STD) for (const k of o.ks) par.add(k);
    }
    if (par.size < 2) continue;
    out.set(id, { id, pts: c.pts, box: bboxOf(c.pts), walls, parallel: [...par].sort() });
  }
  return out;
}

/** The rungs a closed outline of rank r runs along (≥ 15 mm within 1 mm), by id. */
export function rungsUsed(rungs: Map<ChainId, Rung>, r: number, outer: readonly PtMm[]): ChainId[] {
  if (outer.length < 3) return [];
  const ring = [...outer, outer[0]];
  const ob = grow(bboxOf(outer), 2);
  const used: ChainId[] = [];
  for (const R of rungs.values()) {
    if (!R.walls.has(r) || !hit(ob, R.box)) continue;
    let on = 0;
    for (const q of samples(R.pts, 1)) if (dLine(q, ring) < ALONG) on++;
    if (on >= RUN) used.push(R.id);
  }
  return used;
}

export const outlineArea = (outer: readonly PtMm[]) => Math.abs(signedArea(outer));

type RA = { rank: number; area: number };
export type Trend = {
  area: number;
  tol: number;
  kind: 'between' | 'end';
  step: number;
  /** The two clean ranks the trend is drawn through (the readout marks repaired ones). */
  from: [number, number];
};

/** One local trend at rank r from (rank, area) pairs; null when none can be drawn. */
export function localTrend(ok: readonly RA[], r: number): Trend | null {
  const lo = ok.filter((x) => x.rank < r).sort((a, b) => b.rank - a.rank);
  const hi = ok.filter((x) => x.rank > r).sort((a, b) => a.rank - b.rank);
  let p0: RA;
  let p1: RA;
  let kind: Trend['kind'];
  let gap = 1;
  if (lo.length && hi.length) {
    [p0, p1] = [lo[0], hi[0]];
    kind = 'between';
    gap = p1.rank - p0.rank - 1;
  } else if (lo.length >= 2 && r - lo[0].rank === 1) {
    [p1, p0] = [lo[0], lo[1]];
    kind = 'end';
  } else if (hi.length >= 2 && hi[0].rank - r === 1) {
    [p0, p1] = [hi[0], hi[1]];
    kind = 'end';
  } else return null;
  const slope = (p1.area - p0.area) / (p1.rank - p0.rank);
  const area = p0.area + slope * (r - p0.rank);
  if (area <= 0) return null;
  let tol = Math.max(0.5 * Math.abs(slope), FLOOR * area) / area;
  tol *= kind === 'end' ? 1.5 : 1 + 0.5 * (gap - 1);
  return { area, tol, kind, step: Math.abs(slope) / area, from: [p0.rank, p1.rank] };
}

/**
 * The family's clean closed cells: drop the worst leave-one-out outlier (dev > tol) and repeat.
 * Never below max(3, ½ the closed cells): an outlier left at that floor means the wrong cells may
 * be the majority on one side and the clean set may have flipped to the wrong ladder — collapsed.
 */
export function cleanSet(closed: readonly RA[]): {
  clean: RA[];
  rejected: number[];
  collapsed: boolean;
} {
  let clean = [...closed];
  const floor = Math.max(3, closed.length / 2);
  let collapsed = false;
  for (;;) {
    let worst = 1;
    let wk: number | null = null;
    for (const x of clean) {
      const t = localTrend(
        clean.filter((y) => y.rank !== x.rank),
        x.rank,
      );
      if (!t) continue;
      const q = Math.abs(x.area - t.area) / (t.tol * t.area);
      if (q > worst) [worst, wk] = [q, x.rank];
    }
    if (wk === null) break;
    if (clean.length - 1 < floor) {
      collapsed = true;
      break;
    }
    clean = clean.filter((x) => x.rank !== wk);
  }
  const kept = new Set(clean.map((x) => x.rank));
  return {
    clean,
    rejected: closed.filter((x) => !kept.has(x.rank)).map((x) => x.rank),
    collapsed,
  };
}

/** An area step against the grade by more than this share is an inversion. */
const INVERT = 0.03;
/** Adjacent per-rank steps whose ratio exceeds this look like two ladders (diag only). */
const STEP_RATIO = 3;

const inverted = (lo: RA, hi: RA) => hi.area < lo.area * (1 - INVERT);

export type LadderVerdict = {
  kind: 'keep' | 'withdraw' | 'suppressed' | 'notrend' | 'collapsed';
  /** Why a fire was suppressed: a noisy family, or a trend drawn through an inverted neighbour. */
  why?: 'noise' | 'neighbour';
  trend?: Trend;
  dev?: number;
  /** The refill may leave the cell open: it sits ≥ 2 tolerances off its trend. */
  mayOpen?: boolean;
};

/**
 * A trend neighbour that steps against the grade next to its own clean neighbours is a wrong cell
 * the clean set let through (same-direction truncations do: Memoir A H 16 / 30), and a fire drawn
 * through it is not evidence, even when it happens to be right.
 */
function neighbourInverted(clean: readonly RA[], t: Trend): boolean {
  const cs = [...clean].sort((a, b) => a.rank - b.rank);
  for (const nb of t.from) {
    const i = cs.findIndex((x) => x.rank === nb);
    if (i < 0) continue;
    if ((i > 0 && inverted(cs[i - 1], cs[i])) || (i + 1 < cs.length && inverted(cs[i], cs[i + 1])))
      return true;
  }
  return false;
}

/** The verdict on a cell of rank r and area a that runs along a rung. */
export function ladderVerdict(
  fam: ReturnType<typeof cleanSet>,
  r: number,
  area: number,
): LadderVerdict {
  if (fam.collapsed) return { kind: 'collapsed' };
  const clean = fam.clean.filter((x) => x.rank !== r);
  const t = localTrend(clean, r);
  if (!t) return { kind: 'notrend' };
  const dev = Math.abs(area - t.area) / t.area;
  if (t.step > NOISE)
    return dev > t.tol
      ? { kind: 'suppressed', why: 'noise', trend: t, dev }
      : { kind: 'keep', trend: t, dev };
  if (dev <= t.tol) return { kind: 'keep', trend: t, dev };
  if (neighbourInverted(clean, t)) return { kind: 'suppressed', why: 'neighbour', trend: t, dev };
  return { kind: 'withdraw', trend: t, dev, mayOpen: dev >= 2 * t.tol };
}

/**
 * Diag only, no verdict: inversions between adjacent closed sizes, and the longest run of adjacent
 * per-rank steps whose ratio exceeds STEP_RATIO. They count wrong cells — they cannot tell one bad
 * line from two interleaved ladders (Reims M LOWER SKIRT vs Kalla E TOP FRONT) — so they are picture
 * leads, never a reason to withhold or fire.
 */
export function familyFlags(closed: readonly RA[]): { inversions: number; ratioRun: number } {
  const cs = [...closed].sort((a, b) => a.rank - b.rank);
  let inversions = 0;
  const steps: number[] = [];
  for (let i = 0; i + 1 < cs.length; i++) {
    if (inverted(cs[i], cs[i + 1])) inversions++;
    steps.push((cs[i + 1].area - cs[i].area) / (cs[i + 1].rank - cs[i].rank));
  }
  let run = 0;
  let ratioRun = 0;
  for (let i = 0; i + 1 < steps.length; i++) {
    const [a, b] = [steps[i], steps[i + 1]];
    run = a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) > STEP_RATIO ? run + 1 : 0;
    ratioRun = Math.max(ratioRun, run);
  }
  return { inversions, ratioRun };
}
