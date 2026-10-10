// pieces/grade (H1) — per seed: which way does each component's rank grow?
//
// The only unknown left after the model is one bit per component. For a seed, the components
// whose tracks sit in its region are enumerated (≤ maxFree bits); each combination is filled per
// rank (walls = the portions carrying r, raster `cellMm`), and scored by closure, strict area
// growth and the regularity of the area steps. Two DISTINCT best combinations within 0.5 points,
// both closed and monotone → ambiguous (the operator / the judge decides, never the code).
// "Distinct" = different REGIONS, over EVERY combination searched: two layouts are one when every
// rank's region differs by less than a quarter of a grade step (pixels that differ, not areas) —
// two layouts with equal areas but other outlines are two answers, not one.
import type { BoxMm, PtMm, Seed } from 'lib/pattern-import/types';

import { drawPolyline, exterior, flood, Grid, regionOf } from '../raster';

import { compOfTrack, trackPortions, type GradeModel } from './model';
import { arcLengths, bboxOfPts, boxOverlap, dist, growBox, subPolyline, type V } from './vec';

export type Combo = {
  bits: number[];
  closed: number;
  /** area per rank, mm² (−1 = leak) */
  areas: number[];
  monotone: boolean;
  cv: number;
  score: number;
  /** nesting excess (see nestExcess); 0 when not measured */
  nest?: number;
  /** per rank: hash of the region mask (0 = leak) — two combos are the same layout iff all equal */
  hashes: number[];
};

/** FNV-1a over the indices of a mask's set pixels (with the grid size): region identity. */
export function maskHash(mask: Uint8Array, W: number): number {
  let h = 0x811c9dc5 ^ W;
  for (let j = 0; j < mask.length; j++)
    if (mask[j]) {
      h ^= j;
      h = Math.imul(h, 0x01000193);
    }
  return h >>> 0 || 1;
}

export const sameLayout = (a: { hashes: number[] }, b: { hashes: number[] }) =>
  a.hashes.length === b.hashes.length && a.hashes.every((x, i) => x === b.hashes[i]);

export type SeedSolve = {
  seed: Seed;
  box: BoxMm;
  inBox: Set<number>;
  comps: number[];
  free: number[];
  compLen: Map<number, number>;
  top: Combo[];
  /** every combination, indexed by the mask over `free` */
  all: Combo[];
  ambiguous: boolean;
  reason: string;
};

export type PortionPts = { track: number; ranks: number[]; pts: V[] };

const ptsCache = new WeakMap<GradeModel, Map<number, number[]>>();
function accOf(M: GradeModel, tr: number) {
  let m = ptsCache.get(M);
  if (!m) {
    m = new Map();
    ptsCache.set(M, m);
  }
  let a = m.get(tr);
  if (!a) {
    a = arcLengths(M.tracks[tr].pts);
    m.set(tr, a);
  }
  return a;
}

export function portionPts(
  M: GradeModel,
  bits: readonly number[],
  only?: Set<number>,
  flipSub = -1,
): PortionPts[] {
  const out: PortionPts[] = [];
  for (const p of trackPortions(M, bits, only, flipSub)) {
    const pts = subPolyline(M.tracks[p.track].pts, accOf(M, p.track), p.from, p.to);
    if (pts.length >= 2) out.push({ track: p.track, ranks: p.ranks, pts });
  }
  return out;
}

export type FillRes = {
  closed: boolean;
  /** region area (walls included), mm²; −1 = leak */
  area: number;
  /** after the variant knives: the seed's side, mm² (= area when no knife crosses) */
  cutArea: number;
  /** a knife crosses the region but does not separate it (the cut is not drawn for this rank) */
  knifeIncomplete: boolean;
  /** maskHash of the region before the knives (0 = leak) */
  hash: number;
};

const LEAK: FillRes = { closed: false, area: -1, cutArea: -1, knifeIncomplete: false, hash: 0 };

