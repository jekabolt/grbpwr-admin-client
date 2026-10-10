// pieces/grade (H1) — the one hook F4's fillPieces calls.
//
// It fails CLOSED. F4 runs exactly as before (null) only when nothing says the sheet draws more
// than one size the classes do not tell apart:
//   • grade 'off' (probes);
//   • the sheet is encoded (size classes carry the lines) and no seed's region holds an unencoded
//     nest of same-looking lines;
//   • no size class carries a line and ONE size is expected (the source names its size, or the
//     operator said so on the sizes step).
// The card's size run is never the count (expected.ts). Otherwise, per seed:
//   expected n ≥ 2, nothing encoded  every seed must be PROVEN by gradeRanks — refused otherwise,
//                                    whatever the guard heuristic says ('guard' mode: every seed,
//                                    every expected size refused). A drawing whose band count is
//                                    not n refuses the whole sheet ('size-count').
//   expected unknown, nothing encoded  EVERY seed is refused ('size-count': the sizes step requires
//                                    the answer; this is the defence for paths that skip it).
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

import { SegGrid } from '../geom';
import { drawPolyline, exterior, Grid, openMask, regionOf, traceOuter } from '../raster';
import type { WallItem } from '../snap';
import { variantKnives } from '../variants';
import { itemsOf, type WallModel } from '../walls';

import { gradingEvidence, notEvidence, type GuardOpts, type StyleMap } from './guard';
import { fillRank } from './choose';
import { gradeRanks, type GradeRefusal, type GradeResult } from './index';
import { bboxOfPts, boxOverlap, growBox, median } from './vec';

export type GradeHook = {
  /** ranks to fill */
  n: number;
  /** per-rank walls; null = F4's own */
  walls: ((r: number) => WallItem[]) | null;
  /** seeds refused up front: the fill skips them, `finish` gives them refused candidates */
  skip: ReadonlySet<SeedId>;
  /** variant knife chains that are size lines (cut only as their size's outline, never all sizes) */
  notKnife: ReadonlySet<ChainId>;
  /** apply refusals / cross-checks to the finished candidates (in place) */
  finish: (cands: Map<SeedId, PieceCandidate[]>) => void;
  result: GradeResult | null;
  /** seeds the hook protects (refused or proven) */
  guarded: SeedId[];
  ambiguities: ChainAmbiguity[];
  /**
   * D4 (mixed sheet): the guarded seeds solved as an unencoded sheet with the encoding's n — F4
   * fills them again on the solver's walls only (`fillPiecesDetailed`'s sub-fill) and their proven
   * ranks replace the refusals `finish` gave them; the rest stay refused.
   */
  sub?: { seeds: SeedId[]; hook: GradeHook }[];
};

/** The wall model a sub-fill runs on: every wall comes from the solver (H1 single mode). */
export const SOLVER_MODEL: WallModel = {
  mode: 'single',
  n: 1,
  common: [],
  byRank: [[]],
  emptyRanks: [],
  graded: [],
  fileOfRank: [null],
};

/**
 * Guard evidence for an ENCODED sheet (a graded piece nobody encoded beside encoded ones): its nest
 * shows the sheet's sizes side by side — at least min(n, 5), never fewer than 3, same-looking lines
 * (a cut line with its seam line is 2, a hem with fold and facing 3), over a third of the region's
 * lines. Measured on the encoded corpus: 4 lanes still fired on reef (declared-dash, 9 sizes) and 3
 * on viola; 5 fires only on polupalto, whose "encoding" is F3 reading piece numbers as size labels.
 */
export const mixedGuard = (n: number): Partial<GuardOpts> => ({
  minLanes: Math.max(3, Math.min(n, 5)),
  minShare: 0.33,
});

/**
 * And the two-lane or short nest the rule above misses (two sizes nobody encoded, sizes that differ
 * along a tab): a same-look neighbour ≤ 15 mm away along ≥ 80 mm of the region's lines that is NOT
 * the line's sew line (a uniform 2–20 mm allowance all along), whatever its share. Lines under
 * 40 mm are no lane (lettering, symbols and arrows drawn as strokes). Measured on the encoded
 * corpus: no encoded seed flips (viola's nearest lettering pair: 64 mm of nest at ≤ 15 mm);
 * polupalto (audited, not an encoding) refuses more.
 */
