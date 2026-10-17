// pieces/gfit/silent (SILENT) — the two checks that keep a silently wrong size off the export.
//
// GRADE REVIEW (17.10, 20 random "hidden wrong" families) found exports that pass every other gate
// and are 19–40 mm off the cut line: a size exported on another size's line (G0 24/26 on 28/30,
// Harper 18 on 22), a size exported as a sliver or through a loop (Anne Waistcoat 5XL 1.3 % of 4XL's
// area; XL taking its own crotch curve AND 5XL's), and runs whose sizes all came out on ONE outline
// over a graded drawing (Albuca, Belladonna, Colfax 34–50 on the 50 line). Two checks:
//
//   1. size-run sanity (`sizeRunProblems`, gate G8) — cheap, no grade model: along a family's run
//      the outline's perimeter grows with rank within a band read off the run itself (no drop past
//      max(12 mm, 1 %), no step past max(3×, +80 mm) the run's median step), and no two sizes are
//      written on one outline (symmetric Hausdorff ≤ 1 mm). Area is G8's own (strictly growing).
//   2. the grade model's neighbour line (`gradeVerdicts`, gate G26) — the P0 gfit check over the
//      family's closed sizes: a size whose outline disagrees with the leave-one-out prediction AND
//      whose off stretch lies on ANOTHER size's drawn line (cause 'neighbour', 7/7 real in the
//      review) is held; a size at a grade break of the sheet (Mood G0's 12/14) is excused unless
//      its own line is drawn where the model predicts it (the export left its own line for a
//      neighbour's). Every other disagreement ('other' 1/8 real, 'notch') is a warning only.
// Pure functions: the gate (written contours), the semantics stage (fill candidates + the wall
// model's size lines) and the archive probe call the same code.
import type { PtMm } from 'lib/pattern-import/types';
import { bboxOf, segNearest, SegGrid, signedArea, simplify } from 'lib/pattern-import/pieces/geom';

import { fitFamily, GFIT_TOL_P0, type GfitFamily, type GfitSizeIn, type GfitTol } from './fit';

// ── 1. size-run sanity ───────────────────────────────────────────────────────────────────────

export const SIZE_RUN = {
  /** A size's outline may come out shorter than the size below by at most max(this, share × it). */
  dropMm: 12,
  dropShare: 0.01,
  /** A perimeter step past max(spikeMul × median step, median + spikeAddMm) is not a grade step. */
  spikeMul: 3,
  spikeAddMm: 80,
  /** Two sizes (no other step to compare): a step past this share of the outline is no grade. */
  spikeShareAlone: 0.15,
  /** Two sizes within this symmetric Hausdorff distance are one outline, mm … */
  collapseMm: 1,
  /** …or of one area (± this share) with this share of each outline on the other (within
   * collapseMm): one outline but for a notch or a step (Albuca: 9 sizes, areas ± 0.01 %, a 3 mm
   * step). Graded neighbours differ by ≥ 0.4 % area (review dumps: 0.4–25 %); one-line runs by
   * ≤ 0.25 % with ≥ 0.79 of the outline shared. */
  collapseAreaShare: 0.003,
  collapseOnShare: 0.85,
  /** …sampled every this many mm. */
  sampleMm: 1,
  /** Perimeters are measured on the outline simplified to this, mm. */
  perimeterTolMm: 0.5,
};

export type SizeRunRow = { key: string; rank: number; ring: readonly PtMm[] };
export type SizeRunProblem = {
  kind: 'perimeter-drop' | 'perimeter-spike' | 'collapse';
  /** The rows the problem names (both sizes of a collapse; the size whose step breaks the run). */
  keys: string[];
  note: string;
};

/** Perimeter of a closed ring, measured on its 0.5 mm simplification: a traced (scan) outline's
 * pixel jitter adds length the drawing does not (leonie: 36 read 411 mm longer than 40). */
const perimeterOf = (p0: readonly PtMm[]) => {
  const p = simplify([...p0, p0[0]], SIZE_RUN.perimeterTolMm).slice(0, -1);
  let L = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return L;
};

