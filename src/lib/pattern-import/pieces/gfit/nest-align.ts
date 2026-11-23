// Joint alignment of one nested piece (owner, 18 Nov 2026).
//
// Every size of a nested piece is the etalon walked along its outward normals. A ray collects
// the chains it crosses; dynamic programming matches those crossings to the card order. A chain
// then gets one decision (one size, common, or a question). Where a size has no line, the ring
// is the etalon point shifted by the predicted step and counted by derivedByDistance.
//
// Parameters below are one set for every file. The journal entry records the measurement they
// came from (the synthetic nest in nest-align.test.ts: 10 mm and 8 mm steps).
import type { PtMm } from 'lib/pattern-import/types';

import { segIntersect } from '../geom';
import { canonRing, derivedByDistance, nestCorners } from './nest-walk';

export const NEST_ALIGN = {
  /** mm between rays along the etalon */
  rayStepMm: 2,
  /** a crossing farther than this from the size's prediction is a gap, not a line (mm) */
  gapCost: 6,
  /** an extra crossing the alignment skips (mm-equivalent) */
  noiseCost: 3,
  /** a chain that meets the ray at a shallower angle than this is not a crossing */
  angleMinDeg: 25,
  /** a stretch at least this long with two answers is a question, not a rank */
  askMinMm: 10,
  /** two sizes within this cost of each other are not distinguished (mm) */
  askMargin: 1.5,
  /** sizes may share one crossing when their predictions sit within this (mm) */
  commonStepMm: 1.5,
  /** a fold: the shared predictions span less than this, and at least three sizes sit on it */
  clearCommonMm: 0.4,
  /** pen cost added to a geometric miss, capped so a pen never overrides a full step */
  styleWeight: 2,
  penCapMm: 4,
  /** how far a ray looks back from the etalon (mm). Forward is 200, unless `tune.ray` is `first`. */
  rayPadMm: 40,
  iterations: 3,
};

export type AlignChain = {
  id: number;
  pts: readonly PtMm[];
  style: number;
  motif: readonly number[] | null;
};

export type AlignSizeIn = {
  rank: number;
  step: number;
  /** the pipeline's closed outline; null when the size is open */
  outer: readonly PtMm[] | null;
};

export type NestAlignIn = {
  sizes: readonly AlignSizeIn[];
  chains: readonly AlignChain[];
  /** pipeline rank → chain ids. A chain absent from every row is unranked. */
  byRank: readonly (readonly number[])[];
  common: readonly number[];
  /** from pickEtalon; the middle closed size when omitted */
  etalon?: number;
  /**
   * ray `fixed`: 40 mm back, 200 mm forward.
   * ray `first`: stop at the first other size's ring.
   * costs `band`: the 1.5 mm ask/common band.
   * costs `step`: a rival stays only within half the local step.
   */
  tune?: { ray?: 'fixed' | 'first'; costs?: 'band' | 'step' };
};

export type AlignAsk = {
  chain: number;
  mm: number;
  ranks: number[];
  style: number;
  motif: readonly number[] | null;
};

export type AlignMove = {
  id: number;
  from: number | 'common' | 'none';
  to: number | 'common' | 'ask';
  mm: number;
  style: number;
  motif: readonly number[] | null;
};

export type AlignSizeOut = {
  rank: number;
  /** chains the alignment gives this size, with the length of ray steps that hit them */
  chains: { id: number; mm: number }[];
  holesMm: number;
  derivedShare: number;
  /** false when the pipeline already closed this size: its outline is not rebuilt */
  redraw: boolean;
  ring: PtMm[];
  /** the alignment would hand this open size back as closed */
  ok: boolean;
  cross: boolean;
  nested: boolean;
};

export type NestAlignOut = {
  etalon: number | null;
  why?: 'not-nested' | 'no-grade';
  sizes: AlignSizeOut[];
  moves: AlignMove[];
  /** a chain split almost evenly: an assembly-order candidate, not two ranks */
  splits: { id: number; mm: number }[];
  asks: AlignAsk[];
  common: { id: number; mm: number }[];
};

