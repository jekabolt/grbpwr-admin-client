// pieces/grade (H1, HARD-SIZES) — size ranks for sheets where EVERY size is drawn with the same
// line, without labels, and the lines cross. "Understand one contour and the logic of the
// increment": ranks come from nesting order inside full cross-sections, missing ranks are
// predicted by the grade step and only ever snap onto DRAWN lines, a line that ends on another
// continues along it, and the one free bit per component (does the rank grow outward or inward)
// is chosen by closure + strict area growth. Nothing here draws geometry: a rank that does not
// close, a piece whose two best layouts both work, a size count the drawing disagrees with — all
// go to the operator (leak / ambiguity), never into the card as a plausible contour.
import type {
  BoxMm,
  ChainAmbiguity,
  ChainId,
  ChainSet,
  Mm,
  PieceCandidate,
  PtMm,
  Seed,
  SeedId,
  Sheet,
} from 'lib/pattern-import/types';

import { Grid, drawPolyline, exterior, maskBox, regionOf } from '../raster';

import {
  fillRank,
  layoutTol,
  maskDiff,
  rankMasks,
  sameRegions,
  markFrames,
  portionPts,
  scoreUnder,
  solveSeed,
  type Combo,
  type PortionPts,
  type SeedSolve,
} from './choose';
import { buildModel, compOfTrack, trackPortions, type GradeModel, type ModelOpts } from './model';
import { chainSpans } from './tracks';
import { bboxOfPts, growBox, median, unionBox } from './vec';

import { notEvidence } from './guard';

export { detectUnencodedGrading, type GuardOpts } from './guard';

/** Module-level switches (probes flip them to measure each guard; production keeps the defaults). */
export const GRADE_TUNING = { twoReadings: true, maxFree: 8 };

export type GradeRefusal = NonNullable<PieceCandidate['gradeRefusal']>;

export type RankPortion = {
  chain: ChainId;
  fromMm: Mm;
  toMm: Mm;
  /** ranks this stretch is a wall of; ranks.length === n = shared by every size */
  ranks: number[];
  component: number | null;
  pts: PtMm[];
};

export type GradeAlternative = {
  bits: number[];
  closed: number;
  monotone: boolean;
  stepCv: number;
  score: number;
  areasMm2: number[];
  nest?: number;
};

export type GradeSeedResult = {
  seed: SeedId;
  components: number[];
  chosen: GradeAlternative | null;
  alternatives: GradeAlternative[];
  ambiguous: boolean;
  /** the ranks are trusted for this seed (else: refusal) */
  accepted: boolean;
  refusal: GradeRefusal | null;
  /** solver raster area per rank under the global bits (−1 = leak), mm² */
  areasMm2: number[];
  /** the same after the variant's knives (what F4's contour must match) */
  finalAreasMm2: number[];
  /** per rank: trusted (closed, family consistent, knife complete) */
  rankOk: boolean[];
  box: BoxMm;
  reason: string;
};

export type GradeResult = {
  n: number;
  portions: RankPortion[];
  components: number;
  bits: number[];
  seeds: GradeSeedResult[];
  ambiguities: ChainAmbiguity[];
  diag: {
    step0: Mm;
    reach: Mm;
    tracks: number;
    fullTuples: number;
    parityConflicts: number;
    laneConflicts: number;
    bandMode: number;
    ms: number;
  };
  /** the rank model (opts.keepModel only) */
  model?: GradeModel;
  /**
   * Knife chains that are SIZE lines here (in a ranked component): a cutting line drawn once per
   * size is that size's outline, not a knife for every size — F4 must not cut with them either.
   */
  gradedKnives: ChainId[];
};

export type GradeOpts = {
  cellMm: Mm;
  /** fixed region per seed (probe / tests); default: grown from the seed's cell */
  region?: (seed: Seed) => BoxMm | null;
  /** max components enumerated per seed (2^maxFree combinations) */
  maxFree?: number;
  log?: (s: string) => void;
  /** keep the rank model on the result (probes) */
  keepModel?: boolean;
  /** the variant's cutting lines (F4 knives): the final region is cut along them */
  knives?: PtMm[][];
  /** chain id of each knife (same order) */
  knifeIds?: ChainId[];
  /** the rest of each knife's cutting line (collinear pieces F4 does not cut with) */
  knifeCarriers?: PtMm[][];
  /** trust a rank only where a second, perturbed reading agrees (default GRADE_TUNING) */
  twoReadings?: boolean;
  /**
   * Chains that are never size evidence nor walls (default: the legend's ignore / notch / seam /
   * grain / internal classes; the hook adds the operator's "ignore line").
   */
  exclude?: readonly ChainId[];
  /** called inside every long loop (combinations, ranks, the second reading): may throw to cancel */
  tick?: () => void;
};