function samples(p: readonly PtMm[], step: number): PtMm[] {
  const out: PtMm[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  return out;
}

/** Every sample of `a` lies within `tol` of the closed ring `b`. */
function within(a: readonly PtMm[], b: readonly PtMm[], tol: number, step: number): boolean {
  const g = new SegGrid(Math.max(2, 4 * tol));
  g.addPolyline(0, b, true);
  for (const p of samples(a, step)) {
    let hit = false;
    g.near(p, tol, (_o, s) => {
      if (!hit && segNearest(p, b[s], b[(s + 1) % b.length]).d <= tol) hit = true;
    });
    if (!hit) return false;
  }
  return true;
}

/** Share of `a`'s samples within `tol` of the closed ring `b`. */
export function onShare(a: readonly PtMm[], b: readonly PtMm[], tol: number, step = 1): number {
  const g = new SegGrid(Math.max(2, 4 * tol));
  g.addPolyline(0, b, true);
  const s = samples(a, step);
  let on = 0;
  for (const p of s) {
    let hit = false;
    g.near(p, tol, (_o, i) => {
      if (!hit && segNearest(p, b[i], b[(i + 1) % b.length]).d <= tol) hit = true;
    });
    if (hit) on++;
  }
  return s.length ? on / s.length : 0;
}

/** Two closed rings are one outline: symmetric Hausdorff ≤ tol (cheap box/area screen first). */
export function oneOutline(a: readonly PtMm[], b: readonly PtMm[], tol = SIZE_RUN.collapseMm): boolean {
  if (a.length < 3 || b.length < 3) return false;
  const A = bboxOf(a);
  const B = bboxOf(b);
  if (
    Math.abs(A.minX - B.minX) > tol ||
    Math.abs(A.maxX - B.maxX) > tol ||
    Math.abs(A.minY - B.minY) > tol ||
    Math.abs(A.maxY - B.maxY) > tol
  )
    return false;
  return within(a, b, tol, SIZE_RUN.sampleMm) && within(b, a, tol, SIZE_RUN.sampleMm);
}

const quantile25 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((x, y) => x - y);
  return s[Math.floor(0.25 * (s.length - 1))];
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
};

/**
 * The size-run sanity of one family's written (or closed) sizes, rows in any order. A drop and a
 * collapse need 2 sizes; a spike needs 3 (each step is measured against the run's other steps).
 */
export function sizeRunProblems(rows0: readonly SizeRunRow[], k = SIZE_RUN): SizeRunProblem[] {
  if (silentOff()) return [];
  const rows = rows0.filter((r) => r.ring.length >= 3).sort((a, b) => a.rank - b.rank);
  const out: SizeRunProblem[] = [];
  // collapse: neighbouring sizes on one outline (a run of n alike sizes names each pair once)
  const area = rows.map((r) => Math.abs(signedArea(r.ring)));
  const alike = (i: number) => {
    const a = rows[i - 1].ring;
    const b = rows[i].ring;
    if (Math.abs(area[i] - area[i - 1]) > k.collapseAreaShare * Math.max(area[i], area[i - 1]))
      return false;
    return (
      oneOutline(a, b, k.collapseMm) ||
      (onShare(a, b, k.collapseMm, k.sampleMm) >= k.collapseOnShare &&
        onShare(b, a, k.collapseMm, k.sampleMm) >= k.collapseOnShare)
    );
  };
  for (let i = 1; i < rows.length; i++)
    if (alike(i))
      out.push({
        kind: 'collapse',
        keys: [rows[i - 1].key, rows[i].key],
        note: `sizes ${rows[i - 1].key} and ${rows[i].key} are written on one outline — a graded run whose sizes took one line`,
      });
  if (rows.length < 2) return out;
  const P = rows.map((r) => perimeterOf(r.ring));
  const steps = rows.slice(1).map((r, i) => (P[i + 1] - P[i]) / Math.max(1, r.rank - rows[i].rank));
  // each step against the run's OTHER steps (leave-one-out: a loop's own +256 mm must not set the
  // band it is measured by — three sizes have two steps); drops are absolute, a collapsed run too
  for (let i = 1; i < rows.length; i++) {
    const gap = Math.max(1, rows[i].rank - rows[i - 1].rank);
    const d = P[i] - P[i - 1];
    const others = steps.filter((_, j) => j !== i - 1);
    // the band's base: the other steps' median, at most twice their lower quartile (two loops side
    // by side must not set each other's band — Codex r2; Mood's G0 steps grow ×4–5 along the run, so
    // the quartile alone holds a progressive grade); one step alone (two sizes): a jump past a share
    // of the outline
    const m = Math.max(0, Math.min(median(others), 2 * quantile25(others)));
    if (d < -Math.max(k.dropMm, k.dropShare * P[i - 1]))
      out.push({
        kind: 'perimeter-drop',
        keys: [rows[i].key],
        note: `${rows[i].key}'s outline is ${(-d).toFixed(0)} mm shorter than ${rows[i - 1].key}'s (the other sizes grow ${m.toFixed(0)} mm per size)`,
      });
    else if (
      others.length
        ? d / gap > Math.max(k.spikeMul * m, m + k.spikeAddMm)
        : d / gap > Math.max(k.spikeAddMm, k.spikeShareAlone * P[i - 1])
    )
      out.push({
        kind: 'perimeter-spike',
        keys: [rows[i].key],
        note: `${rows[i].key}'s outline is ${d.toFixed(0)} mm longer than ${rows[i - 1].key}'s (the other sizes grow ${m.toFixed(0)} mm per size): a loop, a detour or a sliver, not a grade step`,
      });
  }
  return out;
}

