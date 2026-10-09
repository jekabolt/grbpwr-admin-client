// pieces/grade (H1) — the one hook F4's fillPieces calls.
//
// It fails CLOSED. F4 runs exactly as before (null) only when nothing says the sheet draws more
// than one size the classes do not tell apart:
//   • grade 'off' (probes);
//   • the sheet is encoded (size classes carry the lines) and no seed's region holds an unencoded
//     nest of same-looking lines;
//   • no size class carries a line and ONE size is expected (the source names its size, the
//     operator said so, the card has one size);
//   • the expected size count is unknown and no seed looks graded.
// Otherwise, per seed:
//   expected n ≥ 2, nothing encoded  every seed must be PROVEN by gradeRanks — refused otherwise,
//                                    whatever the guard heuristic says ('guard' mode: every seed,
//                                    every expected size refused). A drawing whose band count is
//                                    not n refuses the whole sheet ('size-count').
//   expected unknown                 seeds that look graded are refused ('size-count': answer the
//                                    count on the sizes step); the others fill as one size.
//   encoded sheet (mixed)            seeds whose region holds an unencoded nest are refused.
// Refused = outcome 'refused' with `gradeRefusal` + `gradeDetail`, never a contour. An accepted
// rank whose F4 contour disagrees with the solver's region is refused too.
import type {
  ChainAmbiguity,
  ChainId,
  ChainSet,
  FillOpts,
  PieceCandidate,
  PtMm,
  Seed,
  SeedId,
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';

import { drawPolyline, exterior, Grid, regionOf } from '../raster';
import type { WallItem } from '../snap';
import { variantKnives } from '../variants';
import { itemsOf, type WallModel } from '../walls';

import { gradingEvidence, notEvidence, type GuardOpts, type StyleMap } from './guard';
import { gradeRanks, type GradeRefusal, type GradeResult } from './index';
import { bboxOfPts, boxOverlap, growBox, median } from './vec';

export type GradeHook = {
  /** ranks to fill */
  n: number;
  /** per-rank walls; null = F4's own */
  walls: ((r: number) => WallItem[]) | null;
  /** seeds refused up front: the fill skips them, `finish` gives them refused candidates */
  skip: ReadonlySet<SeedId>;
  /** apply refusals / cross-checks to the finished candidates (in place) */
  finish: (cands: Map<SeedId, PieceCandidate[]>) => void;
  result: GradeResult | null;
  /** seeds the hook protects (refused or proven) */
  guarded: SeedId[];
  ambiguities: ChainAmbiguity[];
};

/** Guard evidence for an ENCODED sheet: a nest needs self + 2 same-looking lines (cut + seam is 2). */
const MIXED_GUARD: Partial<GuardOpts> = { minLanes: 3 };

/**
 * Seeds whose region (every candidate line a wall, the envelope around the seed) holds a graded
 * nest of same-looking lines no size class covers.
 */
function guardedSeeds(
  sheet: Sheet,
  set: ChainSet,
  seeds: readonly Seed[],
  ids: readonly ChainId[],
  cellMm: number,
  opts: Partial<GuardOpts>,
): SeedId[] {
  if (!ids.length || !seeds.length) return [];
  const items = itemsOf(set, ids);
  const box = growBox(sheet.bbox, 15);
  const cell = Math.max(cellMm, 1);
  const g = new Grid(box, cell);
  const wall = new Uint8Array(g.W * g.H);
  for (const it of items) drawPolyline(g, wall, it.pts, it.closed);
  const ext = exterior(g, wall);
  const out: SeedId[] = [];
  const common = ids.map((id) => set.chains[id]).filter(Boolean);
  const boxes = common.map((c) => bboxOfPts(c.pts));
  const styles: StyleMap = new Map(sheet.styles.map((s) => [s.id, s]));
  for (const s of seeds) {
    const k0 = g.iy(s.at.y) * g.W + g.ix(s.at.x);
    let mask: Uint8Array | null = null;
    let region = growBox({ minX: s.at.x, minY: s.at.y, maxX: s.at.x, maxY: s.at.y }, 150);
    if (!ext[k0] && !wall[k0]) {
      const r = regionOf(g, ext, k0);
      mask = r.mask;
      let x0 = g.W;
      let y0 = g.H;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < g.H; y++)
        for (let x = 0; x < g.W; x++)
          if (mask[y * g.W + x]) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      const a = g.centre(x0, y0);
      const b = g.centre(x1, y1);
      region = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
    }
    const near = common.filter((c, i) => {
      if (!boxOverlap(boxes[i], region)) return false;
      if (!mask) return true;
      for (const p of c.pts) {
        const x = g.ix(p.x);
        const y = g.iy(p.y);
        if (g.inside(x, y) && mask[y * g.W + x]) return true;
      }
      return false;
    });
    if (gradingEvidence(near, set.classes, opts, styles).graded) out.push(s.id);
  }
  return out;
}