type Ray = { p: PtMm; dir: PtMm; corner: boolean };
type Hit = { t: number; chain: number; p: PtMm };

const INF = 1e12;

const hypot = (a: PtMm, b: PtMm) => Math.hypot(b.x - a.x, b.y - a.y);

function unit(p: PtMm): PtMm {
  const L = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / L, y: p.y / L };
}

/** Fraction of the chain that lies within 1 mm of the ring. */
function coverFrac(pts: readonly PtMm[], ring: readonly PtMm[]): number {
  let near = 0;
  let tot = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = hypot(a, b);
    if (L < 1e-9) continue;
    const n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const p = {
        x: a.x + ((b.x - a.x) * (k + 0.5)) / n,
        y: a.y + ((b.y - a.y) * (k + 0.5)) / n,
      };
      if (nearRing(ring, p, 1)) near += L / n;
      tot += L / n;
    }
  }
  return tot ? near / tot : 0;
}

function chainLen(c: AlignChain): number {
  let L = 0;
  for (let i = 1; i < c.pts.length; i++) L += hypot(c.pts[i - 1], c.pts[i]);
  return L;
}

function styleKey(c: AlignChain): string {
  return `${c.style}|${c.motif?.join(',') ?? ''}`;
}

function raysOf(outer: readonly PtMm[]): Ray[] {
  const ring = canonRing(outer).pts;
  const corners = new Set(nestCorners(ring).map((c) => c.i));
  const rays: Ray[] = [];
  let acc = NEST_ALIGN.rayStepMm;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const L = hypot(a, b);
    if (L < 1e-9) continue;
    const tx = (b.x - a.x) / L;
    const ty = (b.y - a.y) / L;
    let dir = { x: ty, y: -tx };
    if (corners.has(i)) {
      const p = ring[(i - 1 + n) % n];
      const il = hypot(p, a) || 1;
      const n1 = { x: (a.y - p.y) / il, y: -(a.x - p.x) / il };
      dir = unit({ x: n1.x + dir.x, y: n1.y + dir.y });
    }
    if (acc >= NEST_ALIGN.rayStepMm - 1e-6 || corners.has(i)) {
      rays.push({ p: { x: a.x, y: a.y }, dir, corner: corners.has(i) });
      acc = 0;
    }
    acc += L;
  }
  return rays;
}

/** Signed distance along the ray of segment ab, or null when the crossing is too shallow. */
function crossRay(ray: Ray, a: PtMm, b: PtMm, pad: number, reach: number): Hit | null {
  const s = { x: ray.p.x - ray.dir.x * pad, y: ray.p.y - ray.dir.y * pad };
  const e = { x: ray.p.x + ray.dir.x * reach, y: ray.p.y + ray.dir.y * reach };
  const h = segIntersect(s, e, a, b);
  if (!h) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const sin = Math.min(1, Math.abs(dx * ray.dir.y - dy * ray.dir.x) / len);
  const ang = (Math.asin(sin) * 180) / Math.PI;
  if (ang < NEST_ALIGN.angleMinDeg) return null;
  return { t: -pad + h.t * (pad + reach), chain: -1, p: h.p };
}

function crossings(ray: Ray, chains: readonly AlignChain[], pad: number, reach: number): Hit[] {
  const best = new Map<number, Hit>();
  for (const c of chains) {
    for (let i = 1; i < c.pts.length; i++) {
      const h = crossRay(ray, c.pts[i - 1], c.pts[i], pad, reach);
      if (!h) continue;
      h.chain = c.id;
      const prev = best.get(c.id);
      if (!prev || Math.abs(h.t) < Math.abs(prev.t)) best.set(c.id, h);
    }
  }
  return [...best.values()].sort((a, b) => a.t - b.t);
}