/** Fill rank r of a seed inside box with the given wall portions (and the variant's knives). */
export function fillRank(
  box: BoxMm,
  cellMm: number,
  ps: readonly PortionPts[],
  r: number,
  seed: PtMm,
  knives: readonly PtMm[][] = [],
  carriers: readonly PtMm[][] = [],
): FillRes {
  const g = new Grid(box, cellMm);
  const wall = new Uint8Array(g.W * g.H);
  for (const p of ps) if (p.ranks.includes(r)) drawPolyline(g, wall, p.pts);
  const k0 = g.iy(seed.y) * g.W + g.ix(seed.x);
  if (wall[k0]) return LEAK;
  const ext = exterior(g, wall);
  if (ext[k0]) return LEAK;
  const { mask, area } = regionOf(g, ext, k0);
  const a = area * g.cell * g.cell;
  const hash = maskHash(mask, g.W);
  if (!knives.length) return { closed: true, area: a, cutArea: a, knifeIncomplete: false, hash };
  const cutBy = (lines: readonly PtMm[][]) => {
    const kn = new Uint8Array(mask.length);
    for (const k of lines) drawPolyline(g, kn, k);
    let hit = 0;
    for (let j = 0; j < mask.length; j++) if (mask[j] && kn[j]) hit++;
    if (!hit) return { hit, count: area, cuts: false, onSeed: false };
    if (kn[k0]) return { hit, count: area, cuts: false, onSeed: true };
    const blocked = new Uint8Array(mask.length);
    for (let j = 0; j < mask.length; j++) blocked[j] = mask[j] && !kn[j] ? 0 : 1;
    const cut = new Uint8Array(mask.length);
    const c = flood(g, blocked, [k0], cut);
    // the flood went round the knife's end: nothing was cut off
    return { hit, count: c, cuts: c < area - hit - 4, onSeed: false };
  };
  const k1 = cutBy(knives);
  let incomplete = k1.onSeed || (k1.hit > 0 && !k1.cuts);
  if (!incomplete && carriers.length) {
    // the knife's whole cutting line (its collinear pieces, cut apart at crossings) would cut
    // this region where the knife alone does not: F4's contour will miss the cut
    const k2 = cutBy([...knives, ...carriers]);
    if (k2.onSeed || (k2.cuts && (!k1.cuts || Math.abs(k2.count - k1.count) > 0.002 * area)))
      incomplete = true;
  }
  return {
    closed: true,
    area: a,
    cutArea: k1.cuts ? k1.count * g.cell * g.cell : a,
    knifeIncomplete: incomplete,
    hash,
  };
}

/** Rank regions (masks) of one combination. */
export function rankMasks(
  box: BoxMm,
  cellMm: number,
  ps: readonly PortionPts[],
  n: number,
  seed: PtMm,
  memo?: Map<string, { area: number; hash: number }>,
  tick?: () => void,
  keepMasks = true,
) {
  const g = new Grid(box, cellMm);
  const k0 = g.iy(seed.y) * g.W + g.ix(seed.x);
  const masks: (Uint8Array | null)[] = [];
  const areas: number[] = [];
  const hashes: number[] = [];
  for (let r = 0; r < n; r++) {
    tick?.();
    // the same walls give the same region: a combination that does not touch rank r's walls
    // reuses the region another one already filled
    const mine = ps.filter((p) => p.ranks.includes(r));
    const key = memo
      ? mine
          .map((p) => {
            const e = p.pts[p.pts.length - 1];
            return `${p.track}:${p.pts.length}:${p.pts[0].x.toFixed(2)},${p.pts[0].y.toFixed(2)}:${e.x.toFixed(2)},${e.y.toFixed(2)}`;
          })
          .join('|')
      : '';
    const hit = memo?.get(key);
    if (hit) {
      masks.push(null);
      areas.push(hit.area);
      hashes.push(hit.hash);
      continue;
    }
    const wall = new Uint8Array(g.W * g.H);
    for (const p of mine) drawPolyline(g, wall, p.pts);
    const ext = exterior(g, wall);
    if (wall[k0] || ext[k0]) {
      masks.push(null);
      areas.push(-1);
      hashes.push(0);
      memo?.set(key, { area: -1, hash: 0 });
      continue;
    }
    const { mask, area } = regionOf(g, ext, k0);
    const h = maskHash(mask, g.W);
    masks.push(keepMasks ? mask : null);
    areas.push(area * g.cell * g.cell);
    hashes.push(h);
    memo?.set(key, { area: area * g.cell * g.cell, hash: h });
  }
  return { masks, areas, hashes };
}