/** Raster cells one seed's region may cover (box / cell²); larger → refused, never half-checked. */
export const MAX_REGION_CELLS = 12_000_000;

/**
 * A graded family is trusted when its closed ranks (≥ 2, and at most two missing) grow strictly
 * and evenly: every per-rank area step within ±35 % of the median step. A flipped component or a
 * foreign line closing a rank breaks exactly this.
 */
export function familyCheck(areas: readonly number[]): { ok: boolean; why: string; leaks: number[] } {
  const n = areas.length;
  const closed = areas.map((a, r) => (a >= 0 ? r : -1)).filter((r) => r >= 0);
  const leaks = areas.map((a, r) => (a < 0 ? r : -1)).filter((r) => r >= 0);
  if (closed.length < Math.max(2, n - 2)) return { ok: false, why: `only ${closed.length}/${n} ranks close`, leaks };
  const steps: number[] = [];
  for (let k = 1; k < closed.length; k++) {
    const a = closed[k - 1];
    const b = closed[k];
    const d = (areas[b] - areas[a]) / (b - a);
    if (d <= areas[a] * 0.0005) return { ok: false, why: `area does not grow from rank ${a} to ${b}`, leaks };
    steps.push(d);
  }
  const med = median(steps);
  for (const d of steps)
    if (Math.abs(d - med) > 0.35 * med) return { ok: false, why: `uneven area steps (${steps.map((x) => (x / 100).toFixed(1)).join('/')} cm²)`, leaks };
  return { ok: true, why: '', leaks };
}

const alt = (c: Combo): GradeAlternative => ({
  bits: c.bits,
  closed: c.closed,
  monotone: c.monotone,
  stepCv: c.cv,
  score: c.score,
  areasMm2: c.areas,
  nest: c.nest,
});

/**
 * The seed's envelope: every drawn line a wall, the region holding the seed (internal lines do not
 * split it) = the union of every size of the piece (and of pieces drawn over it). The box grows
 * until the envelope no longer touches it; null when even the whole sheet leaves the seed open.
 */
function envelopeBox(M: GradeModel, seed: Seed, cellMm: number, sheetBox: BoxMm): BoxMm | null {
  const full = growBox(sheetBox, 5);
  for (let R = 200; ; R *= 2) {
    const box = {
      minX: Math.max(full.minX, seed.at.x - R),
      minY: Math.max(full.minY, seed.at.y - R),
      maxX: Math.min(full.maxX, seed.at.x + R),
      maxY: Math.min(full.maxY, seed.at.y + R),
    };
    const whole = box.minX <= full.minX && box.minY <= full.minY && box.maxX >= full.maxX && box.maxY >= full.maxY;
    const g = new Grid(box, Math.max(cellMm, 1));
    const wall = new Uint8Array(g.W * g.H);
    for (const t of M.tracks) if (!M.frames.has(t.id)) drawPolyline(g, wall, t.pts);
    const k0 = g.iy(seed.at.y) * g.W + g.ix(seed.at.x);
    if (wall[k0]) return null;
    const ext = exterior(g, wall);
    if (ext[k0]) {
      if (whole) return null;
      continue;
    }
    const { mask } = regionOf(g, ext, k0);
    const mb = maskBox(g, mask);
    const touches = mb.x0 <= 2 || mb.y0 <= 2 || mb.x1 >= g.W - 3 || mb.y1 >= g.H - 3;
    if (touches && !whole) continue;
    const a = g.centre(mb.x0, mb.y0);
    const b = g.centre(mb.x1, mb.y1);
    return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  }
}

function floodFree(g: Grid, blocked: Uint8Array, k0: number, out: Uint8Array) {
  const q = new Int32Array(blocked.length);
  let h = 0;
  let t = 0;
  q[t++] = k0;
  out[k0] = 1;
  const W = g.W;
  while (h < t) {
    const c = q[h++];
    const y = (c / W) | 0;
    const x = c - y * W;
    const nb = [x > 0 ? c - 1 : -1, x + 1 < W ? c + 1 : -1, y > 0 ? c - W : -1, y + 1 < g.H ? c + W : -1];
    for (const j of nb) {
      if (j < 0 || out[j] || blocked[j]) continue;
      out[j] = 1;
      q[t++] = j;
    }
  }
}