// ── 2. the grade model's neighbour line ─────────────────────────────────────────────────────

/** Probe switch (node only): SILENT_OFF turns the SILENT checks off (the "before" on one code). */
export function silentOff(): boolean {
  return typeof process !== 'undefined' && !!process.env?.SILENT_OFF;
}

export const GRADE_HOLD = {
  /**
   * A neighbour verdict holds from max(holdMinMm, holdMinStep × the family's step) residual on: an
   * outline on another size's line is about a grade step off its own (the review's real ones: 19–40
   * mm); a 2 mm stretch near a line where two sizes converge is not (archive G0: 2.3 mm at step 13).
   */
  holdMinMm: 3,
  holdMinStep: 0.5,
  /** Neighbour: of the export's stretch away from the prediction (> max(2 mm, the edge tolerance)),
   * at least this share on another size's line and not on its own. */
  offOnNeighbour: 0.6,
  /** Sheet break: the step-weighted median of residual / family step at a rank ≥ this … */
  breakMin: 0.15,
  /** … and ≥ this × the sheet's typical rank. */
  breakOverTypical: 3,
  /** Families with a grade step below this, mm per rank, say nothing about the sheet's breaks. */
  breakMinStepMm: 1,
  /** A sheet with more breaks than this does not grade by steps: nothing is excused. */
  breakMax: 3,
  /** A size at a break is excused while its residual ≤ breakSlack × the break × its step + tol. */
  breakSlack: 2,
  /** Own line at the prediction: share of the predicted outline away from the export (> farMm)
   * that the size's own / common lines cover (within 0.6 mm + 0.25 · step). */
  ownAtPrediction: 0.5,
  farMm: 2,
  /** …over at least this much of the prediction, mm. */
  farMinMm: 5,
};

export type GradeLines = {
  /** Other sizes' drawn lines near the family (not this rank's, not common). */
  neighbour: (rank: number) => readonly (readonly PtMm[])[];
  /** This rank's own drawn lines and the common lines near the family. */
  own: (rank: number) => readonly (readonly PtMm[])[];
};

export type GradeFamilyIn = {
  seed: number;
  /** The family's closed sizes (anchor = closed on its own lines). */
  sizes: GfitSizeIn[];
  lines: GradeLines;
};

export type GradeVerdict = {
  seed: number;
  rank: number;
  cause: 'neighbour' | 'notch' | 'other';
  /** Held (an operator question), else a warning only. */
  hold: boolean;
  score: number;
  /** Worst residual, mm (strong grade point or edge p95). */
  residMm: number;
  how?: string;
  /** Share of the prediction (away from the export) drawn by the size's own / common lines. */
  ownAtPrediction?: number;
  /** The sheet's grade break this size sits on (median residual / step there). */
  atBreak?: number;
  excused?: boolean;
  note: string;
};

export type GradeResult = {
  verdicts: GradeVerdict[];
  /** rank → the sheet's break (step-weighted median residual / step). */
  breaks: Map<number, number>;
  families: Map<number, GfitFamily>;
  ms: number;
};

const residOf = (v: GfitFamily['sizes'][number]) =>
  Math.max(0, ...v.points.filter((x) => x.strong).map((x) => x.resid), ...v.edges.map((e) => e.p95));

/** Weighted median of (value, weight). */
function wmedian(xs: { v: number; w: number }[]): number {
  const s = xs.slice().sort((a, b) => a.v - b.v);
  const tot = s.reduce((a, x) => a + x.w, 0);
  let acc = 0;
  for (const x of s) {
    acc += x.w;
    if (acc >= tot / 2) return x.v;
  }
  return 0;
}