/**
 * Nesting: a size's region lies inside the next size's, except for slivers where their lines
 * cross. excess = Σ |R_r ∖ R_r+1| over Σ |R_r+1 ∖ R_r| (consecutive closed ranks); a component
 * whose rank direction is flipped puts a whole edge of the small size outside the big one.
 */
export function nestPairs(
  masks: readonly (Uint8Array | null)[],
): { r: number; excess: number; growth: number }[] {
  const out: { r: number; excess: number; growth: number }[] = [];
  let prev: Uint8Array | null = null;
  let pr = -1;
  masks.forEach((m, r) => {
    if (!m) return;
    if (prev) {
      let excess = 0;
      let growth = 0;
      for (let j = 0; j < m.length; j++) {
        if (prev[j] && !m[j]) excess++;
        else if (m[j] && !prev[j]) growth++;
      }
      out.push({ r: pr, excess, growth });
    }
    prev = m;
    pr = r;
  });
  return out;
}

export function nestExcess(masks: readonly (Uint8Array | null)[]): number {
  let excess = 0;
  let growth = 0;
  let prev: Uint8Array | null = null;
  for (const m of masks) {
    if (!m) continue;
    if (prev) {
      for (let j = 0; j < m.length; j++) {
        if (prev[j] && !m[j]) excess++;
        else if (m[j] && !prev[j]) growth++;
      }
    }
    prev = m;
  }
  return growth ? excess / growth : excess ? 9 : 0;
}

function evalCombo(
  M: GradeModel,
  bits: number[],
  box: BoxMm,
  seed: PtMm,
  inBox: Set<number>,
  cellMm: number,
  memo: Map<string, { area: number; hash: number }>,
  tick?: () => void,
): Combo {
  const n = M.n;
  const ps = portionPts(M, bits, inBox);
  const { areas, hashes } = rankMasks(box, cellMm, ps, n, seed, memo, tick, false);
  return scoreAreas(bits, areas, n, hashes);
}

/** Score penalty per unit of nesting excess (see nestExcess). */
export const NEST_WEIGHT = 0;

export function scoreAreas(
  bits: number[],
  areas: number[],
  n: number,
  hashes: number[] = [],
): Combo {
  let closed = 0;
  for (const a of areas) if (a >= 0) closed++;
  let monotone = closed === n;
  const steps: number[] = [];
  for (let r = 1; r < n; r++) {
    if (areas[r] < 0 || areas[r - 1] < 0) continue;
    if (areas[r] <= areas[r - 1] * 1.0005) monotone = false;
    steps.push(areas[r] - areas[r - 1]);
  }
  const m = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
  const cv =
    steps.length > 1 && m > 0
      ? Math.sqrt(steps.reduce((a, s) => a + (s - m) ** 2, 0) / steps.length) / m
      : 9;
  const up = steps.filter((s) => s > 0).length;
  const down = steps.filter((s) => s < 0).length;
  const score = closed * 10 + (monotone ? 5 : 0) + 2 * (up - down) - Math.min(cv, 3);
  return { bits, closed, areas, monotone, cv, score, hashes };
}