export const PAIR_GUARD: Partial<GuardOpts> = {
  minLanes: 2,
  minShare: 0,
  minLenMm: 80,
  minChainMm: 40,
  reachMm: 15,
  skipUniformPairs: true,
};

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
      region = {
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
      };
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
export function refusedCandidate(
  seed: Seed,
  rank: number,
  why: GradeRefusal,
  detail: string,
): PieceCandidate {
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
  'sizes-not-distinguished':
    'several sizes are drawn alike here and nothing proves which line is which size',
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
  const blocked = new Set<ChainId>([...notEvidence(set.classes, set.chains), ...exclude]);

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
    notKnife: new Set(),
    result,
    guarded: ids,
    ambiguities: amb,
    finish: (cands) => {
      for (const id of ids) {
        const s = byId.get(id);
        if (s)
          cands.set(
            id,
            Array.from({ length: n }, (_, r) => refusedCandidate(s, r, why, detail)),
          );
      }
    },
  });

  if (model.mode !== 'single') {
    // an encoded sheet: F4 ranks by the classes. A seed among same-looking parallel lines no
    // size class covers is a graded piece nobody encoded (a mixed sheet) — refused
    const covered = new Set(model.graded);
    const ids = model.common.filter((id) => !covered.has(id) && !blocked.has(id));
    // H1c-5: an orphan (a line F3 put in no class) is in `graded` only for F4's local nesting
    // fallback — no class says which size it is. Unless the wall model ranked it (continuity,
    // labels, bands), it is as uncovered as a common line: a nest of orphans is guarded too. A
    // second look, never instead of the first: orphans drawn as walls also cut regions smaller
    // (polupalto A's seed 3 lost its nest that way), so they only ADD guarded seeds
    const ranked = new Set(model.byRank.flat());
    const orphans = set.orphans.filter((id) => !ranked.has(id) && !blocked.has(id));
    const withOrphans = orphans.length ? [...new Set([...ids, ...orphans])] : null;
    const wide = [
      ...guardedSeeds(sheet, set, seeds, ids, cell, mixedGuard(model.n)),
      ...(withOrphans
        ? guardedSeeds(sheet, set, seeds, withOrphans, cell, mixedGuard(model.n))
        : []),
    ];
    const pairs = [
      ...guardedSeeds(sheet, set, seeds, ids, cell, PAIR_GUARD),
      ...(withOrphans ? guardedSeeds(sheet, set, seeds, withOrphans, cell, PAIR_GUARD) : []),
    ];
    const g = seeds.map((s) => s.id).filter((id) => wide.includes(id) || pairs.includes(id));
    if (!g.length) return null;
    const held = refuseSeeds(
      g,
      model.n,
      'sizes-not-distinguished',
      DETAIL['sizes-not-distinguished'],
      null,
      [],
    );
    if (mode !== 'solve') return held;
    // D4: the encoding states n — the guarded seeds go through the solver with that n, under the
    // same proof obligations as an unencoded sheet (band count = n, orientation, region and D3
    // bounds); what it proves is filled on its walls, the rest stays refused
    const gs = new Set(g);
    const sub = gradeHook(
      sheet,
      set,
      run,
      seeds.filter((s) => gs.has(s.id)),
      SOLVER_MODEL,
      { ...opts, expectedSizes: { n: model.n, from: 'source' } },
      progress,
      exclude,
    );
    // nothing proven (polupalto: the uncovered stretches show 2 lines side by side, the encoding
    // says 6) — the seeds keep the mixed-sheet refusal, not a size-count question the operator
    // cannot answer on an encoded sheet
    if (!sub?.result?.seeds.some((x) => x.accepted && x.rankOk.some(Boolean))) return held;
    return { ...held, sub: [{ seeds: g, hook: sub }] };
  }

  if (exp && exp.n <= 1) return null; // one size, and someone who knows says so
  if (!exp) {
    const amb: ChainAmbiguity = {
      kind: 'size-count',
      message: 'the number of sizes drawn on this sheet is not known — answer it on the sizes step',
      classes: [],
      chains: [],
      at: null,
    };
    return refuseSeeds(
      seeds.map((s) => s.id),
      1,
      'size-count',
      DETAIL['size-count'],
      null,
      [amb],
    );
  }

  const n = exp.n;
  const all = seeds.map((s) => s.id);
  if (mode === 'guard')
    return refuseSeeds(
      all,
      n,
      'sizes-not-distinguished',
      DETAIL['sizes-not-distinguished'],
      null,
      [],
      () => [],
    );

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
      {
        cellMm: cell,
        knives,
        knifeIds: kIds,
        knifeCarriers: knifeCarriers(set, kIds),
        exclude: [...blocked],
        tick,
      },
      progress,
    );
    cache.set(key, G);
  }
  if (G.diag.bandMode !== n) {
    const message =
      G.diag.bandMode > 0
        ? `the drawing shows ${G.diag.bandMode} line(s) side by side, ${exp.from === 'operator' ? 'you said' : 'the source says'} ${n}`
        : `no lines side by side were found, ${n} sizes expected`;
    const amb: ChainAmbiguity = { kind: 'size-count', message, classes: [], chains: [], at: null };
    return refuseSeeds(all, n, 'size-count', message, G, [amb], () => []);
  }
  const byRank: WallItem[][] = Array.from({ length: n }, () => []);
  for (const p of G.portions)
    for (const r of p.ranks) byRank[r].push({ chain: p.chain, pts: p.pts });
  const res = new Map(G.seeds.map((s) => [s.seed, s]));
  // the solver's final region of a rank, re-filled on its own raster (box, cell, walls, knives)
  const rankPs = G.portions.map((p) => ({ track: p.chain, ranks: p.ranks, pts: p.pts }));
  const gradedKnives = new Set(G.gradedKnives);
  const solverKnives = kIds.flatMap((kid, i) => (gradedKnives.has(kid) ? [] : [knives[i]]));
  const rankWalls = (g: Grid, r: number) => {
    const w = new Uint8Array(g.W * g.H);
    for (const p of rankPs) if (p.ranks.includes(r)) drawPolyline(g, w, p.pts);
    for (const k of solverKnives) drawPolyline(g, w, k);
    return w;
  };
  // per seed: every rank's solver region, opened and traced (the neighbours' lines for D3)
  const solverEdges = new Map<SeedId, (PtMm[] | null)[]>();
  const edgesOf = (s: GradeResult['seeds'][number], sd: Seed) => {
    let e = solverEdges.get(sd.id);
    if (!e) {
      e = Array.from({ length: n }, (_, r) => {
        const f = fillRank(s.box, cell, rankPs, r, sd.at, solverKnives, [], true);
        if (!f.closed || !f.mask || !f.grid) return null;
        const k0 = f.grid.iy(sd.at.y) * f.grid.W + f.grid.ix(sd.at.x);
        const grown = withWalls(f.grid, f.mask, rankWalls(f.grid, r), GRADE_STRAY_MAX_MM);
        return traceOuter(f.grid, openMask(f.grid, grown, 2, k0));
      });
      solverEdges.set(sd.id, e);
    }
    return e;
  };
  const regionDiff = (
    c: PieceCandidate,
    s: GradeResult['seeds'][number],
    sd: Seed,
    r: number,
  ): { xor: number; stray: Stray } => {
    const none: Stray = { worstRatio: Infinity, runMm: Infinity, at: null };
    const f = fillRank(s.box, cell, rankPs, r, sd.at, solverKnives, [], true);
    if (!f.closed || !f.mask || !f.grid || c.outer.length < 3)
      return { xor: Infinity, stray: none };
    const g = f.grid;
    const wall = new Uint8Array(g.W * g.H);
    drawPolyline(g, wall, c.outer, true);
    const ext = exterior(g, wall);
    const mine = new Uint8Array(ext.length);
    let d = 0;
    for (let k = 0; k < ext.length; k++) {
      mine[k] = ext[k] ? 0 : 1;
      if (mine[k] !== f.mask[k]) d++;
    }
    // both boundaries traced the same way (pixel edges of the region, walls included), so the rim
    // cancels; both opened as F4 opens its region (narrow spurs and slits under ~2 mm are not
    // outline), so what is left is where F4's outline strays from the solver's
    const k0 = g.iy(sd.at.y) * g.W + g.ix(sd.at.x);
    const edges = edgesOf(s, sd);
    const own = edges[r];
    const neighbours = [edges[r - 1], edges[r + 1]].filter((x): x is PtMm[] => !!x);
    if (!own) return { xor: d * g.cell * g.cell, stray: none };
    // the raster disagrees with itself along line bundles: a knife's cut leaves the knife's pixels
    // out of the solver's region (a 1–1.5 mm band along the cut edge), and the solver's region
    // holds every wall pixel it touches (a bundle of lines crossing the outline survives the
    // opening as a stub, where F4's single outline line does not). Both regions therefore grow
    // through the rank's line and knife pixels they touch (≤ the bound's cap), never through
    // open paper — what is left is outline, not raster
    const grown = withWalls(g, mine, rankWalls(g, r), GRADE_STRAY_MAX_MM);
    const stray = strayOf(traceOuter(g, openMask(g, grown, 2, k0)), own, neighbours, g.cell);
    return { xor: d * g.cell * g.cell, stray };
  };
  const skip = new Set(
    G.seeds.filter((s) => !s.accepted || !s.rankOk.some(Boolean)).map((s) => s.seed),
  );
  for (const s of seeds) if (!res.has(s.id)) skip.add(s.id);
  const detailOf = (id: SeedId) => {
    const s = res.get(id);
    return s?.reason
      ? `${DETAIL[s.refusal ?? 'sizes-not-distinguished']} (${s.reason})`
      : DETAIL['sizes-not-distinguished'];
  };
  return {
    n,
    walls: (r) => byRank[r] ?? [],
    skip,
    notKnife: new Set(G.gradedKnives),
    result: G,
    guarded: all,
    ambiguities: G.ambiguities,
    finish: (cands) => {
      for (const id of skip) {
        const sd = byId.get(id);
        if (!sd) continue;
        const why = res.get(id)?.refusal ?? 'sizes-not-distinguished';
        cands.set(
          id,
          Array.from({ length: n }, (_, r) => refusedCandidate(sd, r, why, detailOf(id))),
        );
      }
      for (const [id, list] of cands) {
        if (skip.has(id)) continue;
        const s = res.get(id)!;
        for (const c of list) {
          c.rankFrom = 'grade';
          if (!s.rankOk[c.rank])
            refuse(
              c,
              'sizes-not-distinguished',
              `this size is not proven (${s.reason || 'its outline does not close on the size lines'})`,
            );
          else if (c.outcome !== 'closed' && c.outcome !== 'refused')
            refuse(
              c,
              'sizes-not-distinguished',
              `F4 could not close the proven size lines (${c.outcome})`,
            );
        }
        // F4's contours on the sheet-wide walls must be the solver's regions. The raster region
        // also holds the wall pixels and F4 opens narrow spurs, so the two differ by a rim that
        // is the same for every rank of the piece: compare each rank's offset with the piece's
        // median offset, against the grade step (a contour that took another line moves by one)
        const live = list.filter((c) => c.outcome === 'closed' && s.finalAreasMm2[c.rank] >= 0);
        const off = live.map((c) => s.finalAreasMm2[c.rank] - c.areaMm2);
        const fa = s.finalAreasMm2.filter((a) => a >= 0);
        const steps = fa
          .slice(1)
          .map((a, k) => a - fa[k])
          .filter((d) => d > 0);
        const step = steps.length ? median(steps) : 0;
        const mo = off.length ? median(off) : 0;
        // and REGION for region (equal areas are not the same outline): the pixels F4's contour
        // and the solver's region differ by, on the solver's own raster — the same rim for every
        // rank; a rank that took another line differs by a strip, not a rim
        const diff = live.map((c) => regionDiff(c, res.get(id)!, byId.get(id)!, c.rank));
        const xor = diff.map((x) => x.xor);
        const mx = median(xor);
        live.forEach((c, k) => {
          const bad =
            !step ||
            Math.abs(off[k] - mo) > GRADE_STEP_TOL * step ||
            Math.abs(mo) > GRADE_RIM_MAX * c.areaMm2 ||
            xor[k] - mx > GRADE_XOR_TOL * step ||
            mx > GRADE_XOR_MAX * c.areaMm2 ||
            // absolute, per rank: a contour wrong by the same strip in EVERY rank (a sew line
            // taken for the cut line) moves no rank off the median
            xor[k] > GRADE_XOR_AREA_MAX * c.areaMm2 ||
            xor[k] / perimeter(c.outer) > GRADE_XOR_STRIP_MM ||
            diff[k].stray.runMm > GRADE_STRAY_RUN_MM;
          if (HOOK_DEBUG.on)
            HOOK_DEBUG.log(
              `    region seed ${id} r${c.rank}: stray ratio ${diff[k].stray.worstRatio.toFixed(2)} run ${diff[k].stray.runMm.toFixed(0)} mm${diff[k].stray.at ? ` at ${diff[k].stray.at!.x.toFixed(1)},${diff[k].stray.at!.y.toFixed(1)}` : ''}, strip ${(xor[k] / perimeter(c.outer)).toFixed(3)} mm, area ${((100 * xor[k]) / c.areaMm2).toFixed(3)} %, xor ${(xor[k] / 100).toFixed(2)} cm² (median ${(mx / 100).toFixed(2)}, ${((100 * mx) / c.areaMm2).toFixed(2)} % of the area), step ${(step / 100).toFixed(2)} cm² → ${((xor[k] - mx) / (step || 1)).toFixed(2)} step${bad ? ' BAD' : ''}`,
            );
          if (bad) {
            if (HOOK_DEBUG.on)
              HOOK_DEBUG.log(
                `    crosscheck seed ${id} r${c.rank}: solver ${(s.finalAreasMm2[c.rank] / 100).toFixed(1)} vs F4 ${(c.areaMm2 / 100).toFixed(1)} cm², offset ${(off[k] / 100).toFixed(2)} vs median ${(mo / 100).toFixed(2)}, step ${(step / 100).toFixed(2)} cm²`,
              );
            refuse(
              c,
              'grade-ambiguous',
              "the closed outline does not match the solver's region for this size",
            );
          }
        });
        // and F4's own family still grows rank by rank
        let prev = -1;
        for (const c of list
          .filter((x) => x.outcome === 'closed')
          .sort((x, y) => x.rank - y.rank)) {
          if (c.areaMm2 <= prev)
            refuse(c, 'grade-ambiguous', 'this size is not larger than the size below it');
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
/**
 * Region check (F4 contour vs the solver's region, pixel XOR): a rank may differ from the piece's
 * median by this × the grade step, and the median (the rim) by this share of the area. Bench
 * (robe / kombinezon / palto L1+L2, 144 accepted ranks): ≤ 0.16 step, median ≤ 1.45 % of the area.
 */
export const GRADE_XOR_TOL = 0.25;
export const GRADE_XOR_MAX = 0.04;
/**
 * Absolute per-rank bounds of the same check: the mean strip between F4's contour and the solver's
 * region (XOR area / contour length) and the XOR as a share of the area. Bench (144 accepted ranks):
 * strip ≤ 0.58 mm, XOR ≤ 2.69 % of the area (a small kombinezon piece, where the rim weighs most) —
 * 2 % refused three correct ranks of it, hence 4 %.
 */
export const GRADE_XOR_STRIP_MM = 2;
export const GRADE_XOR_AREA_MAX = 0.04;

/**
 * And WHERE F4's outline strays from the solver's (D3). A wrong contour can only follow another
 * size's drawn line, which lies at the local distance to the neighbour ranks' lines; where sizes
 * coincide (near a pivot) following the neighbour is harmless. So at each boundary point (both
 * outlines sampled every 1 mm, both directions) the deviation from the other outline is bounded by
 * max(0.75 mm, min(3 mm, half the distance from that point to the nearest neighbour-rank line)),
 * with one raster cell of slack; a rank is refused when the excess runs on for more than 5 mm (a
 * single-pixel spike is noise, a tab that took the next size's line is not). Accepted residual: an
 * all-round inset of ~1.5 mm may pass where the sizes are ≥ 3 mm apart — it cannot be another
 * drawn size line at realistic grade steps (that line is a whole grade offset away).
 */
export const GRADE_STRAY_MAX_MM = 3;
export const GRADE_STRAY_FLOOR_MM = 0.75;
export const GRADE_STRAY_SHARE = 0.5;
export const GRADE_STRAY_RUN_MM = 5;
const STRAY_REACH_MM = 20;

type Stray = {
  /** worst deviation / local bound over both outlines */
  worstRatio: number;
  /** longest run (mm) of consecutive samples over their bound + one cell */
  runMm: number;
  /** the middle of that run (or the worst sample when there is none) */
  at: PtMm | null;
};

const samplesOf = (pts: readonly PtMm[], step = 1): PtMm[] => {
  const out: PtMm[] = [];
  for (let i = 0; i < pts.length; i++) {
    const u = pts[i];
    const v = pts[(i + 1) % pts.length];
    const L = Math.hypot(v.x - u.x, v.y - u.y);
    const m = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < m; k++)
      out.push({ x: u.x + ((v.x - u.x) * k) / m, y: u.y + ((v.y - u.y) * k) / m });
  }
  return out;
};

const gridOf = (lines: readonly (readonly PtMm[])[]) => {
  const g = new SegGrid(4);
  lines.forEach((q, i) => g.addPolyline(i, q, true));
  return { g, lines };
};

function nearest(G: ReturnType<typeof gridOf>, t: PtMm, reach: number): number {
  let best = reach;
  G.g.near(t, reach, (o, j) => {
    const q = G.lines[o];
    const s0 = q[j];
    const s1 = q[(j + 1) % q.length];
    const sx = s1.x - s0.x;
    const sy = s1.y - s0.y;
    const L2 = sx * sx + sy * sy;
    const w = L2 > 0 ? Math.max(0, Math.min(1, ((t.x - s0.x) * sx + (t.y - s0.y) * sy) / L2)) : 0;
    best = Math.min(best, Math.hypot(t.x - s0.x - sx * w, t.y - s0.y - sy * w));
  });
  return best;
}

/** `mask` grown through `walls` pixels only (4-connected), at most `reachMm` from where it was. */
function withWalls(g: Grid, mask: Uint8Array, walls: Uint8Array, reachMm: number): Uint8Array {
  const out = mask.slice();
  const W = g.W;
  let front: number[] = [];
  for (let k = 0; k < out.length; k++) if (out[k]) front.push(k);
  for (let step = Math.ceil(reachMm / g.cell); step > 0 && front.length; step--) {
    const next: number[] = [];
    for (const k of front) {
      const x = k % W;
      const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W];
      for (const j of nb)
        if (j >= 0 && j < out.length && !out[j] && walls[j]) {
          out[j] = 1;
          next.push(j);
        }
    }
    front = next;
  }
  return out;
}

/** D3: the deviation of two outlines against the per-location bound (both directions). */
function strayOf(
  f4: readonly PtMm[],
  solver: readonly PtMm[],
  neighbours: readonly (readonly PtMm[])[],
  cellMm: number,
): Stray {
  if (f4.length < 3 || solver.length < 3)
    return { worstRatio: Infinity, runMm: Infinity, at: null };
  const N = neighbours.length ? gridOf(neighbours) : null;
  const one = (from: readonly PtMm[], to: readonly PtMm[]): Stray => {
    const T = gridOf([to]);
    const pts = samplesOf(from);
    const over: boolean[] = [];
    let worst = 0;
    let at: PtMm | null = null;
    for (const t of pts) {
      const dev = nearest(T, t, STRAY_REACH_MM);
      const dn = N ? nearest(N, t, 2 * GRADE_STRAY_MAX_MM) : 2 * GRADE_STRAY_MAX_MM;
      const bound = Math.max(
        GRADE_STRAY_FLOOR_MM,
        Math.min(GRADE_STRAY_MAX_MM, GRADE_STRAY_SHARE * dn),
      );
      if (dev / bound > worst) {
        worst = dev / bound;
        at = t;
      }
      over.push(dev > bound + cellMm);
    }
    // longest run of consecutive over-bound samples on the closed outline (1 sample ≈ 1 mm)
    let run = 0;
    let longest = 0;
    let end = 0;
    for (let i = 0; i < 2 * over.length && longest < over.length; i++) {
      run = over[i % over.length] ? run + 1 : 0;
      if (run > longest) {
        longest = run;
        end = i % over.length;
      }
    }
    if (longest) at = pts[(end - (longest >> 1) + over.length) % over.length];
    return { worstRatio: worst, runMm: Math.min(longest, over.length), at };
  };
  const a = one(f4, solver);
  const b = one(solver, f4);
  return {
    worstRatio: Math.max(a.worstRatio, b.worstRatio),
    runMm: Math.max(a.runMm, b.runMm),
    at: a.runMm >= b.runMm ? a.at : b.at,
  };
}

function perimeter(pts: readonly PtMm[]): number {
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return L || 1;
}