function ringHits(ray: Ray, ring: readonly PtMm[], pad: number, reach: number): number[] {
  const ts: number[] = [];
  for (let i = 1; i < ring.length; i++) {
    const h = crossRay(ray, ring[i - 1], ring[i], pad, reach);
    if (h && Math.abs(h.t) > 0.4) ts.push(h.t);
  }
  const a = ring[ring.length - 1];
  const b = ring[0];
  if (a && b && hypot(a, b) > 0.4) {
    const h = crossRay(ray, a, b, pad, reach);
    if (h && Math.abs(h.t) > 0.4) ts.push(h.t);
  }
  return ts;
}

function pickT(ts: number[], guess: number | null): number | null {
  if (!ts.length) return null;
  if (guess == null) return ts.reduce((m, t) => (Math.abs(t) < Math.abs(m) ? t : m));
  return ts.reduce((m, t) => (Math.abs(t - guess) < Math.abs(m - guess) ? t : m));
}

type Pen = (chain: number, size: number) => number;

function alignRay(
  hits: Hit[],
  pred: number[],
  pen: Pen,
  locked: ReadonlyMap<number, number | 'common' | 'ask'>,
): { size: number; hit: number; common: boolean }[] {
  const K = pred.length;
  const H = hits.length;
  const dp: number[][] = Array.from({ length: K + 1 }, () => Array(H + 1).fill(INF));
  const prev: ({
    i: number;
    j: number;
    kind: 'gap' | 'noise' | 'take' | 'common';
    m: number;
  } | null)[][] = Array.from({ length: K + 1 }, () => Array(H + 1).fill(null));
  dp[0][0] = 0;
  const costOf = (s: number, h: Hit) => {
    const lock = locked.get(h.chain);
    if (lock === 'ask' || lock === 'common') return INF;
    if (typeof lock === 'number' && lock !== s) return INF;
    const c = Math.abs(h.t - pred[s]) + pen(h.chain, s);
    return c <= NEST_ALIGN.gapCost ? c : INF;
  };
  for (let i = 0; i <= K; i++) {
    for (let j = 0; j <= H; j++) {
      const c = dp[i][j];
      if (c >= INF / 2) continue;
      if (i < K && c + NEST_ALIGN.gapCost < dp[i + 1][j]) {
        dp[i + 1][j] = c + NEST_ALIGN.gapCost;
        prev[i + 1][j] = { i, j, kind: 'gap', m: 1 };
      }
      if (j < H && c + NEST_ALIGN.noiseCost < dp[i][j + 1]) {
        dp[i][j + 1] = c + NEST_ALIGN.noiseCost;
        prev[i][j + 1] = { i, j, kind: 'noise', m: 0 };
      }
      if (i < K && j < H) {
        const a = costOf(i, hits[j]);
        if (a < INF && c + a < dp[i + 1][j + 1]) {
          dp[i + 1][j + 1] = c + a;
          prev[i + 1][j + 1] = { i, j, kind: 'take', m: 1 };
        }
      }
      if (j < H) {
        for (let m = 2; i + m <= K && m <= 8; m++) {
          const ps: number[] = [];
          let worst = 0;
          let ok = true;
          for (let s = i; s < i + m; s++) {
            const a = costOf(s, hits[j]);
            if (a >= INF) {
              ok = false;
              break;
            }
            worst = Math.max(worst, a);
            ps.push(pred[s]);
          }
          if (!ok) break;
          if (Math.max(...ps) - Math.min(...ps) > NEST_ALIGN.commonStepMm) break;
          if (c + worst < dp[i + m][j + 1]) {
            dp[i + m][j + 1] = c + worst;
            prev[i + m][j + 1] = { i, j, kind: 'common', m };
          }
        }
      }
    }
  }
  const out: { size: number; hit: number; common: boolean }[] = [];
  let i = K;
  let j = H;
  while (i > 0 || j > 0) {
    const p = prev[i][j];
    if (!p) break;
    if (p.kind === 'take') out.push({ size: p.i, hit: p.j, common: false });
    else if (p.kind === 'common') {
      for (let s = p.i; s < p.i + p.m; s++) out.push({ size: s, hit: p.j, common: true });
    }
    i = p.i;
    j = p.j;
  }
  return out;
}

