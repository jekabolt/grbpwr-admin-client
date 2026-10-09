// pieces/grade (H1) — the one hook F4's fillPieces calls.
//
// Untouched (returns null, F4 runs exactly as before) unless ALL hold: opts.grade is not 'off',
// F4 fell to 'single' walls, the source did not declare a single size, the size count n > 1 is
// known (SizeRun or opts.sizeCount), and at least one seed's region holds a graded nest nobody
// encoded (detectUnencodedGrading). Then:
//   'guard'  every such seed is refused ('sizes-not-distinguished'): a leak for the operator,
//            never a single-size contour of no size
//   'solve'  gradeRanks gives per-rank walls; F4 fills every rank with them and nothing else
//            (its passes B/C never run: single mode has none); seeds the solver did not accept are
//            refused; an accepted rank whose F4 contour disagrees with the solver's region is
//            refused too. A drawing whose band count disagrees with n → 'size-count' (guard).
import type {
  BoxMm,
  ChainAmbiguity,
  ChainSet,
  FillOpts,
  PieceCandidate,
  Seed,
  SeedId,
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';

import { drawPolyline, exterior, Grid, regionOf } from '../raster';
import type { WallItem } from '../snap';
import { variantKnives } from '../variants';
import { itemsOf, type WallModel } from '../walls';

import { gradingEvidence } from './guard';
import { gradeRanks, type GradeRefusal, type GradeResult } from './index';
import { boxOverlap, bboxOfPts, growBox, median } from './vec';

export type GradeHook = {
  /** ranks to fill */
  n: number;
  /** per-rank walls; null = F4's own (guard mode keeps the single-size walls) */
  walls: ((r: number) => WallItem[]) | null;
  /** apply refusals / cross-checks to the finished candidates (in place) */
  finish: (cands: Map<SeedId, PieceCandidate[]>) => void;
  result: GradeResult | null;
  guarded: SeedId[];
  ambiguities: ChainAmbiguity[];
};

/** Seeds whose region (every line a wall, the envelope around the seed) holds a graded nest. */
function guardedSeeds(sheet: Sheet, set: ChainSet, seeds: readonly Seed[], model: WallModel, cellMm: number): SeedId[] {
  const items = itemsOf(set, model.common);
  const box = growBox(sheet.bbox, 15);
  const cell = Math.max(cellMm, 1);
  const g = new Grid(box, cell);
  const wall = new Uint8Array(g.W * g.H);
  for (const it of items) drawPolyline(g, wall, it.pts, it.closed);
  const ext = exterior(g, wall);
  const out: SeedId[] = [];
  const common = model.common.map((id) => set.chains[id]);
  const boxes = common.map((c) => bboxOfPts(c.pts));
  for (const s of seeds) {
    const k0 = g.iy(s.at.y) * g.W + g.ix(s.at.x);
    let region: BoxMm | null = null;
    let mask: Uint8Array | null = null;
    if (!ext[k0]) {
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
    } else region = growBox({ minX: s.at.x, minY: s.at.y, maxX: s.at.x, maxY: s.at.y }, 150);
    const near = common.filter((c, i) => {
      if (!boxOverlap(boxes[i], region!)) return false;
      if (!mask) return true;
      // at least one vertex inside the envelope
      for (const p of c.pts) {
        const x = g.ix(p.x);
        const y = g.iy(p.y);
        if (g.inside(x, y) && mask[y * g.W + x]) return true;
      }
      return false;
    });
    if (gradingEvidence(near, set.classes).graded) out.push(s.id);
  }
  return out;
}

const refuse = (c: PieceCandidate, why: GradeRefusal, at: Seed['at']) => {
  c.outcome = 'leak';
  c.gradeRefusal = why;
  c.leakAt = at;
  c.outer = [];
  c.walls = [];
  c.inside = [];
  c.textsInside = [];
  c.areaMm2 = 0;
  c.sourceCoverage = 0;
  c.p95Mm = 0;
};

export function gradeHook(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  model: WallModel,
  opts: FillOpts,
): GradeHook | null {
  const mode = opts.grade ?? 'solve';
  if (mode === 'off' || model.mode !== 'single' || run.encoding === 'single') return null;
  const n = run.sizes.length > 1 ? run.sizes.length : (opts.sizeCount ?? 0);
  if (n < 2) return null;
  const cell = opts.cellMm || 0.5;
  const guarded = guardedSeeds(sheet, set, seeds, model, cell);
  if (!guarded.length) return null;
  const at = new Map(seeds.map((s) => [s.id, s.at]));
  const guardOnly = (why: GradeRefusal, result: GradeResult | null, amb: ChainAmbiguity[]): GradeHook => ({
    n: model.n,
    walls: null,
    result,
    guarded,
    ambiguities: amb,
    finish: (cands) => {
      for (const id of guarded) for (const c of cands.get(id) ?? []) refuse(c, why, at.get(id)!);
    },
  });
  if (mode === 'guard') return guardOnly('sizes-not-distinguished', null, []);
  const knives = opts.variant ? itemsOf(set, variantKnives(sheet, set, opts.variant)).map((it) => it.pts) : [];
  const G = gradeRanks(sheet, set, seeds, n, { cellMm: cell, knives });
  if (G.diag.bandMode !== n) {
    const amb: ChainAmbiguity = {
      kind: 'size-count',
      message: `the drawing shows ${G.diag.bandMode} lines side by side, the size run says ${n}`,
      classes: [],
      chains: [],
      at: null,
    };
    return guardOnly('size-count', G, [amb]);
  }
  const byRank: WallItem[][] = Array.from({ length: n }, () => []);
  for (const p of G.portions) for (const r of p.ranks) byRank[r].push({ chain: p.chain, pts: p.pts });
  const res = new Map(G.seeds.map((s) => [s.seed, s]));
  return {
    n,
    walls: (r) => byRank[r] ?? [],
    result: G,
    guarded,
    ambiguities: G.ambiguities,
    finish: (cands) => {
      for (const [id, list] of cands) {
        const s = res.get(id);
        const p = at.get(id)!;
        for (const c of list) {
          if (!s || !s.accepted) {
            refuse(c, s?.refusal ?? 'sizes-not-distinguished', p);
            continue;
          }
          c.rankFrom = 'grade';
          if (!s.rankOk[c.rank]) {
            refuse(c, 'sizes-not-distinguished', p);
            continue;
          }
        }
        // F4's contours on the sheet-wide walls must be the solver's regions. The raster region
        // also holds the wall pixels and F4 opens narrow spurs, so the two differ by a rim that
        // is the same for every rank of the piece: compare each rank's offset with the piece's
        // median offset, against the grade step (a contour that took another line moves by one)
        if (!s?.accepted) continue;
        const live = list.filter((c) => c.outcome === 'closed' && s.rankOk[c.rank] && s.finalAreasMm2[c.rank] >= 0);
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
            refuse(c, 'grade-ambiguous', p);
          }
        });
        // and F4's own family still grows rank by rank
        let prev = -1;
        for (const c of list.filter((x) => x.outcome === 'closed').sort((x, y) => x.rank - y.rank)) {
          if (c.areaMm2 <= prev) refuse(c, 'grade-ambiguous', p);
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