/**
 * Grade breaks of the sheet's size chart, scale-free: per family with a model and a real grade step,
 * per checked size, b = residual (mm) / the family's step (mm per rank) — a break of the chart shifts
 * every piece by about the same share of its own step, a small piece by little in mm. The sheet's
 * break at a rank = the step-weighted median of b there (big pieces carry it; P0's plain median of
 * scores was dragged down by small pieces: Forrest 9 of 15 families < 0.35 at 12/14).
 */
export function sheetBreaks(
  fams: readonly GfitFamily[],
  k = GRADE_HOLD,
): Map<number, number> {
  const per = new Map<number, { v: number; w: number }[]>();
  for (const f of fams) {
    if (!f.model || !(f.stepMm >= k.breakMinStepMm)) continue;
    for (const v of f.sizes) {
      if (!v.how) continue;
      const a = per.get(v.rank) ?? [];
      a.push({ v: residOf(v) / f.stepMm, w: f.stepMm });
      per.set(v.rank, a);
    }
  }
  const med = new Map<number, number>();
  for (const [r, xs] of per) if (xs.length >= 3) med.set(r, wmedian(xs));
  const out = new Map<number, number>();
  if (!med.size) return out;
  const typical = median([...med.values()]);
  for (const [r, m] of med)
    if (m >= k.breakMin && m >= k.breakOverTypical * typical) out.set(r, m);
  return out.size > k.breakMax ? new Map() : out;
}

/** A predicate "p within tol of one of these polylines" (tol per query, ≤ 8 mm). */
function nearAny(
  lines: readonly (readonly PtMm[])[],
  closed: boolean,
): (p: PtMm, tol: number) => boolean {
  if (!lines.length) return () => false;
  const g = new SegGrid(4);
  lines.forEach((l, i) => g.addPolyline(i, l, closed));
  return (p, tol) => {
    let hit = false;
    g.near(p, tol, (i, s) => {
      if (hit) return;
      const l = lines[i];
      const b = s + 1 < l.length ? l[s + 1] : l[0];
      if (segNearest(p, l[s], b).d <= tol) hit = true;
    });
    return hit;
  };
}

/**
 * The export's stretch away from the grade prediction: its length (mm) and the share of it on
 * another size's line and not on its own / a common line (within 0.6 mm).
 */
function offStretch(
  fam: GfitFamily,
  v: GfitFamily['sizes'][number],
  outer: readonly PtMm[],
  own: readonly (readonly PtMm[])[],
  neighbour: readonly (readonly PtMm[])[],
  k = GRADE_HOLD,
): { lenMm: number; neighbour: number } | undefined {
  const ps = fam.predict(v.rank);
  const p = ps.find((x) => v.from && x.from[0] === v.from[0] && x.from[1] === v.from[1]) ?? ps[0];
  if (!p || !p.pts.length) return undefined;
  const pred = nearAny([p.pts], true);
  const onOwn = nearAny(own, false);
  const onNb = nearAny(neighbour, false);
  const far = Math.max(k.farMm, ...v.edges.map((e) => e.tol));
  let n = 0;
  let nb = 0;
  for (const q of samples(outer, 1)) {
    if (pred(q, far)) continue;
    n++;
    if (!onOwn(q, 0.6) && onNb(q, 0.6)) nb++;
  }
  return { lenMm: n, neighbour: n ? nb / n : 0 };
}

/** Share of the prediction (where it is away from the drawn outline) on the size's own lines. */
function ownAtPrediction(
  fam: GfitFamily,
  v: GfitFamily['sizes'][number],
  outer: readonly PtMm[],
  own: readonly (readonly PtMm[])[],
  k = GRADE_HOLD,
): number | undefined {
  const ps = fam.predict(v.rank);
  const p = ps.find((x) => v.from && x.from[0] === v.from[0] && x.from[1] === v.from[1]) ?? ps[0];
  if (!p || !p.pts.length) return undefined;
  const drawn = nearAny([outer], true);
  const ownNear = nearAny(own, false);
  let far = 0;
  let on = 0;
  let farLen = 0;
  for (let i = 0; i < p.pts.length; i++) {
    const q = p.pts[i];
    if (drawn(q, k.farMm)) continue;
    const nx = p.pts[(i + 1) % p.pts.length];
    farLen += Math.hypot(nx.x - q.x, nx.y - q.y);
    far++;
    // the corridor grows with the step (a quarter step: the own line is the drawn grade)
    const tol = Math.round((0.6 + 0.25 * (p.step[i] ?? 0)) * 4) / 4;
    if (ownNear(q, tol)) on++;
  }
  if (!far || farLen < k.farMinMm) return undefined;
  return on / far;
}