/** A refused candidate: no contour, the reason and the words for the operator. */
export function refusedCandidate(seed: Seed, rank: number, why: GradeRefusal, detail: string): PieceCandidate {
  return {
    seed: seed.id,
    rank,
    outer: [],
    walls: [],
    inside: [],
    textsInside: [],
    outcome: 'refused',
    areaMm2: 0,
    bbox: { minX: seed.at.x, minY: seed.at.y, maxX: seed.at.x, maxY: seed.at.y },
    sourceCoverage: 0,
    p95Mm: 0,
    rankFrom: 'grade',
    gradeRefusal: why,
    gradeDetail: detail,
  };
}

const refuse = (c: PieceCandidate, why: GradeRefusal, detail: string) => {
  c.outcome = 'refused';
  c.gradeRefusal = why;
  c.gradeDetail = detail;
  c.rankFrom = 'grade';
  delete c.leakAt;
  delete c.derived;
  c.outer = [];
  c.walls = [];
  c.inside = [];
  c.textsInside = [];
  c.areaMm2 = 0;
  c.sourceCoverage = 0;
  c.p95Mm = 0;
};

/** Chains lying on the infinite carrier line of a straight knife (≤ 0.6 mm), any span. */
function knifeCarriers(set: ChainSet, knives: readonly number[]): PtMm[][] {
  const have = new Set(knives);
  const out: PtMm[][] = [];
  for (const id of knives) {
    const p = set.chains[id].pts;
    const a = p[0];
    const b = p[p.length - 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 20) continue;
    const off = (q: PtMm) => Math.abs(((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / L);
    if (p.some((q) => off(q) > 0.6)) continue; // not a straight cutting line
    for (const c of set.chains) {
      if (have.has(c.id) || c.pts.length < 2 || c.lengthMm < 1) continue;
      if (c.pts.every((q) => off(q) <= 0.6)) {
        have.add(c.id);
        out.push(c.pts);
      }
    }
  }
  return out;
}

const DETAIL: Record<GradeRefusal, string> = {
  'sizes-not-distinguished': 'several sizes are drawn alike here and nothing proves which line is which size',
  'grade-ambiguous': 'more than one size layout fits these lines',
  'size-count': 'how many sizes this sheet draws is not known — answer it on the sizes step',
};

/** Solver results per chain set: an operator refill (same set, seeds, walls) does not solve again. */
const solved = new WeakMap<ChainSet, Map<string, GradeResult>>();

export function gradeHook(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  model: WallModel,
  opts: FillOpts,
  progress?: (done: number, total: number, note?: string) => void,
  exclude: readonly ChainId[] = [],
): GradeHook | null {
  const mode = opts.grade ?? 'solve';
  if (mode === 'off' || !seeds.length) return null;
  const exp = opts.expectedSizes ?? null;
  const cell = opts.cellMm || 0.5;
  const byId = new Map(seeds.map((s) => [s.id, s]));
  const blocked = new Set<ChainId>([...notEvidence(set.classes), ...exclude]);

  /** Every listed seed refused at every one of n ranks; F4 fills the rest with its own walls. */
  const refuseSeeds = (
    ids: SeedId[],
    n: number,
    why: GradeRefusal,
    detail: string,
    result: GradeResult | null,
    amb: ChainAmbiguity[],
    walls: GradeHook['walls'] = null,
  ): GradeHook => ({
    n,
    walls,
    skip: new Set(ids),
    result,
    guarded: ids,
    ambiguities: amb,
    finish: (cands) => {
      for (const id of ids) {
        const s = byId.get(id);
        if (s) cands.set(id, Array.from({ length: n }, (_, r) => refusedCandidate(s, r, why, detail)));
      }
    },
  });

  if (model.mode !== 'single') {
    // an encoded sheet: F4 ranks by the classes. A seed among same-looking parallel lines no
    // size class covers is a graded piece nobody encoded (a mixed sheet) — refused
    const covered = new Set(model.graded);
    const ids = model.common.filter((id) => !covered.has(id) && !blocked.has(id));
    const g = guardedSeeds(sheet, set, seeds, ids, cell, MIXED_GUARD);
    if (!g.length) return null;
    return refuseSeeds(g, model.n, 'sizes-not-distinguished', DETAIL['sizes-not-distinguished'], null, []);
  }

  const lineIds = model.common.filter((id) => !blocked.has(id));
  if (exp && exp.n <= 1) return null; // one size, and someone who knows says so
  if (!exp) {
    const g = guardedSeeds(sheet, set, seeds, lineIds, cell, {});
    if (!g.length) return null;
    const amb: ChainAmbiguity = {
      kind: 'size-count',
      message: 'pieces look graded but the number of sizes on the sheet is not known',
      classes: [],
      chains: [],
      at: null,
    };
    return refuseSeeds(g, 1, 'size-count', DETAIL['size-count'], null, [amb]);
  }

  const n = exp.n;
  const all = seeds.map((s) => s.id);
  if (mode === 'guard')
    return refuseSeeds(all, n, 'sizes-not-distinguished', DETAIL['sizes-not-distinguished'], null, [], () => []);

  const kIds = opts.variant ? variantKnives(sheet, set, opts.variant) : [];
  const knives = itemsOf(set, kIds).map((it) => it.pts);
  const key = JSON.stringify([
    n,
    seeds.map((s) => [s.id, +s.at.x.toFixed(3), +s.at.y.toFixed(3)]),
    opts.variant ?? null,
    cell,
    [...blocked].sort((a, b) => a - b),
  ]);
  let cache = solved.get(set);
  if (!cache) solved.set(set, (cache = new Map()));
  let G = cache.get(key);
  if (!G) {
    // cancellation reaches the solver's inner loops through the fill's progress (the worker's
    // progress checks the cancel flag); throttled so the loops do not flood the wizard
    let last = 0;
    let note = 0;
    const tick = () => {
      const t = Date.now();
      if (t - last < 150) return;
      last = t;
      progress?.(note++ % 100, 100, 'telling the sizes apart');
    };
    G = gradeRanks(
      sheet,
      set,
      seeds,
      n,
      { cellMm: cell, knives, knifeCarriers: knifeCarriers(set, kIds), exclude: [...blocked], tick },
      progress,
    );
    cache.set(key, G);
  }
  if (G.diag.bandMode !== n) {
    const message =
      G.diag.bandMode > 0
        ? `the drawing shows ${G.diag.bandMode} line(s) side by side, ${exp.from === 'card' ? "the card's size run" : exp.from === 'operator' ? 'you said' : 'the source says'} ${n}`
        : `no lines side by side were found, ${n} sizes expected`;
    const amb: ChainAmbiguity = { kind: 'size-count', message, classes: [], chains: [], at: null };
    return refuseSeeds(all, n, 'size-count', message, G, [amb], () => []);
  }
  const byRank: WallItem[][] = Array.from({ length: n }, () => []);
  for (const p of G.portions) for (const r of p.ranks) byRank[r].push({ chain: p.chain, pts: p.pts });
  const res = new Map(G.seeds.map((s) => [s.seed, s]));
  const skip = new Set(G.seeds.filter((s) => !s.accepted || !s.rankOk.some(Boolean)).map((s) => s.seed));
  for (const s of seeds) if (!res.has(s.id)) skip.add(s.id);
  const detailOf = (id: SeedId) => {
    const s = res.get(id);
    return s?.reason ? `${DETAIL[s.refusal ?? 'sizes-not-distinguished']} (${s.reason})` : DETAIL['sizes-not-distinguished'];
  };
  return {
    n,
    walls: (r) => byRank[r] ?? [],
    skip,
    result: G,
    guarded: all,
    ambiguities: G.ambiguities,
    finish: (cands) => {
      for (const id of skip) {
        const sd = byId.get(id);
        if (!sd) continue;
        const why = res.get(id)?.refusal ?? 'sizes-not-distinguished';
        cands.set(id, Array.from({ length: n }, (_, r) => refusedCandidate(sd, r, why, detailOf(id))));
      }
      for (const [id, list] of cands) {
        if (skip.has(id)) continue;
        const s = res.get(id)!;
        for (const c of list) {
          c.rankFrom = 'grade';
          if (!s.rankOk[c.rank]) refuse(c, 'sizes-not-distinguished', `this size is not proven (${s.reason || 'its outline does not close on the size lines'})`);
          else if (c.outcome !== 'closed' && c.outcome !== 'refused')
            refuse(c, 'sizes-not-distinguished', `F4 could not close the proven size lines (${c.outcome})`);
        }
        // F4's contours on the sheet-wide walls must be the solver's regions. The raster region
        // also holds the wall pixels and F4 opens narrow spurs, so the two differ by a rim that
        // is the same for every rank of the piece: compare each rank's offset with the piece's
        // median offset, against the grade step (a contour that took another line moves by one)
        const live = list.filter((c) => c.outcome === 'closed' && s.finalAreasMm2[c.rank] >= 0);
        const off = live.map((c) => s.finalAreasMm2[c.rank] - c.areaMm2);
        const fa = s.finalAreasMm2.filter((a) => a >= 0);
        const steps = fa.slice(1).map((a, k) => a - fa[k]).filter((d) => d > 0);
        const step = steps.length ? median(steps) : 0;
        const mo = off.length ? median(off) : 0;
        live.forEach((c, k) => {
          const bad = !step || Math.abs(off[k] - mo) > GRADE_STEP_TOL * step || Math.abs(mo) > GRADE_RIM_MAX * c.areaMm2;
          if (bad) {
            if (HOOK_DEBUG.on)
              HOOK_DEBUG.log(`    crosscheck seed ${id} r${c.rank}: solver ${(s.finalAreasMm2[c.rank] / 100).toFixed(1)} vs F4 ${(c.areaMm2 / 100).toFixed(1)} cm², offset ${(off[k] / 100).toFixed(2)} vs median ${(mo / 100).toFixed(2)}, step ${(step / 100).toFixed(2)} cm²`);
            refuse(c, 'grade-ambiguous', "the closed outline does not match the solver's region for this size");
          }
        });
        // and F4's own family still grows rank by rank
        let prev = -1;
        for (const c of list.filter((x) => x.outcome === 'closed').sort((x, y) => x.rank - y.rank)) {
          if (c.areaMm2 <= prev) refuse(c, 'grade-ambiguous', 'this size is not larger than the size below it');
          else prev = c.areaMm2;
        }
      }
    },
  };
}

export const HOOK_DEBUG = { on: false, log: (s: string) => console.log(s) };

/** Max deviation of a rank's (solver − F4) area offset from the piece's median, × grade step. */
export const GRADE_STEP_TOL = 0.3;
/** Max |median offset| as a share of the contour area (rim + opened spurs). */
export const GRADE_RIM_MAX = 0.06;