/** Tracks whose bbox meets the box, and the components they carry. */
export function tracksIn(M: GradeModel, box: BoxMm) {
  const inBox = new Set<number>();
  const comps = new Set<number>();
  const compLen = new Map<number, number>();
  for (const t of M.tracks) {
    if (M.frames.has(t.id)) continue;
    if (!boxOverlap(bboxOfPts(t.pts), box)) continue;
    inBox.add(t.id);
    const c = compOfTrack(M, t.id);
    if (c >= 0) {
      comps.add(c);
      compLen.set(c, (compLen.get(c) ?? 0) + t.lengthMm);
    }
  }
  return { inBox, comps, compLen };
}

/** Small closed loops (label ovals / boxes) holding a seed are never walls. */
export function markFrames(M: GradeModel, seeds: readonly Seed[]) {
  for (const t of M.tracks) {
    if (t.lengthMm > 250 || dist(t.pts[0], t.pts[t.pts.length - 1]) > 1.5) continue;
    const bb = bboxOfPts(t.pts);
    if (bb.maxX - bb.minX > 90 || bb.maxY - bb.minY > 90) continue;
    if (
      seeds.some(
        (sd) =>
          sd.at.x >= bb.minX && sd.at.x <= bb.maxX && sd.at.y >= bb.minY && sd.at.y <= bb.maxY,
      )
    )
      M.frames.add(t.id);
  }
}

/** Second frame pass (prototype): all walls → a region under 100 cm² around the seed = a label box. */
function dropFramesAround(
  M: GradeModel,
  seed: Seed,
  box: BoxMm,
  inBox: Set<number>,
  cellMm: number,
) {
  for (let pass = 0; pass < 2; pass++) {
    const g = new Grid(box, cellMm);
    const wall = new Uint8Array(g.W * g.H);
    for (const p of portionPts(M, new Array(M.nComps).fill(0), inBox)) drawPolyline(g, wall, p.pts);
    const ext = exterior(g, wall);
    const k0 = g.iy(seed.at.y) * g.W + g.ix(seed.at.x);
    if (ext[k0] || wall[k0]) break;
    const { area } = regionOf(g, ext, k0);
    if (area * g.cell * g.cell > 10000) break;
    let dropped = 0;
    for (const id of [...inBox]) {
      const t = M.tracks[id];
      if (t.lengthMm > 250) continue;
      const bb = bboxOfPts(t.pts);
      if (bb.maxX - bb.minX > 90 || bb.maxY - bb.minY > 90) continue;
      if (seed.at.x < bb.minX || seed.at.x > bb.maxX || seed.at.y < bb.minY || seed.at.y > bb.maxY)
        continue;
      inBox.delete(id);
      M.frames.add(id);
      dropped++;
    }
    if (!dropped) break;
  }
}

export type ChooseOpts = {
  cellMm: number;
  maxFree: number;
  /** called inside the combination loop (cancellation / progress) */
  tick?: () => void;
};

export function solveSeed(M: GradeModel, seed: Seed, box: BoxMm, o: ChooseOpts): SeedSolve {
  const { inBox, comps, compLen } = tracksIn(M, box);
  dropFramesAround(M, seed, box, inBox, o.cellMm);
  const compList = [...comps].sort((a, b) => (compLen.get(b) ?? 0) - (compLen.get(a) ?? 0));
  // every component is searched up to maxFree; the rest stay at bit 0 here and gradeOnce refuses
  // the seed when flipping one of them moves a trusted rank (it was never searched)
  const free = compList.slice(0, o.maxFree);
  const combos: Combo[] = [];
  const memo = new Map<string, { area: number; hash: number }>();
  for (let m = 0; m < 1 << free.length; m++) {
    o.tick?.();
    const bits = new Array(M.nComps).fill(0);
    free.forEach((c, i) => (bits[c] = (m >> i) & 1));
    combos.push(evalCombo(M, bits, box, seed.at, inBox, o.cellMm, memo, o.tick));
  }
  const all = combos.slice();
  const masksOf = new Map<Combo, (Uint8Array | null)[]>();
  const regions = (c: Combo) => {
    let m = masksOf.get(c);
    if (!m) {
      o.tick?.();
      m = rankMasks(box, o.cellMm, portionPts(M, c.bits, inBox), M.n, seed.at).masks;
      masksOf.set(c, m);
    }
    return m;
  };
  const tol = (c: Combo) => layoutTol(c.areas, o.cellMm);
  const { top, ambiguous, reason } = pickLayout(
    combos,
    M.n,
    (a, b) => sameLayout(a, b) || sameRegions(regions(a), regions(b), tol(a)),
  );
  return { seed, box, inBox, comps: compList, free, compLen, top, all, ambiguous, reason };
}