/**
 * The grade model's verdict on every disagreeing closed size of the sheet's families — held only
 * for a size on another size's line (see the header); the sheet's breaks are read over all of them.
 */
export function gradeVerdicts(
  fams: readonly GradeFamilyIn[],
  opts: { tol?: GfitTol; k?: typeof GRADE_HOLD } = {},
): GradeResult {
  const t0 = Date.now();
  const tol = opts.tol ?? GFIT_TOL_P0;
  const k = opts.k ?? GRADE_HOLD;
  const families = new Map<number, GfitFamily>();
  for (const f of fams) {
    if (f.sizes.length < 3 || f.sizes.filter((s) => s.anchor).length < 2) continue;
    try {
      families.set(f.seed, fitFamily(f.sizes, { tol, neighbourLines: f.lines.neighbour }));
    } catch {
      // a family the probe cannot read has no model: no verdict, no hold
    }
  }
  const breaks = sheetBreaks([...families.values()], k);
  const verdicts: GradeVerdict[] = [];
  for (const f of fams) {
    const fam = families.get(f.seed);
    if (!fam?.model) continue;
    for (const v of fam.sizes) {
      // a short stretch on a neighbour's line can hide under an edge's p95 (Codex r2): an 'ok'
      // size whose worst edge sample is a hold's distance off is read on the drawing too
      const floorMm = Math.max(k.holdMinMm, k.holdMinStep * fam.stepMm);
      const shortJog =
        v.status === 'ok' && v.edges.some((e) => e.max >= floorMm && e.run >= k.farMinMm);
      if (v.status !== 'disagrees' && !shortJog) continue;
      const resid = residOf(v);
      const brk = breaks.get(v.rank);
      const excused =
        brk != null && resid <= k.breakSlack * brk * fam.stepMm + tol.ptMm * (tol.extrapMul ?? 1);
      // the export's own stretch away from the grade, read on the drawing: on another size's line
      // and NOT on its own (a size whose own line converges with a neighbour's, or whose extreme
      // size the model extrapolates badly, rides its own line there — Trillium 0/2, Lita 16/18)
      const outer = f.sizes.find((s) => s.rank === v.rank)?.outer;
      const off = outer
        ? offStretch(fam, v, outer, f.lines.own(v.rank), f.lines.neighbour(v.rank), k)
        : undefined;
      const onNeighbour = !!off && off.lenMm >= k.farMinMm && off.neighbour >= k.offOnNeighbour;
      const cause = onNeighbour ? 'neighbour' : v.cause === 'neighbour' ? 'other' : v.cause ?? 'other';
      if (shortJog && cause !== 'neighbour') continue;
      let own: number | undefined;
      let hold = false;
      if (cause === 'neighbour') {
        own = outer ? ownAtPrediction(fam, v, outer, f.lines.own(v.rank), k) : undefined;
        hold =
          (shortJog || resid >= floorMm) &&
          (!excused || (own ?? 0) >= k.ownAtPrediction);
      }
      verdicts.push({
        seed: f.seed,
        rank: v.rank,
        cause,
        hold,
        score: v.score,
        residMm: resid,
        ...(v.how ? { how: v.how } : {}),
        ...(own != null ? { ownAtPrediction: own } : {}),
        ...(brk != null ? { atBreak: brk } : {}),
        ...(excused ? { excused } : {}),
        note:
          cause === 'neighbour'
            ? `${(off?.lenMm ?? 0).toFixed(0)} mm of its outline lies on another size's line (${Math.round(100 * (off?.neighbour ?? 0))} % of where it leaves the grade), ${resid.toFixed(1)} mm off the grade of the other sizes${own != null ? ` (its own line drawn along ${Math.round(100 * own)} % of where the grade puts it)` : ''}`
            : `${resid.toFixed(1)} mm off the grade of the other sizes (${cause}${excused ? ', at a grade break of the sheet' : ''})`,
      });
    }
  }
  return { verdicts, breaks, families, ms: Date.now() - t0 };
}

/** Area of a ring (absolute), for callers that only hold rings. */
export const ringArea = (p: readonly PtMm[]) => Math.abs(signedArea(p));