/** Region (bbox) of rank r under the given bits. */
function rankRegionBox(box: BoxMm, cellMm: number, ps: readonly PortionPts[], r: number, at: PtMm): BoxMm | null {
  const g = new Grid(box, cellMm);
  const wall = new Uint8Array(g.W * g.H);
  for (const p of ps) if (p.ranks.includes(r)) drawPolyline(g, wall, p.pts);
  const k0 = g.iy(at.y) * g.W + g.ix(at.x);
  if (wall[k0]) return null;
  const ext = exterior(g, wall);
  if (ext[k0]) return null;
  const { mask } = regionOf(g, ext, k0);
  const mb = maskBox(g, mask);
  const a = g.centre(mb.x0, mb.y0);
  const b = g.centre(mb.x1, mb.y1);
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

const inside = (a: BoxMm, b: BoxMm, tol = 1) =>
  a.minX >= b.minX - tol && a.minY >= b.minY - tol && a.maxX <= b.maxX + tol && a.maxY <= b.maxY + tol;

/** Seed region = its envelope + a margin; solved once there. */
function growSolve(
  M: GradeModel,
  seed: Seed,
  o: { cellMm: number; maxFree: number; tick?: () => void },
  sheetBox: BoxMm,
): SeedSolve | 'too-large' | null {
  const env = envelopeBox(M, seed, o.cellMm, sheetBox);
  if (!env) return null;
  const box = growBox(env, 8 + 2 * M.step0);
  if (((box.maxX - box.minX) * (box.maxY - box.minY)) / (o.cellMm * o.cellMm) > MAX_REGION_CELLS) return 'too-large';
  return solveSeed(M, seed, box, o);
}

/** The reading the walls come from. */
export const BASE_READING: ModelOpts = { pitchMm: 4, laneAngleDeg: 30 };
/**
 * A second, perturbed reading (other sample phase, looser junctions, tighter lane runs). Every
 * fragile decision — which stub continues which line at a sub-mm junction, which lanes form a
 * cross-section — can fall differently; a rank is trusted only where both readings agree.
 */
export const ALT_READING: ModelOpts = {
  pitchMm: 4,
  phase: 0.15,
  laneAngleDeg: 24,
  splitRatio: 2.1,
  track: { gapMm: 2.5, angleDeg: 18, lateralMm: 0.4, junctionMm: 0.3, junctionAngleDeg: 16, junctionMarginDeg: 2 },
};
/** A component built from fewer full cross-sections than this has an unproven orientation. */
export const WEAK_SUPPORT = 60;
/** Two readings agree on a rank when their regions differ by less than this × the grade step. */
export const READING_AGREE = 0.25;

export function gradeRanks(
  sheet: Sheet,
  set: ChainSet,
  seeds: Seed[],
  n: number,
  opts: GradeOpts,
  progress?: (done: number, total: number, note?: string) => void,
): GradeResult {
  const t0 = Date.now();
  const base = gradeOnce(sheet, set, seeds, n, opts, BASE_READING, progress);
  if (!(opts.twoReadings ?? GRADE_TUNING.twoReadings) || base.diag.bandMode !== n) return base;
  // the second reading only re-checks what the first accepted (a refused seed stays refused)
  const live = new Set(base.seeds.filter((s) => s.accepted && s.rankOk.some(Boolean)).map((s) => s.seed));
  if (!live.size) return base;
  const alt = gradeOnce(sheet, set, seeds.filter((s) => live.has(s.id)), n, { ...opts, keepModel: false }, ALT_READING);
  const other = new Map(alt.seeds.map((x) => [x.seed, x]));
  for (const s of base.seeds) {
    if (!s.accepted) continue;
    const a = other.get(s.seed);
    const fa = s.finalAreasMm2.filter((x) => x >= 0);
    const steps = fa.slice(1).map((x, k) => x - fa[k]).filter((d) => d > 0);
    const step = steps.length ? median(steps) : 0;
    let lost = 0;
    s.rankOk = s.rankOk.map((ok, r) => {
      if (!ok) return false;
      const agree = !!a && a.rankOk[r] && step > 0 && Math.abs(a.finalAreasMm2[r] - s.finalAreasMm2[r]) <= READING_AGREE * step;
      if (!agree) lost++;
      return agree;
    });
    if (lost) s.reason += `${s.reason ? '; ' : ''}a second reading disagrees on ${lost} rank(s)`;
  }
  base.diag.ms = Date.now() - t0;
  return base;
}

function gradeOnce(
  sheet: Sheet,
  set: ChainSet,
  seeds: Seed[],
  n: number,
  opts: GradeOpts,
  reading: ModelOpts,
  progress?: (done: number, total: number, note?: string) => void,
): GradeResult {
  const t0 = Date.now();
  const log = opts.log ?? (() => {});
  const skip = new Set(opts.exclude ?? notEvidence(set.classes));
  const use = set.chains.filter((c) => !skip.has(c.id) && c.pts.length >= 2).map((c) => c.id);
  const M = buildModel(sheet, set, use, n, { ...reading, log });
  markFrames(M, seeds);
  let bandMode = 0;
  let bw = -1;
  for (const [k, v] of M.bandHist)
    if (v > bw) {
      bw = v;
      bandMode = k;
    }
  const diag = () => ({
    step0: M.step0,
    reach: M.reach,
    tracks: M.tracks.length,
    fullTuples: M.fullTuples,
    parityConflicts: M.parityConflicts,
    laneConflicts: M.laneConflicts,
    bandMode,
    ms: Date.now() - t0,
  });
  // the size count must be what the drawing shows side by side most often (§5.6): otherwise no
  // cross-section is full, ranks mean nothing — ask, never guess
  if (bandMode !== n) {
    const message = `the drawing shows ${bandMode} lines side by side, the size run says ${n}`;
    return {
      n,
      portions: [],
      components: M.nComps,
      bits: new Array(M.nComps).fill(0),
      seeds: seeds.map((sd) => ({
        seed: sd.id,
        components: [],
        chosen: null,
        alternatives: [],
        ambiguous: false,
        accepted: false,
        refusal: 'size-count' as const,
        areasMm2: new Array(n).fill(-1),
        finalAreasMm2: new Array(n).fill(-1),
        rankOk: new Array(n).fill(false),
        box: { minX: sd.at.x, minY: sd.at.y, maxX: sd.at.x, maxY: sd.at.y },
        reason: message,
      })),
      ambiguities: [{ kind: 'size-count', message, classes: [], chains: [], at: null }],
      diag: diag(),
      ...(opts.keepModel ? { model: M } : {}),
      gradedKnives: [],
    };
  }
  const o = { cellMm: opts.cellMm, maxFree: opts.maxFree ?? GRADE_TUNING.maxFree, tick: opts.tick };
  const solves: (SeedSolve | null)[] = [];
  const tooLarge = new Set<number>();
  seeds.forEach((sd, i) => {
    progress?.(i, seeds.length, `grade ${i + 1}/${seeds.length}`);
    const fixed = opts.region?.(sd) ?? null;
    const S = fixed ? solveSeed(M, sd, fixed, o) : growSolve(M, sd, o, sheet.bbox);
    if (S === 'too-large') tooLarge.add(i);
    solves.push(S === 'too-large' ? null : S);
  });
  // one bit per component: the seed holding most of its length decides
  const bits = new Array(M.nComps).fill(0);
  for (let c = 0; c < M.nComps; c++) {
    let owner: SeedSolve | null = null;
    let ownerLen = 0;
    for (const s of solves) {
      if (!s || !s.free.includes(c)) continue;
      const L = s.compLen.get(c) ?? 0;
      if (L > ownerLen) {
        ownerLen = L;
        owner = s;
      }
    }
    if (owner?.top[0]) bits[c] = owner.top[0].bits[c];
  }
  // then the bits that serve every seed together best (coordinate ascent on the summed score)
  const live = solves.filter((s): s is SeedSolve => !!s && s.all.length > 0);
  const total = () => live.reduce((a, s) => a + scoreUnder(s, bits).score, 0);
  let cur = total();
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let c = 0; c < M.nComps; c++) {
      if (!live.some((s) => s.free.includes(c))) continue;
      bits[c] ^= 1;
      const t = total();
      if (t > cur + 1e-6) {
        cur = t;
        moved = true;
      } else bits[c] ^= 1;
    }
    if (!moved) break;
  }
  const results: GradeSeedResult[] = [];
  const ambiguities: ChainAmbiguity[] = [];
  const knifeIds = opts.knifeIds ?? [];
  const gradedKnife = new Set<ChainId>();
  if (knifeIds.length) {
    const ranked = new Set<ChainId>();
    for (const t of M.tracks)
      if (compOfTrack(M, t.id) >= 0) for (const it of t.items) ranked.add(M.els[it.el].chain);
    for (const id of knifeIds) if (ranked.has(id)) gradedKnife.add(id);
  }
  const knives = (opts.knives ?? []).filter((_, i) => !gradedKnife.has(knifeIds[i]));
  const carriers = opts.knifeCarriers ?? [];
  seeds.forEach((sd, i) => {
    const S = solves[i];
    const none = new Array(n).fill(-1);
    if (!S || !S.top.length) {
      results.push({
        seed: sd.id,
        components: [],
        chosen: null,
        alternatives: [],
        ambiguous: false,
        accepted: false,
        refusal: 'sizes-not-distinguished',
        areasMm2: none,
        finalAreasMm2: none,
        rankOk: new Array(n).fill(false),
        box: { minX: sd.at.x, minY: sd.at.y, maxX: sd.at.x, maxY: sd.at.y },
        reason: tooLarge.has(i) ? 'the region around the seed is too large to check' : 'no region around the seed',
      });
      return;
    }
    // the seed's family under the GLOBAL bits (a component shared with another piece may have been
    // decided there): it must be what this seed would choose itself
    const ps = portionPts(M, bits, S.inBox);
    const fills = Array.from({ length: n }, (_, r) => {
      opts.tick?.();
      return fillRank(S.box, opts.cellMm, ps, r, sd.at, knives, carriers);
    });
    const areas = fills.map((f) => f.area);
    const best = S.top[0];
    // the family under the global bits must be the seed's own best layout, region for region
    // (pixels, within a quarter grade step — equal AREAS are not the same layout)
    const same =
      fills.every((f, r) => f.hash === best.hashes[r]) ||
      sameRegions(
        rankMasks(S.box, opts.cellMm, portionPts(M, best.bits, S.inBox), n, sd.at).masks,
        rankMasks(S.box, opts.cellMm, ps, n, sd.at).masks,
        layoutTol(best.areas, opts.cellMm),
      );
    const fam = familyCheck(areas);
    let reason = S.reason;
    let refusal: GradeRefusal | null = null;
    if (S.ambiguous) refusal = 'grade-ambiguous';
    else if (!same) {
      refusal = 'grade-ambiguous';
      reason = 'a component shared with another piece points the other way';
    } else if (!fam.ok) {
      refusal = 'sizes-not-distinguished';
      reason = fam.why;
    }
    const rankOk = fills.map((f, r) => refusal == null && f.closed && !f.knifeIncomplete && !fam.leaks.includes(r));
    // a component built from a handful of cross-sections has a barely evidenced orientation: a
    // rank whose region changes when such a component flips is not trusted
    if (refusal == null) {
      const fa = areas.filter((x) => x >= 0);
      const st = fa.slice(1).map((x, k) => x - fa[k]).filter((d) => d > 0);
      const step = st.length ? median(st) : 0;
      for (const c of S.free) {
        if (M.compSupport[c] >= WEAK_SUPPORT) continue;
        const flipped = bits.slice();
        flipped[c] ^= 1;
        const ps2 = portionPts(M, flipped, S.inBox);
        let hit = 0;
        for (let r = 0; r < n; r++) {
          if (!rankOk[r]) continue;
          const f2 = fillRank(S.box, opts.cellMm, ps2, r, sd.at, knives, carriers);
          if (!f2.closed || Math.abs(f2.area - areas[r]) > 0.05 * step) {
            rankOk[r] = false;
            hit++;
          }
        }
        if (hit) reason += `${reason ? '; ' : ''}${hit} rank(s) hang on weakly evidenced component ${c} (${M.compSupport[c]} cross-sections)`;
      }
    }
    // components beyond the search (more than maxFree around the seed) kept their global bit
    // unsearched: flipping one must not move any trusted rank, else the layout was never proven
    if (refusal == null && S.comps.length > S.free.length) {
      const free = new Set(S.free);
      const tolPx = layoutTol(areas, opts.cellMm);
      const here = rankMasks(S.box, opts.cellMm, ps, n, sd.at).masks;
      for (const c of S.comps) {
        if (free.has(c)) continue;
        opts.tick?.();
        const flipped = bits.slice();
        flipped[c] ^= 1;
        const there = rankMasks(S.box, opts.cellMm, portionPts(M, flipped, S.inBox), n, sd.at).masks;
        const moves = rankOk.some((ok, r) => ok && maskDiff(here[r], there[r]) > tolPx);
        if (moves) {
          refusal = 'grade-ambiguous';
          reason = `${S.comps.length} line groups around the piece, ${S.free.length} searched: group ${c} was not, and it changes the outline`;
          for (let r = 0; r < n; r++) rankOk[r] = false;
          break;
        }
      }
    }
    // forks: flip one sub-component (a side of a fork) alone. If that layout is ALSO an even,
    // closed grade of this piece with other regions, the drawing does not say which side of the
    // fork is which — the piece goes to the operator
    if (refusal == null && rankOk.some((x) => x)) {
      const fa = areas.filter((x) => x >= 0);
      const st = fa.slice(1).map((x, k) => x - fa[k]).filter((d) => d > 0);
      const step = st.length ? median(st) : 0;
      const subs = new Set<number>();
      for (const tr of S.inBox) if (M.subOf[tr] >= 0) subs.add(M.subOf[tr]);
      for (const sub of subs) {
        const ps2 = portionPts(M, bits, S.inBox, sub);
        const a2 = Array.from({ length: n }, (_, r) => fillRank(S.box, opts.cellMm, ps2, r, sd.at).area);
        if (!familyCheck(a2).ok) continue;
        const differs = rankOk.some((ok, r) => ok && (a2[r] < 0 || Math.abs(a2[r] - areas[r]) > 0.3 * step));
        const keeps = rankOk.every((ok, r) => !ok || a2[r] >= 0);
        if (differs && keeps) {
          refusal = 'grade-ambiguous';
          reason = `flipping one side of a fork (sub-component ${sub}) gives another even grade (${a2.map((x) => (x < 0 ? '-' : (x / 100).toFixed(0))).join('/')} cm²)`;
          for (let r = 0; r < n; r++) rankOk[r] = false;
          break;
        }
      }
    }
    if (refusal == null && fam.leaks.length) reason = `ranks ${fam.leaks.join(',')} do not close`;
    const knifeBad = fills.map((f, r) => (f.knifeIncomplete ? r : -1)).filter((r) => r >= 0);
    if (refusal == null && knifeBad.length) reason += `${reason ? '; ' : ''}the variant's cutting line does not reach ranks ${knifeBad.join(',')}`;
    results.push({
      seed: sd.id,
      components: S.comps,
      chosen: alt(best),
      alternatives: S.top.slice(1).map(alt),
      ambiguous: S.ambiguous,
      accepted: refusal == null,
      refusal,
      areasMm2: areas,
      finalAreasMm2: fills.map((f) => (f.closed ? f.cutArea : -1)),
      rankOk,
      box: S.box,
      reason,
    });
    if (refusal === 'grade-ambiguous')
      ambiguities.push({
        kind: 'grade-ambiguous',
        message: `piece at (${sd.at.x.toFixed(0)}, ${sd.at.y.toFixed(0)}): ${reason}`,
        classes: [],
        chains: [],
        at: sd.at,
      });
  });
  // rank portions on the chains (global bits)
  const portions: RankPortion[] = [];
  for (const p of trackPortions(M, bits)) {
    const t = M.tracks[p.track];
    for (const sp of chainSpans(t, M.els, p.from, p.to)) {
      const c = set.chains[sp.chain];
      const acc = arcAcc(c.pts);
      const pts = subPts(c.pts, acc, sp.fromMm, sp.toMm);
      if (pts.length < 2) continue;
      portions.push({ ...sp, ranks: p.ranks, component: p.comps.length === 1 ? p.comps[0] : null, pts });
    }
  }
  progress?.(seeds.length, seeds.length);
  return {
    n,
    portions,
    components: M.nComps,
    bits,
    seeds: results,
    ambiguities,
    diag: diag(),
    ...(opts.keepModel ? { model: M } : {}),
    gradedKnives: [...gradedKnife],
  };
}

import { arcLengths as arcAcc, subPolyline as subPts } from './vec';
export { bboxOfPts };
export type { GradeModel };