/**
 * The best layout of a seed and whether a RIVAL fits as well: distinct = another region for some
 * rank (mask hash), over every combination; a rival is closed in every rank, monotone, and within
 * 0.5 points of the best. Equal areas with different outlines are two answers.
 */
export function pickLayout(
  combos: readonly Combo[],
  n: number,
  same: (a: Combo, b: Combo) => boolean = sameLayout,
): { top: Combo[]; ambiguous: boolean; reason: string } {
  const sorted = [...combos].sort((a, b) => b.score - a.score);
  // identical hashes are one layout for sure; region comparison (costly) only for the contenders
  const byHash: Combo[] = [];
  for (const c of sorted) if (!byHash.some((d) => sameLayout(c, d))) byHash.push(c);
  const best = byHash[0];
  const contenders = best
    ? byHash.filter(
        (c) => c === best || (c.closed === n && c.monotone && c.score >= best.score - 0.5),
      )
    : [];
  const distinct: Combo[] = [];
  for (const c of contenders) if (!distinct.some((d) => same(c, d))) distinct.push(c);
  const top = [...distinct, ...byHash.filter((c) => !contenders.includes(c))].slice(0, 4);
  let ambiguous = false;
  let reason = '';
  if (!best) reason = 'no combos';
  else if (best.closed < n) reason = `only ${best.closed}/${n} closed`;
  else if (!best.monotone) reason = 'not monotone';
  const rival = best
    ? distinct.find(
        (c) => c !== best && c.closed === n && c.monotone && c.score >= best.score - 0.5,
      )
    : undefined;
  if (best && rival) {
    ambiguous = true;
    reason = `two layouts fit (${best.score.toFixed(2)} vs ${rival.score.toFixed(2)})`;
  }
  return { top, ambiguous, reason };
}

/** Pixels that differ between two regions (null = leak: any region differs completely). */
export function maskDiff(a: Uint8Array | null, b: Uint8Array | null): number {
  if (!a || !b) return a === b ? 0 : Infinity;
  let d = 0;
  for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) d++;
  return d;
}

/** Per rank, the pixels two layouts may differ by and still be one: a quarter of a grade step. */
export function layoutTol(areas: readonly number[], cellMm: number): number {
  const fa = areas.filter((a) => a >= 0);
  const steps = fa
    .slice(1)
    .map((a, k) => a - fa[k])
    .filter((d) => d > 0)
    .sort((x, y) => x - y);
  const step = steps.length ? steps[steps.length >> 1] : 0;
  const big = fa.length ? Math.max(...fa) : 0;
  return Math.max(0.25 * step, 0.001 * big) / (cellMm * cellMm);
}

export function sameRegions(
  a: readonly (Uint8Array | null)[],
  b: readonly (Uint8Array | null)[],
  tolPx: number,
): boolean {
  return a.length === b.length && a.every((m, r) => maskDiff(m, b[r]) <= tolPx);
}

export { growBox, flood };

/** Score of a seed's family under global bits (its precomputed combination over its free comps). */
export function scoreUnder(S: SeedSolve, bits: readonly number[]): Combo {
  let m = 0;
  S.free.forEach((c, i) => {
    if (bits[c]) m |= 1 << i;
  });
  return S.all[m];
}
