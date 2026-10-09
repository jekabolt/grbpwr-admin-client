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
  markFrames,
  portionPts,
  scoreAreas,
  solveSeed,
  type Combo,
  type PortionPts,
  type SeedSolve,
} from './choose';
import { buildModel, trackPortions, type GradeModel } from './model';
import { chainSpans } from './tracks';
import { bboxOfPts, growBox, unionBox } from './vec';

export { detectUnencodedGrading, type GuardOpts } from './guard';

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
};

export type GradeOpts = {
  cellMm: Mm;
  /** fixed region per seed (probe / tests); default: grown from the seed's cell */
  region?: (seed: Seed) => BoxMm | null;
  /** max components enumerated per seed (2^maxFree combinations) */
  maxFree?: number;
  log?: (s: string) => void;
};

const alt = (c: Combo): GradeAlternative => ({
  bits: c.bits,
  closed: c.closed,
  monotone: c.monotone,
  stepCv: c.cv,
  score: c.score,
  areasMm2: c.areas,
});

/** The free cell around the seed with every line a wall, grown until it stops touching the box. */
function cellBox(M: GradeModel, seed: Seed, cellMm: number, sheetBox: BoxMm): BoxMm | null {
  const all = portionPts(M, new Array(M.nComps).fill(0));
  for (let R = 200; R <= 3200; R *= 2) {
    const box = {
      minX: Math.max(sheetBox.minX - 5, seed.at.x - R),
      minY: Math.max(sheetBox.minY - 5, seed.at.y - R),
      maxX: Math.min(sheetBox.maxX + 5, seed.at.x + R),
      maxY: Math.min(sheetBox.maxY + 5, seed.at.y + R),
    };
    const g = new Grid(box, cellMm);
    const wall = new Uint8Array(g.W * g.H);
    for (const p of all) drawPolyline(g, wall, p.pts);
    const k0 = g.iy(seed.at.y) * g.W + g.ix(seed.at.x);
    if (wall[k0]) return null;
    const ext = exterior(g, wall);
    if (ext[k0]) {
      if (R * 2 > 3200 || (box.minX <= sheetBox.minX && box.maxX >= sheetBox.maxX && box.minY <= sheetBox.minY && box.maxY >= sheetBox.maxY))
        return null;
      continue;
    }
    // the innermost cell: flood over free (non-wall) pixels
    const cell = new Uint8Array(g.W * g.H);
    const blocked = new Uint8Array(g.W * g.H);
    for (let i = 0; i < wall.length; i++) blocked[i] = wall[i];
    floodFree(g, blocked, k0, cell);
    const mb = maskBox(g, cell);
    if (mb.x1 < 0) return null;
    const a = g.centre(mb.x0, mb.y0);
    const b = g.centre(mb.x1, mb.y1);
    return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  }
  return null;
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

/** Seed region grown from its cell: solve → largest closed rank's region + margin → repeat. */
function growSolve(M: GradeModel, seed: Seed, o: Required<Pick<GradeOpts, 'cellMm' | 'maxFree'>>, sheetBox: BoxMm): SeedSolve | null {
  const cb = cellBox(M, seed, o.cellMm, sheetBox);
  if (!cb) return null;
  let box = growBox(cb, 8 + 2 * M.step0 * (M.n - 1));
  let S: SeedSolve | null = null;
  for (let it = 0; it < 4; it++) {
    S = solveSeed(M, seed, box, { cellMm: o.cellMm, maxFree: o.maxFree });
    const best = S.top[0];
    if (!best) break;
    let big = -1;
    for (let r = M.n - 1; r >= 0; r--)
      if (best.areas[r] >= 0) {
        big = r;
        break;
      }
    if (big < 0) break;
    const ps = portionPts(M, best.bits, S.inBox);
    const rb = rankRegionBox(box, o.cellMm, ps, big, seed.at);
    if (!rb) break;
    const want = growBox(rb, 8 + 2 * M.step0 * (M.n - big));
    // stable when the wanted box sits inside the current one and is not much smaller
    if (inside(want, box) && (box.maxX - box.minX) * (box.maxY - box.minY) <= 1.6 * (want.maxX - want.minX) * (want.maxY - want.minY))
      break;
    box = inside(want, box) ? want : unionBox(box, want);
  }
  return S;
}

export function gradeRanks(
  sheet: Sheet,
  set: ChainSet,
  seeds: Seed[],
  n: number,
  opts: GradeOpts,
  progress?: (done: number, total: number, note?: string) => void,
): GradeResult {
  const t0 = Date.now();
  const log = opts.log ?? (() => {});
  const skip = new Set(set.classes.filter((c) => c.role === 'notch').flatMap((c) => c.chains));
  const use = set.chains.filter((c) => !skip.has(c.id) && c.pts.length >= 2).map((c) => c.id);
  const M = buildModel(sheet, set, use, n, { pitchMm: 4, laneAngleDeg: 30, log });
  markFrames(M, seeds);
  let bandMode = 0;
  let bw = -1;
  for (const [k, v] of M.bandHist)
    if (v > bw) {
      bw = v;
      bandMode = k;
    }
  const o = { cellMm: opts.cellMm, maxFree: opts.maxFree ?? 8 };
  const solves: (SeedSolve | null)[] = [];
  seeds.forEach((sd, i) => {
    progress?.(i, seeds.length, `grade ${i + 1}/${seeds.length}`);
    const fixed = opts.region?.(sd) ?? null;
    solves.push(fixed ? solveSeed(M, sd, fixed, o) : growSolve(M, sd, o, sheet.bbox));
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
  const results: GradeSeedResult[] = [];
  const ambiguities: ChainAmbiguity[] = [];
  seeds.forEach((sd, i) => {
    const S = solves[i];
    if (!S || !S.top.length) {
      results.push({
        seed: sd.id,
        components: [],
        chosen: null,
        alternatives: [],
        ambiguous: false,
        accepted: false,
        refusal: 'sizes-not-distinguished',
        areasMm2: new Array(n).fill(-1),
        box: { minX: sd.at.x, minY: sd.at.y, maxX: sd.at.x, maxY: sd.at.y },
        reason: 'no region around the seed',
      });
      return;
    }
    // the seed's family under the GLOBAL bits (a component shared with another piece may have been
    // decided there): it must be what this seed would choose itself
    const ps = portionPts(M, bits, S.inBox);
    const areas: number[] = [];
    for (let r = 0; r < n; r++) {
      const g = new Grid(S.box, opts.cellMm);
      const wall = new Uint8Array(g.W * g.H);
      for (const p of ps) if (p.ranks.includes(r)) drawPolyline(g, wall, p.pts);
      const k0 = g.iy(sd.at.y) * g.W + g.ix(sd.at.x);
      const ext = exterior(g, wall);
      areas.push(wall[k0] || ext[k0] ? -1 : regionOf(g, ext, k0).area * g.cell * g.cell);
    }
    const glob = scoreAreas(bits, areas, n);
    const best = S.top[0];
    const same = best.areas.every((x, r) => Math.abs(x - areas[r]) <= 0.001 * Math.max(1, Math.abs(x)));
    let reason = S.reason;
    let refusal: GradeRefusal | null = null;
    if (S.ambiguous) refusal = 'grade-ambiguous';
    else if (!same) {
      refusal = 'grade-ambiguous';
      reason = 'a component shared with another piece points the other way';
    } else if (glob.closed < n || !glob.monotone) {
      refusal = 'sizes-not-distinguished';
      reason = reason || 'not every rank closes monotonically';
    } else if (glob.cv > 0.5) {
      refusal = 'sizes-not-distinguished';
      reason = `irregular area steps (cv ${glob.cv.toFixed(2)})`;
    }
    results.push({
      seed: sd.id,
      components: S.comps,
      chosen: alt(best),
      alternatives: S.top.slice(1).map(alt),
      ambiguous: S.ambiguous,
      accepted: refusal == null,
      refusal,
      areasMm2: areas,
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
    diag: {
      step0: M.step0,
      reach: M.reach,
      tracks: M.tracks.length,
      fullTuples: M.fullTuples,
      parityConflicts: M.parityConflicts,
      laneConflicts: M.laneConflicts,
      bandMode,
      ms: Date.now() - t0,
    },
  };
}

import { arcLengths as arcAcc, subPolyline as subPts } from './vec';
export { bboxOfPts };
export type { GradeModel };