function selfCross(ring: readonly PtMm[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  const segLen = (i: number, j: number) => {
    let L = 0;
    for (let k = i; k !== j; k = (k + 1) % n) {
      L += hypot(ring[k], ring[(k + 1) % n]);
      if (L > 1) return L;
    }
    return L;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (!segIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) continue;
      if (Math.min(segLen(i, j), segLen(j, i)) > 1) return true;
    }
  }
  return false;
}

function inside(ring: readonly PtMm[], p: PtMm): boolean {
  let w = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a.y > p.y !== b.y > p.y) {
      const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (x > p.x) w++;
    }
  }
  return w % 2 === 1;
}

function nearRing(ring: readonly PtMm[], p: PtMm, tol: number): boolean {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-12;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    best = Math.min(best, Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy));
    if (best <= tol) return true;
  }
  return false;
}

function nestedIn(inner: readonly PtMm[], outer: readonly PtMm[]): boolean {
  if (inner.length < 3 || outer.length < 3) return false;
  let n = 0;
  let ok = 0;
  for (let i = 0; i < inner.length; i += 4) {
    n++;
    if (inside(outer, inner[i]) || nearRing(outer, inner[i], 1.5)) ok++;
  }
  return n > 0 && ok / n >= 0.9;
}

export function nestAlign(inp: NestAlignIn): NestAlignOut {
  const sizes = inp.sizes;
  const closed = sizes.filter((s) => s.outer && s.outer.length > 2);
  if (closed.length < 2) {
    return {
      etalon: null,
      why: 'no-grade',
      sizes: [],
      moves: [],
      splits: [],
      asks: [],
      common: [],
    };
  }
  const mean = sizes.reduce((s, x) => s + x.rank, 0) / sizes.length;
  const etalon =
    inp.etalon ??
    closed.reduce((b, s) => (Math.abs(s.rank - mean) < Math.abs(b.rank - mean) ? s : b)).rank;
  const eSize = sizes.find((s) => s.rank === etalon);
  if (!eSize?.outer) {
    return {
      etalon: null,
      why: 'no-grade',
      sizes: [],
      moves: [],
      splits: [],
      asks: [],
      common: [],
    };
  }
  const stepE = eSize.step;
  let rays = raysOf(eSize.outer);
  const byId = new Map(inp.chains.map((c) => [c.id, c]));
  const pipeline = new Map<number, number | 'common'>();
  inp.common.forEach((id) => pipeline.set(id, 'common'));
  inp.byRank.forEach((ids, r) => ids.forEach((id) => pipeline.set(id, r)));

  const prior = new Map<string, Map<number, number>>();
  for (const s of closed) {
    const ring = s.outer!;
    for (const c of inp.chains) {
      if (c.pts.length < 2) continue;
      let on = 0;
      let tot = 0;
      for (let i = 0; i < c.pts.length; i += 3) {
        tot++;
        if (nearRing(ring, c.pts[i], 1)) on++;
      }
      if (tot && on / tot >= 0.6) {
        const k = styleKey(c);
        const m = prior.get(k) ?? new Map<number, number>();
        m.set(s.rank, (m.get(s.rank) ?? 0) + chainLen(c));
        prior.set(k, m);
      }
    }
  }
  const pen: Pen = (chain, size) => {
    const c = byId.get(chain);
    if (!c) return 0;
    const row = prior.get(styleKey(c));
    if (!row || !row.size) return 0;
    const best = Math.max(...row.values());
    const p = (row.get(size) ?? 0) / best;
    if (p >= 1) return 0;
    return Math.min(NEST_ALIGN.penCapMm, NEST_ALIGN.styleWeight * -Math.log(Math.max(p, 1e-3)));
  };

  // `fixed` looks 40 mm back and 200 mm forward. `first` stops at the nearest other
  // closed ring, so a ray cannot run on past that outline into another piece.
  const rayMode = inp.tune?.ray ?? 'fixed';
  const stepCosts = inp.tune?.costs === 'step';
  const fixedLim = { pad: NEST_ALIGN.rayPadMm, fwd: 200 };
  const onOutline = (ring: readonly PtMm[], p: PtMm) => nearRing(ring, p, 0.8);
  const limitsOf = (rs: readonly Ray[]) =>
    rs.map((ray) => {
      if (rayMode !== 'first') return { ...fixedLim };
      let fore = Infinity;
      let back = Infinity;
      for (const s of closed) {
        if (s.rank === etalon || !s.outer) continue;
        for (const t of ringHits(ray, s.outer, fixedLim.pad, fixedLim.fwd)) {
          if (t > 0.4) fore = Math.min(fore, t);
          else if (t < -0.4) back = Math.min(back, -t);
        }
      }
      return {
        pad: Number.isFinite(back) ? back + 1 : fixedLim.pad,
        fwd: Number.isFinite(fore) ? fore + 1 : fixedLim.fwd,
      };
    });
  const measure = (rs: readonly Ray[], lim: readonly { pad: number; fwd: number }[]) =>
    rs.map((ray, ri) =>
      sizes.map((s) => {
        if (s.rank === etalon) return 0;
        if (!s.outer) return null;
        if (onOutline(s.outer, ray.p)) return 0;
        return pickT(ringHits(ray, s.outer, lim[ri].pad, lim[ri].fwd), null);
      }),
    );
  let limits = limitsOf(rays);
  let measured = measure(rays, limits);
  // A fold measures every size at the same t. Those rays must not set the grade slope:
  // a median full of zeros flattens every other prediction onto the fold.
  const spreadOf = (row: (number | null)[]) => {
    const ts = row.filter((t): t is number => t != null);
    return ts.length < 2 ? 0 : Math.max(...ts) - Math.min(...ts);
  };
  const ratios: number[] = [];
  for (const row of measured) {
    if (spreadOf(row) <= NEST_ALIGN.commonStepMm) continue;
    sizes.forEach((s, i) => {
      const t = row[i];
      const ds = s.step - stepE;
      if (t != null && Math.abs(ds) > 0.2) ratios.push(t / ds);
    });
  }
  ratios.sort((a, b) => a - b);
  let alpha = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 0;
  if (alpha < 0) {
    rays = rays.map((r) => ({ ...r, dir: { x: -r.dir.x, y: -r.dir.y } }));
    alpha = -alpha;
    if (rayMode === 'first') {
      limits = limitsOf(rays);
      measured = measure(rays, limits);
    } else {
      measured.forEach((row) => {
        for (let i = 0; i < row.length; i++) if (row[i] != null) row[i] = -row[i]!;
      });
    }
  }
  // a nest that does not grow along the card: more than a third of the closed pairs go backwards
  let pairs = 0;
  let back = 0;
  for (const row of measured) {
    for (let a = 0; a < sizes.length; a++) {
      for (let b = a + 1; b < sizes.length; b++) {
        if (row[a] == null || row[b] == null) continue;
        if (sizes[b].step === sizes[a].step) continue;
        pairs++;
        const forward =
          sizes[b].step > sizes[a].step ? row[b]! > row[a]! - 0.5 : row[a]! > row[b]! - 0.5;
        if (!forward) back++;
      }
    }
  }
  if (pairs > 8 && back / pairs > 0.35) {
    return { etalon, why: 'not-nested', sizes: [], moves: [], splits: [], asks: [], common: [] };
  }

  const predOf = (row: (number | null)[]) => {
    const known = sizes.flatMap((s, i) => (row[i] != null ? [{ step: s.step, t: row[i]! }] : []));
    const fit = (step: number) => {
      if (!known.length) return alpha * (step - stepE);
      if (known.length === 1) {
        const ds = known[0].step - stepE;
        const a = Math.abs(ds) > 0.2 ? known[0].t / ds : alpha;
        return a * (step - stepE);
      }
      const n = known.length;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      for (const k of known) {
        sx += k.step;
        sy += k.t;
        sxx += k.step * k.step;
        sxy += k.step * k.t;
      }
      const den = n * sxx - sx * sx;
      if (Math.abs(den) < 1e-6) return n ? sy / n : 0;
      const b = (n * sxy - sx * sy) / den;
      const a0 = (sy - b * sx) / n;
      return a0 + b * step;
    };
    return sizes.map((s, i) => (row[i] != null ? row[i]! : fit(s.step)));
  };

  const owner = new Map<number, number | 'common' | 'ask'>();
  // A later pass may give a chain only to the size the previous pass decided.
  for (let iter = 0; iter < NEST_ALIGN.iterations; iter++) {
    const locked = new Map(owner);
    const vote = new Map<number, Map<number, number>>();
    const voteCommon = new Map<number, number>();
    const askLen = new Map<number, number>();
    const askRanks = new Map<number, Set<number>>();
    const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);
    rays.forEach((ray, ri) => {
      const pred = predOf(measured[ri]);
      const hits = crossings(ray, inp.chains, limits[ri].pad, limits[ri].fwd);
      const placed = alignRay(hits, pred, pen, locked);
      for (const pl of placed) {
        const h = hits[pl.hit];
        const lock = locked.get(h.chain);
        if (typeof lock === 'number') {
          const vm = vote.get(h.chain) ?? new Map<number, number>();
          vm.set(lock, (vm.get(lock) ?? 0) + NEST_ALIGN.rayStepMm);
          vote.set(h.chain, vm);
          continue;
        }
        if (lock === 'common') {
          add(voteCommon, h.chain, NEST_ALIGN.rayStepMm);
          continue;
        }
        const costs = pred.map((t, s) => Math.abs(h.t - t) + pen(h.chain, s));
        const best = Math.min(...costs);
        const bestAt = costs.indexOf(best);
        // `step`: a 1.5 mm band is wider than a 1 mm grade, so a rival stays only
        // when the gap is also within half the local step. `band` is the plain 1.5 mm.
        const near = costs.flatMap((c, s) => {
          if (c > NEST_ALIGN.gapCost || c > best + NEST_ALIGN.askMargin) return [];
          if (!stepCosts || s === bestAt) return [s];
          const gap = c - best;
          const step = Math.abs(pred[s] - pred[bestAt]);
          return gap <= step / 2 ? [s] : [];
        });
        const onHit = measured[ri].filter(
          (t): t is number => t != null && Math.abs(t - h.t) <= NEST_ALIGN.commonStepMm,
        );
        const spread = onHit.length ? Math.max(...onHit) - Math.min(...onHit) : Infinity;
        const fold = stepCosts
          ? onHit.length >= 3 && spread <= NEST_ALIGN.commonStepMm
          : onHit.length >= 3;
        if (fold) {
          add(voteCommon, h.chain, NEST_ALIGN.rayStepMm);
          continue;
        }
        if (near.length === 2) {
          add(askLen, h.chain, NEST_ALIGN.rayStepMm);
          const set = askRanks.get(h.chain) ?? new Set<number>();
          near.forEach((s) => set.add(sizes[s].rank));
          askRanks.set(h.chain, set);
          continue;
        }
        if (near.length !== 1) continue;
        const vm = vote.get(h.chain) ?? new Map<number, number>();
        vm.set(near[0], (vm.get(near[0]) ?? 0) + NEST_ALIGN.rayStepMm);
        vote.set(h.chain, vm);
      }
    });
    owner.clear();
    const voted = (id: number) => {
      let s = 0;
      for (const v of vote.get(id)?.values() ?? []) s += v;
      return s;
    };
    // With step costs, a few corner rays must not relabel a chain the rest agreed on.
    for (const [id, mm] of voteCommon)
      if (mm >= NEST_ALIGN.askMinMm && (!stepCosts || mm >= voted(id))) owner.set(id, 'common');
    for (const [id, mm] of askLen)
      if (mm >= NEST_ALIGN.askMinMm && (!stepCosts || mm >= voted(id))) owner.set(id, 'ask');
    for (const [id, vm] of vote) {
      if (owner.has(id)) continue;
      const rows = [...vm.entries()].sort((a, b) => b[1] - a[1]);
      if (!rows.length || rows[0][1] < NEST_ALIGN.askMinMm) continue;
      if (rows[1] && rows[1][1] >= NEST_ALIGN.askMinMm && rows[0][1] < rows[1][1] * 1.5) {
        owner.set(id, 'ask');
        continue;
      }
      owner.set(id, rows[0][0]);
    }
    for (const [id, o] of locked) if (!owner.has(id)) owner.set(id, o);
    void askRanks;
  }

  // rebuild the vote once more with the frozen owners, to report lengths
  const vote = new Map<number, Map<number, number>>();
  const voteCommon = new Map<number, number>();
  const askLen = new Map<number, number>();
  const askRanks = new Map<number, Set<number>>();
  const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const rayPoint: { chain: number; p: PtMm; t: number }[][] = sizes.map(() => []);
  rays.forEach((ray, ri) => {
    const pred = predOf(measured[ri]);
    const hits = crossings(ray, inp.chains, limits[ri].pad, limits[ri].fwd);
    for (const h of hits) {
      const o = owner.get(h.chain);
      if (o === 'common') add(voteCommon, h.chain, NEST_ALIGN.rayStepMm);
      else if (o === 'ask') {
        add(askLen, h.chain, NEST_ALIGN.rayStepMm);
        const costs = pred.map((t, s) => Math.abs(h.t - t) + pen(h.chain, s));
        const best = Math.min(...costs);
        const near = costs.flatMap((c, s) => (c <= best + NEST_ALIGN.askMargin ? [s] : []));
        const set = askRanks.get(h.chain) ?? new Set<number>();
        near.forEach((s) => set.add(sizes[s].rank));
        askRanks.set(h.chain, set);
      } else if (typeof o === 'number') {
        const vm = vote.get(h.chain) ?? new Map<number, number>();
        vm.set(o, (vm.get(o) ?? 0) + NEST_ALIGN.rayStepMm);
        vote.set(h.chain, vm);
      }
    }
    sizes.forEach((s, si) => {
      const want = hits.filter((h) => {
        const o = owner.get(h.chain);
        return o === 'common' || o === si;
      });
      let best: Hit | null = null;
      let bd = INF;
      for (const h of want) {
        const d = Math.abs(h.t - pred[si]);
        if (d < bd && d <= NEST_ALIGN.gapCost) {
          bd = d;
          best = h;
        }
      }
      rayPoint[si].push(
        best
          ? { chain: best.chain, p: best.p, t: best.t }
          : {
              chain: -1,
              t: pred[si],
              p: { x: ray.p.x + ray.dir.x * pred[si], y: ray.p.y + ray.dir.y * pred[si] },
            },
      );
    });
  });

  const rings: PtMm[][] = sizes.map((s, si) => {
    if (s.outer && s.outer.length > 2) return s.outer.map((p) => ({ x: p.x, y: p.y }));
    return rayPoint[si].map((q) => q.p);
  });

  const sizeOut: AlignSizeOut[] = sizes.map((s, si) => {
    const ring = rings[si];
    const own = [...owner.entries()]
      .filter(([, o]) => o === si)
      .map(([id]) => byId.get(id)?.pts ?? []);
    const commonPts = [...owner.entries()]
      .filter(([, o]) => o === 'common')
      .map(([id]) => byId.get(id)?.pts ?? []);
    const d = derivedByDistance(ring, own, commonPts, 1);
    const cross = selfCross(ring);
    const next = rings[si + 1];
    const prev = rings[si - 1];
    let nested = true;
    if (next && next.length > 2 && ring.length > 2) nested = nested && nestedIn(ring, next);
    if (prev && prev.length > 2 && ring.length > 2) nested = nested && nestedIn(prev, ring);
    const asksHere = [...askRanks.entries()].filter(([, rs]) => rs.has(s.rank));
    const ok = d.share <= 0.15 && !cross && nested && asksHere.length === 0 && ring.length > 2;
    return {
      rank: s.rank,
      chains: [],
      holesMm: +d.derivedMm.toFixed(1),
      derivedShare: +d.share.toFixed(3),
      redraw: !(s.outer && s.outer.length > 2),
      ring,
      ok,
      cross,
      nested,
    };
  });

  // chains per size: owner is a rank index (si), not a rank number. Store the index.
  for (const [id, o] of owner) {
    if (typeof o !== 'number') continue;
    const mm = vote.get(id)?.get(o) ?? 0;
    sizeOut[o].chains.push({ id, mm: +mm.toFixed(1) });
  }

  const asks: AlignAsk[] = [];
  for (const [id, mm] of askLen) {
    if (mm < NEST_ALIGN.askMinMm || owner.get(id) !== 'ask') continue;
    const c = byId.get(id);
    asks.push({
      chain: id,
      mm: +mm.toFixed(1),
      ranks: [...(askRanks.get(id) ?? [])].sort((a, b) => a - b),
      style: c?.style ?? 0,
      motif: c?.motif ?? null,
    });
  }
  const commonOut = [...voteCommon.entries()]
    .filter(([id, mm]) => owner.get(id) === 'common' && mm >= NEST_ALIGN.askMinMm)
    .map(([id, mm]) => ({ id, mm: +mm.toFixed(1) }));

  const moves: AlignMove[] = [];
  const splits: { id: number; mm: number }[] = [];
  for (const c of inp.chains) {
    const o = owner.get(c.id);
    if (o == null) continue;
    const from = pipeline.get(c.id) ?? 'none';
    const to = o === 'ask' ? 'ask' : o === 'common' ? 'common' : sizes[o].rank;
    const fromRank = typeof from === 'number' ? sizes[from]?.rank ?? from : from;
    if (fromRank === to) continue;
    const mm = chainLen(c);
    if (o === 'ask' && (askLen.get(c.id) ?? 0) > 0) {
      const rows = [...(vote.get(c.id)?.entries() ?? [])].sort((a, b) => b[1] - a[1]);
      if (rows[1] && rows[0][1] < rows[1][1] * 1.5) splits.push({ id: c.id, mm: +mm.toFixed(1) });
    }
    moves.push({
      id: c.id,
      from: typeof fromRank === 'number' ? fromRank : fromRank,
      to,
      mm: +mm.toFixed(1),
      style: c.style,
      motif: c.motif,
    });
  }

  return { etalon, sizes: sizeOut, moves, splits, asks, common: commonOut };
}

/**
 * Э4.5 oracle. The prediction is the closed ring itself: a chain belongs to the
 * smallest closed size that contains as much of it as any size does. No fit, no
 * pen, no second pass. A chain no ring contains (best coverage under half) stays
 * unassigned — it is not this piece.
 */
export function nestAlignOracle(inp: NestAlignIn): NestAlignOut {
  const sizes = inp.sizes;
  const owned: { id: number; mm: number }[][] = sizes.map(() => []);
  for (const c of inp.chains) {
    let best = 0;
    const cov = sizes.map((s) => {
      const v = s.outer && s.outer.length > 2 ? coverFrac(c.pts, s.outer) : 0;
      if (v > best) best = v;
      return v;
    });
    if (best < 0.5) continue;
    const pick = cov.findIndex((v) => v >= best - 1e-9);
    owned[pick].push({ id: c.id, mm: +chainLen(c).toFixed(1) });
  }
  return {
    etalon: inp.etalon ?? null,
    sizes: sizes.map((s, i) => ({
      rank: s.rank,
      chains: owned[i],
      holesMm: 0,
      derivedShare: 0,
      redraw: false,
      ring: s.outer ? s.outer.map((p) => ({ x: p.x, y: p.y })) : [],
      ok: false,
      cross: false,
      nested: true,
    })),
    moves: [],
    splits: [],
    asks: [],
    common: [],
  };
}
