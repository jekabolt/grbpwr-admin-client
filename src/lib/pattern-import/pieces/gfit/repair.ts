// pieces/gfit (GRADE P2): repair of a leaking size (or one closed on another size's line) that
// sits strictly between two trusted anchors — the core of hook A (pieces/gfit/repair-hook.ts, called
// by pieces/fill.ts after the continuity / bridge passes); the honesty probe `patimport:gradep2`
// runs the same function. The grade model predicts where the size runs; the
// size's OWN, COMMON and PROVEN-OVERLAY lines inside the corridor (0.6 mm + 0.25·step) are the
// walls; the repaired outline follows the drawn walls and bridges only short holes with the
// prediction (flagged derived). Accepted only when E1–E4 (GRADE-DESIGN §P2) all hold:
//   E1 ≥ 92 % of the perimeter on walls (+ the pen judge ≥ 0.85 when given);
//   E2 every hole ≤ 15 mm, holes ≤ 4 % of the perimeter, both ends of every hole are ENDS of a
//      wall (a wall that runs on but leaves the corridor is not an end);
//   E3 area between the bracketing anchors (in grade order), within the model's tolerance (the
//      leave-one-out check of the repaired size), one closed simple ring, same topology;
//   E4 no own wall leaves the corridor for longer than 10 mm (a notch excursion is exempt).
// A wall that runs on between both sides of a gap (same wall, short path) is drawn geometry — the
// repaired ring follows it (a notch stays a notch excursion, the canonical reading chords it off).
import type { PtMm } from 'lib/pattern-import/types';
import { segIntersect, segNearest, SegGrid } from 'lib/pattern-import/pieces/geom';

import {
  canonTopology,
  chordBumps,
  insideWithin,
  outlineOf,
  predictPair,
  ringDistance,
  selfIntersects,
} from './checks';
import { predictAll } from './grade-all';
import { fitFamily, GFIT_TOL_P0, type GfitFamily, type GfitSizeIn, type GfitTol } from './fit';
import { analyseOutline, ringOf } from './outline';

/**
 * own = the size's own lines; common = lines every size closes on; overlay = another size's (or an
 * unranked) line the size may run on only where BOTH bracketing anchors' outlines run on it too
 * (within `overlayMm`): the sizes coincide there, the drawing draws the edge once (a shared stretch
 * in one size's pen) — the grade puts this size between them, on it.
 */
export type GfitWallKind = 'own' | 'common' | 'overlay' | 'loose';
export type GfitWall = { pts: readonly PtMm[]; kind: GfitWallKind; closed?: boolean };

export const GFIT_REPAIR = {
  corridorMm: 0.6,
  corridorStep: 0.25,
  /**
   * …but never as far as half a size step (the neighbouring size's line lies one step away): at a
   * step under ~1.2 mm the design corridor reached the neighbour's line, and a stretch glued onto it
   * passed with a 1.06–1.18 mm error (honesty probe, CAD swap, 2 of 420). Floor `corridorMinMm` —
   * the reading noise of a drawn line (kombinezon edge p95 0.37 mm).
   */
  corridorHalfStep: 0.5,
  corridorMinMm: 0.45,
  /** Draw mode D-cross: the covered side of a hole end is read over this much arc of the prediction. */
  coveredMm: 3,
  minCover: 0.92,
  minPen: 0.85,
  maxHoleMm: 15,
  maxHoleShare: 0.04,
  /** A hole end is a wall end when the wall stops within this (+ the corridor) of the snap. */
  endMm: 1.0,
  offRunMm: 10,
  /** An overlay wall covers a sample only where both bracketing anchors lie within this, mm. */
  overlayMm: 0.5,
  /** Notch excursion of a wall (exempt from E4): path, mouth, depth, mm. */
  notchPathMm: 24,
  notchMouthMm: 15,
  notchDepthMm: 8,
  /**
   * Draw mode (RepairOpts.draw, hook A): the most of a size's perimeter drawn from the grade, in
   * all (owner, 11 Nov 2026). Gate G15 bounds the 'grade-draw' edges of a block by the same share.
   */
  drawMaxShare: 0.15,
  /**
   * Draw mode, D-cross-nest: a drawn stretch that crosses the outline of a bracketing anchor at
   * this angle or steeper cuts through the nest of sizes. Under it the two lines run side by side
   * (a stretch the sizes share, drawn once, differs from itself by reading noise: shot-draw,
   * 22 of 69 drawn cells cross transversally, every crossing under 20° was collinear noise).
   */
  nestCrossDeg: 20,
  /**
   * …and only farther than this from the stretch's own ends: where the fill leaves or meets a wall
   * it joins the anchors' line (the same reach as the edge tolerance of GFIT_TOL_PDF, 2 mm).
   */
  nestEndMm: 2,
  /**
   * …and farther than this from a corner of the result (≥ 35° turn over 3 mm arms): at a corner the
   * sizes' outlines converge on a near-common hem and a correct stretch crosses them steeply
   * (13 Nov pictures: every refusal seen sat 2–8 mm from a corner, all false). Replay of 607 tries
   * on 20 files: 6 mm +12 drawn, 10 mm +14, 15 mm +19 of the 26 refused; 0 lost each.
   * NEST_CORNER_MM=<mm> overrides (0 = no corner allowance, the 12 Nov rule).
   */
  nestCornerMm: 15,
  /**
   * Draw mode, EXTRAPOLATION (owner, 12 Nov 2026): a size at the end of the range (no anchor on one
   * side) is drawn from the grade of the two nearest anchors carried one step on — only one step
   * beyond the last trusted size, only with this many trusted sizes (the step must be seen to hold),
   * and no drawn stretch longer than `extrapolateMaxHoleMm`. Leave-one-out on Leah / Dyanna /
   * Cassandra (journal, 12 Nov): one step past the edge, p95 off the real line by > 2 mm in 2.0 / 4.6 /
   * 6.6 % of hidden 20 / 40 / 80 mm stretches (> 5 mm: 0 / 1.6 / 3.0 %) — the bound keeps it ≤ 40.
   */
  extrapolateMinTrusted: 3,
  extrapolateMaxHoleMm: 40,
  /**
   * Draw mode, VARIANT D (owner, 12 Nov 2026; grade-all.ts): the edge step, and a family whose anchors
   * disagree (fitFamily 'inconsistent'), are predicted from ALL anchors, robustly, instead of the
   * pair. An inconsistent family is drawn only when its worst still-trusted anchor scores ≤
   * `gradeAllMaxScore` × tolerance (one size a little off = reader noise; Olympia 9 ×, Memoir C
   * drawn alike stay refused). Below 4 mapped sizes D equals the pair: an inconsistent family refuses.
   */
  gradeAllMaxScore: 2,
};

export type GfitRepairRefusal =
  | 'no-model'
  | 'not-bracketed'
  | 'E1-cover'
  | 'E1-pen'
  | 'E2-hole'
  | 'E2-holes-sum'
  | 'E2-hole-end'
  | 'E2-end-offset'
  | 'E3-area'
  | 'E3-tol'
  | 'E3-continuity'
  | 'E3-deviation'
  | 'E3-topology'
  | 'E4-off-corridor'
  // draw mode (RepairOpts.draw): the holes together exceed the share of the perimeter it may draw
  | 'D-share'
  // draw mode: a hole end (not a wall end) sits on a wall running ACROSS the prediction
  | 'D-cross'
  // draw mode: a drawn stretch crosses an own / common wall away from its ends
  | 'D-cross-wall'
  // draw mode: a drawn stretch crosses the outline of a bracketing anchor (the nest of sizes breaks)
  | 'D-cross-nest'
  // draw mode, extrapolated size: a drawn stretch longer than GFIT_REPAIR.extrapolateMaxHoleMm
  | 'X-hole'
  // GFIT_EDGE_ACCEPT: the accepted outline lies on the neighbouring anchor, not one step past it
  | 'E5-on-anchor'
  // GFIT_LOCAL_CORRIDOR: the accepted outline does not nest between its two anchors
  | 'E5-nest';

export type GfitRepairHole = {
  lenMm: number;
  at: PtMm;
  endsOk: [boolean, boolean];
  /** Distance of the drawn line from the prediction where it enters / leaves the hole, mm. */
  endOff: [number, number];
  /** The fill as written: the wall point it leaves, the filled samples, the wall point it lands on. */
  pts: PtMm[];
};

export type GfitRepair = {
  ok: boolean;
  refusals: GfitRepairRefusal[];
  rank: number;
  from?: [number, number];
  /** The size lies outside `from` (both anchors on one side): the grade carried one step on. */
  extrapolated?: boolean;
  /** The predicted ring (interpolation between the bracketing anchors) and its corridor per sample. */
  pred?: PtMm[];
  corridor?: number[];
  /** The repaired ring (also when refused — for the operator's picture) and its derived samples. */
  outer?: PtMm[];
  derived?: boolean[];
  /** Share of the predicted perimeter on walls (holes excluded). */
  cover: number;
  holes: GfitRepairHole[];
  holeShare: number;
  /** Gaps closed by the same wall running on (drawn, e.g. a notch excursion), not holes. */
  wallBridges: number;
  /** Longest stretch of an own wall outside the corridor (notch excursions exempt), mm. */
  offRunMm: number;
  /** Largest excess of the repaired outline (notches chorded) over the corridor, mm. */
  devMm?: number;
  /** The model's leave-one-out score of the repaired size (≤ 1 = within tolerance). */
  score?: number;
  /**
   * Draw mode: how differently another pair of trusted anchors draws the same holes (same ends),
   * the largest distance, mm. Undefined when no other pair exists. The operator's "check this" cue.
   */
  spreadMm?: number;
  /** Indices (into the `walls` given) of the walls the repaired outline runs on. */
  usedWalls: number[];
  /** The anchors the grade model trusts (after the robust fit). */
  trusted?: number[];
  /** GFIT_LOCAL: the pair an inconsistent family's size was judged by, and whether each anchor is
   * one fitFamily trusts (an untrusted one may be closed wrong — picture it); `common` = the share of
   * the perimeter snapped onto common walls (they cover any pair). */
  local?: {
    r1: number;
    r2: number;
    t1: boolean;
    t2: boolean;
    common?: number;
    /** GFIT_LOCAL_CORRIDOR: median leave-one-out p95 of the trusted anchors, mm. */
    scatterMm?: number;
  };
  /** Why there is no model ('inconsistent', 'anchors<2', … — fitFamily; 'no-pair-match'). */
  modelWhy?: string;
  /** Draw mode: the prediction came from all anchors (variant D, grade-all.ts), this many sizes. */
  gradeAll?: { sizes: number; breaks: number };
  /** Draw mode: D's line was refused for these reasons and the pair's line was drawn instead. */
  gradeAllRefused?: GfitRepairRefusal[];
};

export type RepairOpts = {
  tol?: GfitTol;
  /** The pen judge (G22) for this size, 0 … 1; undefined = not judged (synthetic probes). */
  pen?: number;
  frame?: 'stacked' | 'registered';
  /** The family's grade model of the same sizes, shared by the tries of one family (hook A). */
  fitCache?: Map<string, GfitFamily>;
  /** Stop at the first failing E1/E2 (the rest of the checks cannot accept it; hook A: time). */
  fast?: boolean;
  /**
   * DRAW mode (owner, 11 Nov 2026: "the tool closes gaps and draws missing lines itself"): the size
   * is bracketed and the grade model of the piece holds, but its line is missing over more than the
   * strict E2 allows (a size printed only in part, a stretch drawn once for all sizes). The holes
   * are drawn from the grade up to `maxShare` of the perimeter in total (E1 = 1 − maxShare); the per-
   * hole length / count / wall-end rules of E2 give way to: no drawn stretch crosses a drawn line of
   * the size (D-cross), the line arrives on the prediction at both ends (E2-end-offset stays), E3
   * and E4 unchanged. A size at the end of the range (no anchor on one side) is drawn only with
   * `extrapolate`, one step past the last trusted size (GFIT_REPAIR.extrapolate*).
   */
  draw?: { maxShare: number; extrapolate?: boolean };
};

type Snap = { w: number; arc: number; q: PtMm; d: number };

const hyp = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Repair size `rank` of a family. `others` are the family's other sizes (anchors flagged as in
 * fitFamily); the leaking size is NOT among them. `walls` are the lines the size may run on.
 */
export function repairSize(
  others: readonly GfitSizeIn[],
  rank: number,
  walls: readonly GfitWall[],
  opts: RepairOpts = {},
): GfitRepair {
  const res = repairWith(others, rank, walls, opts, true);
  // D first, the pair as the fallback: at the edge step the pair drew these cells before D (replay
  // 12 Nov 2026: 7 of them refused under D — D-share/X-hole/E3), so a D line the checks refuse is
  // retried with the pair. An inconsistent family has no pair fallback (the pair was never allowed).
  if (res.gradeAll && !res.ok && res.modelWhy !== 'inconsistent') {
    const pair = repairWith(others, rank, walls, opts, false);
    if (pair.ok) return { ...pair, gradeAllRefused: res.refusals };
  }
  return res;
}

function repairWith(
  others: readonly GfitSizeIn[],
  rank: number,
  walls: readonly GfitWall[],
  opts: RepairOpts,
  useAll: boolean,
): GfitRepair {
  const tol = opts.tol ?? GFIT_TOL_P0;
  const C = GFIT_REPAIR;
  const res: GfitRepair = {
    ok: false,
    refusals: [],
    rank,
    cover: 0,
    holes: [],
    holeShare: 0,
    wallBridges: 0,
    offRunMm: 0,
    usedWalls: [],
  };
  const refuse = (r: GfitRepairRefusal) => {
    if (!res.refusals.includes(r)) res.refusals.push(r);
  };
  const ins = others.filter((s) => s.rank !== rank);
  const fitKey = ins
    .map((x) => x.rank)
    .sort((a, b) => a - b)
    .join(',');
  let fam = opts.fitCache?.get(fitKey);
  if (!fam) {
    fam = fitFamily(ins, { tol, ...(opts.frame ? { frame: opts.frame } : {}) });
    opts.fitCache?.set(fitKey, fam);
  }
  // anchors that disagree a little are drawn over all of them (variant D, below); else no model
  const inconsistent = fam.model && fam.why === 'inconsistent';
  const worstTrusted = Math.max(
    0,
    ...fam.sizes.filter((v) => fam.trusted.includes(v.rank)).map((v) => v.score),
  );
  // GFIT_LOCAL: an inconsistent family is judged at the size, not over the range — the nearest
  // trusted anchor on each side is the pair (else the nearest anchor, flagged in res.local), the
  // E3 tolerance check is the pair's own leave-one-out, and E1–E4 stand as they are: a wrong pair
  // puts the corridor off the size's own lines and the cover refuses. Not in draw mode (f3, 16 Nov):
  // there the drawn share is the pair's line, unchecked by any drawn wall.
  const local =
    inconsistent && typeof process !== 'undefined' && !!process.env?.GFIT_LOCAL && !opts.draw;
  if (
    !fam.model ||
    (inconsistent && !local && (!opts.draw || worstTrusted > C.gradeAllMaxScore))
  ) {
    res.modelWhy = fam.why ?? 'no-model';
    refuse('no-model');
    return res;
  }
  if (inconsistent) res.modelWhy = local ? 'inconsistent-local' : 'inconsistent';
  res.trusted = fam.trusted;
  let pairPool = fam.trusted;
  if (local) {
    const pool = ins
      .filter((x) => x.anchor && !fam.droppedAmbiguous?.includes(x.rank))
      .map((x) => x.rank);
    const side = (below: boolean) => {
      const xs = pool.filter((r) => (below ? r < rank : r > rank));
      const tr = xs.filter((r) => fam.trusted.includes(r));
      const pick = (a: number[]) => (a.length ? (below ? Math.max(...a) : Math.min(...a)) : null);
      return pick(tr) ?? pick(xs);
    };
    const a = side(true);
    const b = side(false);
    pairPool = [a, b].filter((r): r is number => r != null);
    if (a != null && b != null)
      res.local = { r1: a, r2: b, t1: fam.trusted.includes(a), t2: fam.trusted.includes(b) };
  }
  const trusted = [...pairPool].sort((a, b) => a - b);
  const lo = trusted.filter((r) => r < rank);
  const hi = trusted.filter((r) => r > rank);
  let r1: number;
  let r2: number;
  // GFIT_EDGE_ACCEPT (off by default): outside draw mode, accept the size's own line one step
  // past the last anchor, on the same extrapolation draw mode uses. The corridor stays as it is.
  let edgeAccepted = false;
  if (lo.length && hi.length) [r1, r2] = [lo[lo.length - 1], hi[0]];
  else {
    // the end of the range: draw mode may carry the grade of the two nearest anchors one step on
    const edge = hi.length ? hi[0] : lo[lo.length - 1];
    const edgeAccept =
      !opts.draw && typeof process !== 'undefined' && !!process.env?.GFIT_EDGE_ACCEPT;
    if (
      local ||
      !(opts.draw?.extrapolate || edgeAccept) ||
      trusted.length < C.extrapolateMinTrusted ||
      Math.abs(rank - edge) !== 1
    ) {
      refuse('not-bracketed');
      return res;
    }
    [r1, r2] = hi.length ? [hi[0], hi[1]] : [lo[lo.length - 2], lo[lo.length - 1]];
    res.extrapolated = true;
    edgeAccepted = edgeAccept;
  }
  // the pair grade model of the two anchors (checks.ts predictPair; w outside [0, 1] extrapolates)
  const o1 = outlineOf(ins.find((x) => x.rank === r1)!.outer);
  const o2 = outlineOf(ins.find((x) => x.rank === r2)!.outer);
  const P = o1 && o2 ? predictPair(o1, o2, (rank - r1) / (r2 - r1), r2 - r1, fam.frame) : null;
  if (!P) {
    res.modelWhy = 'no-pair-match';
    refuse('no-model');
    return res;
  }
  res.from = [r1, r2];
  // the bracketing anchors' outlines (overlay walls are cover only where both run on them)
  const ring1 = ins.find((x) => x.rank === r1)!.outer;
  const ring2 = ins.find((x) => x.rank === r2)!.outer;
  const g1 = new SegGrid(3);
  g1.addPolyline(0, ring1, true);
  const g2 = new SegGrid(3);
  g2.addPolyline(0, ring2, true);
  const onRing = (g: SegGrid, ring: readonly PtMm[], q: PtMm) => {
    let hit = false;
    g.near(q, C.overlayMm, (_o, i) => {
      if (!hit && segNearest(q, ring[i], ring[(i + 1) % ring.length]).d <= C.overlayMm) hit = true;
    });
    return hit;
  };
  // variant D where the pair is fragile: the edge step, an inconsistent family (GFIT_REPAIR.gradeAll*)
  let pts = P.pts;
  if (useAll && !local && opts.draw && o1 && o2 && (res.extrapolated || inconsistent)) {
    const members = ins
      .filter((x) => x.anchor && !fam.droppedAmbiguous?.includes(x.rank)) // its corners are unsure
      .map((x) => ({ rank: x.rank, o: outlineOf(x.outer) }))
      .filter((x): x is { rank: number; o: NonNullable<typeof x.o> } => !!x.o);
    const D = predictAll(o1, o2, r1, r2, members, rank, fam.frame);
    if (D && D.pts.length === P.pts.length) {
      pts = D.pts;
      res.gradeAll = { sizes: D.sizes, breaks: D.breaks };
    } else if (inconsistent) {
      refuse('no-model');
      return res;
    }
  }
  const n = pts.length;
  // GFIT_LOCAL_CORRIDOR (off by default; only with GFIT_LOCAL): the corridor grows to the family's
  // own leave-one-out scatter, and never as far as the neighbour's line (0.45 of the local step).
  const localCorridor =
    local && typeof process !== 'undefined' && !!process.env?.GFIT_LOCAL_CORRIDOR;
  const scatter = localCorridor ? familyScatter(ins, fam.trusted, fam.frame) : null;
  if (scatter != null && res.local) res.local.scatterMm = scatter;
  const cor = P.stepN.map((s) => {
    const base = Math.min(
      C.corridorMm + C.corridorStep * s,
      Math.max(C.corridorMinMm, C.corridorHalfStep * s),
    );
    return scatter == null ? base : Math.min(Math.max(base, scatter), 0.45 * s);
  });
  res.pred = pts;
  res.corridor = cor;

  // walls: polylines (closed ones repeat their first point) with cumulative arc
  const W = walls
    .filter((w) => w.pts.length >= 2)
    .map((w) => {
      const p = w.closed ? [...w.pts, w.pts[0]] : w.pts.slice();
      const cum = [0];
      for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + hyp(p[i - 1], p[i]));
      return { p, cum, L: cum[cum.length - 1], kind: w.kind, closed: !!w.closed };
    });
  const grid = new SegGrid(3);
  W.forEach((w, k) => grid.addPolyline(k, w.p));
  /** Own walls that come within the corridor somewhere (E4 audits them all — Codex r1). */
  const touched = new Set<number>();
  // GRADE_P2_LOOSE: an unranked line covers a sample only inside the corridor and at least a
  // quarter step from both anchors (where the grade has not separated, that ink is the neighbour's).
  const looseOn = typeof process !== 'undefined' && !!process.env?.GRADE_P2_LOOSE;
  let looseOk: boolean[] | null = null;
  if (looseOn && walls.some((w) => w.kind === 'loose')) {
    const d1 = ringDistance(ring1);
    const d2 = ringDistance(ring2);
    looseOk = pts.map((p, i) => {
      const lim = 0.25 * P.stepN[i];
      return d1(p, lim + 1) >= lim && d2(p, lim + 1) >= lim;
    });
  }
  const snapAt = (p: PtMm, r: number, i: number): Snap | null => {
    // per wall the TRUE nearest point (over all its segments); a nearest point at a wall's END is
    // no cover beyond the base corridor — past the end the line is not drawn (else the hole shrinks
    // and its fill starts from a point the line never reached, cutting the corner the hole took)
    const per = new Map<number, Snap>();
    grid.near(p, r, (k, s) => {
      const w = W[k];
      const x = segNearest(p, w.p[s], w.p[s + 1]);
      const cur = per.get(k);
      if (!cur || x.d < cur.d)
        per.set(k, { w: k, arc: w.cum[s] + x.u * (w.cum[s + 1] - w.cum[s]), q: x.q, d: x.d });
    });
    let best: Snap | null = null;
    for (const sn of per.values()) {
      // every own wall that reaches the corridor is audited by E4, chosen here or not
      if (sn.d <= r && W[sn.w].kind === 'own') touched.add(sn.w);
      const w = W[sn.w];
      const atEnd = !w.closed && (sn.arc <= 1e-6 || sn.arc >= w.L - 1e-6);
      if (sn.d > r || (atEnd && sn.d > C.corridorMm)) continue;
      if (w.kind === 'loose' && (!looseOn || !looseOk?.[i])) continue;
      if (w.kind === 'overlay' && !(onRing(g1, ring1, sn.q) && onRing(g2, ring2, sn.q))) continue;
      if (!best || sn.d < best.d) best = sn;
    }
    return best;
  };
  const snaps: (Snap | null)[] = pts.map((p, i) => snapAt(p, cor[i], i));
  const segLen = (i: number) => hyp(pts[i], pts[(i + 1) % n]);
  let L = 0;
  for (let i = 0; i < n; i++) L += segLen(i);
  const start = snaps.findIndex((s) => !!s);
  if (start < 0) {
    refuse('E1-cover');
    return res;
  }
  // the wall's own path between two arcs (open walls: straight; closed: the shorter way)
  const wallPath = (k: number, a0: number, a1: number): PtMm[] => {
    const w = W[k];
    const at = (s: number) => {
      let j = 1;
      while (j < w.p.length - 1 && w.cum[j] < s) j++;
      const seg = w.cum[j] - w.cum[j - 1];
      const t = seg > 1e-9 ? (s - w.cum[j - 1]) / seg : 0;
      return {
        x: w.p[j - 1].x + (w.p[j].x - w.p[j - 1].x) * t,
        y: w.p[j - 1].y + (w.p[j].y - w.p[j - 1].y) * t,
      };
    };
    let d = a1 - a0;
    if (w.closed && Math.abs(d) > w.L / 2) d = d > 0 ? d - w.L : d + w.L;
    const m = Math.max(1, Math.ceil(Math.abs(d) / 0.5));
    const out: PtMm[] = [];
    for (let j = 1; j < m; j++) {
      let s = a0 + (d * j) / m;
      if (w.closed) s = ((s % w.L) + w.L) % w.L;
      out.push(at(s));
    }
    return out;
  };
  const wallArcGap = (k: number, a0: number, a1: number) => {
    const w = W[k];
    const d = Math.abs(a1 - a0);
    return w.closed ? Math.min(d, w.L - d) : d;
  };
  const isEnd = (s: Snap, r: number) => {
    const w = W[s.w];
    if (w.closed) return false;
    return Math.min(s.arc, w.L - s.arc) <= C.endMm + r;
  };

  /**
   * The wall at snap `s` runs along the prediction at sample i (≤ 30°, either direction), or is a
   * notch tick: a wall no longer than a notch's depth crosses the cut line by design, the size's
   * line runs on through it (Leah: the hole ends meet 6 mm common ticks at 85–89°).
   */
  const along = (s: Snap, i: number, cov: -1 | 1) =>
    W[s.w].L <= C.notchDepthMm || alongCos(s, i, cov) >= Math.cos(Math.PI / 6);
  /**
   * |cos| of the angle between the wall at `s` and the prediction at sample i (0 when degenerate),
   * the best of the one-sided directions: at a corner the centred tangent is the bisector, ~45° off
   * both edges, while the wall runs along one of them (Leah TOP FRONT 14: 36–42° at the corner); a
   * line across the prediction is across on both sides and still fails.
   */
  const alongCos = (s: Snap, i: number, cov: -1 | 0 | 1 = 0) => {
    const w = W[s.w];
    let j = 1;
    while (j < w.p.length - 1 && w.cum[j] < s.arc) j++;
    // a closed wall repeats its first point: step over a zero-length segment
    while (j < w.p.length - 1 && w.cum[j] - w.cum[j - 1] < 1e-6) j++;
    // a neighbour segment counts only at its shared vertex (≤ 3 mm along the wall): a crossing
    // line that turns along the prediction further on is still across here (peer review)
    const segs = [j];
    if (j - 1 >= 1 && s.arc - w.cum[j - 1] <= 3) segs.push(j - 1);
    if (j + 1 < w.p.length && w.cum[j] - s.arc <= 3) segs.push(j + 1);
    const dirs = [
      [pts[(i - 1 + n) % n], pts[(i + 1) % n]],
      [pts[(i - 2 + n) % n], pts[i]],
      [pts[i], pts[(i + 2) % n]],
    ];
    // covered side (cov: -1 = the samples before the hole, +1 = after it): the direction over the next
    // `coveredMm` of ARC, not over the 1-2 samples next to the hole end. A hole that starts at a corner
    // of the prediction (a rectangle corner on a common line that runs on) has the hole's own direction
    // at its first vertex; the covered side is what ran along the wall.
    if (cov) {
      let k = i;
      let acc = 0;
      for (let t = 0; t < 12 && acc < C.coveredMm; t++) {
        const k2 = (k + cov + n) % n;
        acc += hyp(pts[k], pts[k2]);
        k = k2;
      }
      dirs.push(cov < 0 ? [pts[k], pts[i]] : [pts[i], pts[k]]);
    }
    let best = 0;
    for (const m of segs) {
      const wx = w.p[m].x - w.p[m - 1].x;
      const wy = w.p[m].y - w.p[m - 1].y;
      for (const [a, b] of dirs) {
        const px = b.x - a.x;
        const py = b.y - a.y;
        const den = Math.hypot(wx, wy) * Math.hypot(px, py);
        if (den > 1e-9) best = Math.max(best, Math.abs(wx * px + wy * py) / den);
      }
    }
    return best;
  };
  const holeEndAlong: [boolean, boolean][] = [];
  const holeEndInfo: string[][] = [];
  // walk the ring from a covered sample: covered samples take the wall point; a gap is either the
  // same wall running on (drawn: follow the wall) or a hole (derived: prediction + blended offset)
  const out: PtMm[] = [];
  const derived: boolean[] = [];
  let covL = 0;
  let holeSum = 0;
  for (let k = 0; k < n; ) {
    const i = (start + k) % n;
    const s = snaps[i];
    if (s) {
      out.push(s.q);
      derived.push(false);
      covL += segLen(i);
      k++;
      continue;
    }
    // a gap: samples k … k2-1 uncovered; prev = k-1 (covered), next = k2 (covered, cyclic)
    let k2 = k;
    while (k2 < n && !snaps[(start + k2) % n]) k2++;
    const iPrev = (start + k - 1 + n) % n;
    const iNext = (start + k2) % n;
    const sp = snaps[iPrev]!;
    const sn = snaps[iNext]!;
    let gapL = segLen(iPrev);
    for (let j = k; j < k2; j++) gapL += segLen((start + j) % n);
    // (an overlay wall proves only where the anchors run on it: never followed through a gap)
    const sameWall =
      sp.w === sn.w &&
      W[sp.w].kind !== 'overlay' &&
      // a loose line covers only the samples that qualified on their own (corridor and quarter step)
      W[sp.w].kind !== 'loose' &&
      wallArcGap(sp.w, sp.arc, sn.arc) <= 1.5 * gapL + C.notchPathMm;
    if (sameWall) {
      // drawn: the wall runs on between both sides
      for (const q of wallPath(sp.w, sp.arc, sn.arc)) {
        out.push(q);
        derived.push(false);
      }
      covL += gapL - segLen(iPrev);
      res.wallBridges++;
    } else {
      const o0 = { x: sp.q.x - pts[iPrev].x, y: sp.q.y - pts[iPrev].y };
      const o1 = { x: sn.q.x - pts[iNext].x, y: sn.q.y - pts[iNext].y };
      let acc = segLen(iPrev);
      const fill: PtMm[] = [sp.q];
      for (let j = k; j < k2; j++) {
        const ii = (start + j) % n;
        const t = Math.min(1, acc / gapL);
        const q = {
          x: pts[ii].x + o0.x + (o1.x - o0.x) * t,
          y: pts[ii].y + o0.y + (o1.y - o0.y) * t,
        };
        out.push(q);
        fill.push(q);
        derived.push(true);
        acc += segLen(ii);
      }
      fill.push(sn.q);
      const hole: GfitRepairHole = {
        lenMm: gapL,
        at: pts[(start + Math.floor((k + k2) / 2)) % n],
        endsOk: [isEnd(sp, cor[iPrev]), isEnd(sn, cor[iNext])],
        endOff: [Math.hypot(o0.x, o0.y), Math.hypot(o1.x, o1.y)],
        pts: fill,
      };
      res.holes.push(hole);
      holeEndAlong.push([along(sp, iPrev, -1), along(sn, iNext, 1)]);
      holeEndInfo.push(
        [
          [sp, iPrev],
          [sn, iNext],
        ].map(([s, i]) => {
          const sn_ = s as Snap;
          const w = W[sn_.w];
          const deg = (Math.acos(Math.min(1, alongCos(sn_, i as number))) * 180) / Math.PI;
          return `w${sn_.w} ${w.kind}${w.closed ? ' closed' : ''} L ${w.L.toFixed(0)} arc ${sn_.arc.toFixed(1)} ${deg.toFixed(0)}°`;
        }),
      );
      holeSum += gapL;
    }
    k = k2;
  }
  res.outer = out;
  res.derived = derived;
  res.cover = L ? covL / L : 0;
  if (res.local) {
    let cL = 0;
    for (let i = 0; i < n; i++) if (snaps[i] && W[snaps[i]!.w].kind === 'common') cL += segLen(i);
    res.local.common = L ? cL / L : 0;
  }
  res.holeShare = L ? holeSum / L : 1;

  // E1
  const draw = opts.draw;
  // (draw mode: D-share is the cover bound — cover and holeShare share each hole's first segment,
  // so a second cover test would only repeat it)
  if (!draw && res.cover < C.minCover) refuse('E1-cover');
  if (opts.pen !== undefined && opts.pen < C.minPen) refuse('E1-pen');
  // E2
  if (draw) {
    if (res.holeShare > draw.maxShare) refuse('D-share');
    // a hole end that is not a wall END must sit on a wall running ALONG the prediction (the
    // size's line leaving the corridor / the drawing); one across it is another line the
    // prediction met — the fill would cut through it
    if (res.holes.some((h, j) => !h.endsOk.every((ok, e) => ok || holeEndAlong[j][e]))) {
      refuse('D-cross');
      if (typeof process !== 'undefined' && process.env?.GRADEP2_DEBUG)
        res.holes.forEach((h, j) =>
          h.endsOk.forEach((ok, e) => {
            if (ok || holeEndAlong[j][e]) return;
            const q = h.pts[e ? h.pts.length - 1 : 0];
            console.log(
              `GRADEP2   D-cross hole ${h.lenMm.toFixed(1)} mm end ${e} at ${q.x.toFixed(1)},${q.y.toFixed(1)} off ${h.endOff[e].toFixed(2)} mm ${holeEndInfo[j][e]}`,
            );
          }),
        );
    } else if (crossesWalls(res.holes, W, grid)) refuse('D-cross-wall');
    // E3-topology only checks that the strong corners keep their ring order, never that the rings
    // do not cross: a fill can cut through the anchor outline and still pass
    // (NEST_CROSS_OFF=1: the bisect switch, the before side of an A/B)
    const nestOff = typeof process !== 'undefined' && !!process.env?.NEST_CROSS_OFF;
    // every anchor, not only the bracketing pair: on 20 files the pair alone left 4 of 21 steep
    // crossings (through r3 / r8 / r17), all anchors left 0 of those and lost 0 clean draws
    const nestRings = ins.map((x) => x.outer);
    // a crossing near a corner of the result is the sizes converging, not a wrong line
    const env = typeof process !== 'undefined' ? process.env : undefined;
    const cornerMm = env?.NEST_CORNER_MM != null ? Number(env.NEST_CORNER_MM) : C.nestCornerMm;
    const corners = cornerMm > 0 ? cornersOf(res.outer) : [];
    if (
      !nestOff &&
      crossesNest(res.holes, nestRings, C.nestCrossDeg, C.nestEndMm, corners, cornerMm)
    )
      refuse('D-cross-nest');
    if (res.extrapolated && res.holes.some((h) => h.lenMm > C.extrapolateMaxHoleMm))
      refuse('X-hole');
  } else {
    if (res.holes.some((h) => h.lenMm > C.maxHoleMm)) refuse('E2-hole');
    if (res.holeShare > C.maxHoleShare) refuse('E2-holes-sum');
    if (res.holes.some((h) => !h.endsOk[0] || !h.endsOk[1])) refuse('E2-hole-end');
  }
  // the fill is trusted only between ends where the drawn line sits on the prediction (within the
  // model's point tolerance): a line that arrives off the prediction says the size departs from the
  // grade right where nothing is drawn (a hidden local change the fill would erase)
  if (res.holes.some((h) => Math.max(...h.endOff) > tol.ptMm)) refuse('E2-end-offset');
  if (opts.fast && res.refusals.length) return res;

  // E4: own walls that touch the corridor must not leave it for > 10 mm (notch excursions exempt)
  const pg = new SegGrid(3);
  pg.addPolyline(0, pts, true);
  const distPred = (p: PtMm) => {
    let best = Infinity;
    let bi = -1;
    for (let r = 4; best === Infinity && r < 200; r *= 3)
      pg.near(p, r, (_o, i) => {
        const d = segNearest(p, pts[i], pts[(i + 1) % n]).d;
        if (d < best) {
          best = d;
          bi = i;
        }
      });
    return { d: best, c: bi >= 0 ? cor[bi] : C.corridorMm };
  };
  const used = new Set(snaps.filter((s): s is Snap => !!s).map((s) => s.w));
  res.usedWalls = [...used].sort((a, b) => a - b);
  // every own wall given (the hook passes those near the anchors) that comes within the corridor
  // anywhere — on its own ≤ 0.5 mm samples, half a sample of slack — is audited, used or not (Codex
  // r1/r2: a branch losing the snap tie, or touching between two prediction samples, was unseen)
  for (let k = 0; k < W.length; k++) {
    const w = W[k];
    if (w.kind !== 'own') continue;
    const rs = ringOrLine(w.p, w.closed);
    const off = rs.map((p) => {
      const x = distPred(p);
      return { off: x.d > x.c, d: x.d, near: x.d <= x.c + 0.25 };
    });
    if (!used.has(k) && !touched.has(k) && !off.some((o) => o.near)) continue;
    const m = rs.length;
    // runs of off samples (cyclic for a closed wall)
    const runs: { a: number; b: number }[] = [];
    for (let j = 0; j < m; ) {
      if (!off[j].off) {
        j++;
        continue;
      }
      let e = j;
      while (e + 1 < m && off[e + 1].off) e++;
      runs.push({ a: j, b: e });
      j = e + 1;
    }
    if (w.closed && runs.length > 1 && runs[0].a === 0 && runs[runs.length - 1].b === m - 1) {
      const last = runs.pop()!;
      runs[0] = { a: last.a - m, b: runs[0].b };
    }
    const at = (j: number) => rs[((j % m) + m) % m];
    for (const r of runs) {
      // measured along the wall, from the last sample in the corridor to the next (upper bound)
      let len = 0;
      const j0 = w.closed || r.a > 0 ? r.a - 1 : r.a;
      const j1 = w.closed || r.b < m - 1 ? r.b + 1 : r.b;
      for (let j = j0; j < j1; j++) len += hyp(at(j), at(j + 1));
      const atEnd = !w.closed && (r.a <= 0 || r.b >= m - 1);
      let notch = false;
      if (!atEnd && len <= C.notchPathMm) {
        const pa = rs[(((r.a - 1) % m) + m) % m];
        const pb = rs[(r.b + 1) % m];
        let depth = 0;
        for (let j = r.a; j <= r.b; j++) depth = Math.max(depth, off[((j % m) + m) % m].d);
        notch = hyp(pa, pb) <= C.notchMouthMm && depth <= C.notchDepthMm;
      }
      if (!notch) res.offRunMm = Math.max(res.offRunMm, len);
    }
  }
  if (res.offRunMm > C.offRunMm) refuse('E4-off-corridor');

  // E3: one simple closed ring, area between the anchors in grade order, the model check, topology
  const o = analyseOutline(out);
  if (!o || out.length < 20 || selfIntersects(ringOf(out, 1))) {
    refuse('E3-continuity');
    return res;
  }
  // the repaired outline (notches chorded — they are marks) stays inside the corridor everywhere:
  // the model check scores p95 per edge, so a short stretch glued onto another line would pass it
  {
    let dev = 0;
    for (const p of chordBumps(o.pts)) {
      const x = distPred(p);
      dev = Math.max(dev, x.d - x.c);
    }
    res.devMm = dev;
    if (dev > 0.25) refuse('E3-deviation');
  }
  const area = (r: number) => {
    const s = ins.find((x) => x.rank === r);
    return s ? outlineOf(s.outer)?.area ?? NaN : NaN;
  };
  const a1 = area(r1);
  const a2 = area(r2);
  if (res.extrapolated) {
    // past the edge the area keeps the direction of the step: beyond the nearer anchor, away from
    // the farther one
    const [aNear, aFar] = rank > r2 ? [a2, a1] : [a1, a2];
    if (!((o.area - aNear) * (aNear - aFar) > 0)) refuse('E3-area');
  } else if (!(Math.min(a1, a2) < o.area && o.area < Math.max(a1, a2))) refuse('E3-area');
  const chkIns = local ? ins.filter((x) => x.rank === r1 || x.rank === r2) : ins;
  const chk = fitFamily([...chkIns, { rank, outer: out, anchor: false }], {
    tol,
    ...(opts.frame ? { frame: opts.frame } : {}),
  });
  const v = chk.sizes.find((x) => x.rank === rank);
  res.score = v?.score;
  if (!v || v.status === 'topology') refuse('E3-topology');
  else if (v.status !== 'ok') refuse('E3-tol');
  // one geometry: the repaired ring carries the anchors' strong corners, in order
  // in grade order: between the anchors, or past them on its side
  if (o1 && o2) {
    const order = rank < r1 ? [o, o1, o2] : rank > r2 ? [o1, o2, o] : [o1, o, o2];
    if (!canonTopology(order, chk.frame, 1).ok) refuse('E3-topology');
  }
  // GFIT_LOCAL_CORRIDOR: the result sits between the two anchors — the smaller inside it, it
  // inside the larger. Area decides which is which; rank order does not.
  if (scatter != null && o1 && o2) {
    const small = o1.area <= o2.area ? ring1 : ring2;
    const large = o1.area <= o2.area ? ring2 : ring1;
    // insideWithin's 0.5 mm treats a line lying on the larger anchor as inside it. Where the two
    // anchors have separated, that line is the neighbour's: a quarter step clear of both.
    const share = neighbourShare(out, pts, P.stepN, [small, large]);
    if (process.env?.GFIT_NEST_DEBUG)
      console.log('nest', {
        inSmall: insideWithin(small, out, 0.5),
        inLarge: insideWithin(out, large, 0.5),
        share,
        areas: [o1.area, o2.area, o.area],
      });
    if (!insideWithin(small, out, 0.5) || !insideWithin(out, large, 0.5) || share >= 0.5)
      refuse('E5-nest');
  }
  if (draw && res.holes.length) {
    const s = holeSpread(res.holes, ins, trusted, rank, fam.frame);
    if (s !== undefined) res.spreadMm = s;
  }
  // GFIT_EDGE_ACCEPT: a close on the neighbouring anchor's line is not this size. Samples where
  // the grade itself still lies on that anchor (a shared edge) cannot tell the two apart.
  if (edgeAccepted && res.outer) {
    const edgeRing = rank > r2 ? ring2 : ring1;
    if (onEdgeAnchor(res.outer, pts, P.stepN, edgeRing) >= 0.5) refuse('E5-on-anchor');
  }
  res.ok = res.refusals.length === 0;
  return res;
}

const p95 = (a: number[]) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1) + 0.5))];
};

/**
 * GFIT_LOCAL_CORRIDOR: hide each trusted anchor that has a trusted neighbour on both sides, predict
 * it from those two, and take the p95 distance of that prediction from the anchor's own outline.
 * The family's scatter is the median of those. Null when fewer than two anchors can be measured.
 */
function familyScatter(
  ins: readonly GfitSizeIn[],
  trusted: readonly number[],
  frame: 'stacked' | 'registered',
): number | null {
  const by = new Map(ins.map((s) => [s.rank, s]));
  const vals: number[] = [];
  for (const k of trusted) {
    const below = trusted.filter((r) => r < k);
    const above = trusted.filter((r) => r > k);
    if (!below.length || !above.length) continue;
    const a = below[below.length - 1];
    const b = above[0];
    const s1 = by.get(a);
    const s2 = by.get(b);
    const sk = by.get(k);
    if (!s1 || !s2 || !sk) continue;
    const o1 = outlineOf(s1.outer);
    const o2 = outlineOf(s2.outer);
    if (!o1 || !o2) continue;
    const pred = predictPair(o1, o2, (k - a) / (b - a), b - a, frame);
    if (!pred) continue;
    const dist = ringDistance(sk.outer);
    vals.push(p95(pred.pts.map((p) => dist(p))));
  }
  if (vals.length < 2) return null;
  vals.sort((x, y) => x - y);
  const mid = vals.length >> 1;
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/**
 * Share of `outer` that lies within a quarter of the local step of `edgeRing`, ignoring samples
 * whose own prediction still lies there (the sizes have not separated). 0 when nothing qualifies.
 */
function onEdgeAnchor(
  outer: readonly PtMm[],
  pred: readonly PtMm[],
  stepN: readonly number[],
  edgeRing: readonly PtMm[],
): number {
  const distE = ringDistance(edgeRing);
  const n = pred.length;
  let on = 0;
  let seen = 0;
  for (const q of outer) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = hyp(pred[i], q);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const lim = 0.25 * (stepN[bi] ?? 0);
    const reach = Math.max(lim, 0.5) + 1;
    if (distE(pred[bi], reach) <= lim) continue;
    seen++;
    if (distE(q, reach) <= lim) on++;
  }
  return seen ? on / seen : 0;
}

/**
 * Share of `outer` that lies within a quarter step of either anchor, counting only samples where
 * the prediction itself is at least half a step from both (the anchors have separated there).
 * 0 when the grade never separates, so a shared edge is not a neighbour close.
 */
function neighbourShare(
  outer: readonly PtMm[],
  pred: readonly PtMm[],
  stepN: readonly number[],
  rings: readonly (readonly PtMm[])[],
): number {
  const dists = rings.map((ring) => ringDistance(ring));
  const n = pred.length;
  let on = 0;
  let seen = 0;
  for (const q of outer) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = hyp(pred[i], q);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const s = stepN[bi] ?? 0;
    const apart = 0.5 * s;
    const lim = 0.25 * s;
    const reach = Math.max(apart, lim, 0.5) + 1;
    if (dists.some((d) => d(pred[bi], reach) < apart)) continue;
    seen++;
    if (dists.some((d) => d(q, reach) <= lim)) on++;
  }
  return seen ? on / seen : 0;
}

/**
 * Draw mode: the spread of the drawn holes across anchor pairs. The fill came from the nearest pair;
 * each other pair (one anchor further out on a side; at the edge, the third-nearest) predicts the
 * size again, its stretch between the points nearest the hole's ends is shifted onto those ends (the
 * fill's own end blend), and the farthest it strays from the fill is the spread. Linear grading
 * gives ~0; a size whose grade bends near the hole gives the mm the operator should look at.
 */
function holeSpread(
  holes: readonly GfitRepairHole[],
  ins: readonly GfitSizeIn[],
  trusted: readonly number[],
  rank: number,
  frame: 'stacked' | 'registered',
): number | undefined {
  const lo = trusted.filter((r) => r < rank);
  const hi = trusted.filter((r) => r > rank);
  const pairs: [number, number][] = [];
  if (lo.length && hi.length) {
    if (lo.length > 1) pairs.push([lo[lo.length - 2], hi[0]]);
    if (hi.length > 1) pairs.push([lo[lo.length - 1], hi[1]]);
  } else {
    const side = lo.length ? [...lo].reverse() : hi; // nearest first; the fill used side[0..1]
    if (side.length > 2) pairs.push([side[0], side[2]], [side[1], side[2]]);
  }
  let spread: number | undefined;
  for (const pr of pairs) {
    const [a, b] = pr[0] < pr[1] ? pr : [pr[1], pr[0]];
    const oa = outlineOf(ins.find((x) => x.rank === a)!.outer);
    const ob = outlineOf(ins.find((x) => x.rank === b)!.outer);
    const P = oa && ob ? predictPair(oa, ob, (rank - a) / (b - a), b - a, frame) : null;
    if (!P) continue;
    for (const h of holes) {
      const d = strayFrom(h.pts, P.pts);
      if (d !== null) spread = Math.max(spread ?? 0, d);
    }
  }
  return spread === undefined ? undefined : Math.round(spread * 100) / 100;
}

/** How far `ring`'s stretch between the fill's ends, shifted onto them, strays from the fill, mm. */
function strayFrom(fill: readonly PtMm[], ring: readonly PtMm[]): number | null {
  const n = ring.length;
  if (fill.length < 2 || n < 3) return null;
  const a = fill[0];
  const b = fill[fill.length - 1];
  const nearest = (p: PtMm) => {
    let bi = 0;
    for (let i = 1; i < n; i++) if (hyp(ring[i], p) < hyp(ring[bi], p)) bi = i;
    return bi;
  };
  const i = nearest(a);
  const j = nearest(b);
  // another pair's ring sits within a few steps of grade of the fill; farther, it is not this stretch
  if (hyp(ring[i], a) > 10 || hyp(ring[j], b) > 10) return null;
  const walk = (step: number) => {
    const out = [ring[i]];
    for (let k = i; k !== j; ) out.push(ring[(k = (k + step + n) % n)]);
    return out;
  };
  const len = (q: PtMm[]) => q.reduce((s, p, k) => (k ? s + hyp(q[k - 1], p) : 0), 0);
  const f = walk(1);
  const r = walk(-1);
  const q = len(f) <= len(r) ? f : r;
  let fillL = 0;
  for (let k = 1; k < fill.length; k++) fillL += hyp(fill[k - 1], fill[k]);
  if (len(q) > 3 * fillL + 5) return null;
  const m = q.length - 1 || 1;
  const d0 = { x: a.x - q[0].x, y: a.y - q[0].y };
  const d1 = { x: b.x - q[q.length - 1].x, y: b.y - q[q.length - 1].y };
  let worst = 0;
  q.forEach((p, k) => {
    const t = k / m;
    const s = { x: p.x + d0.x * (1 - t) + d1.x * t, y: p.y + d0.y * (1 - t) + d1.y * t };
    let d = Infinity;
    for (let e = 0; e + 1 < fill.length; e++)
      d = Math.min(d, segNearest(s, fill[e], fill[e + 1]).d);
    worst = Math.max(worst, d);
  });
  return worst;
}

/**
 * Draw mode: does a filled stretch properly cross an own / common wall away from its ends (2 mm)?
 * A hole is where no wall is inside the corridor, so a wall can only meet the fill by crossing it
 * between samples — a drawn line the fill would cut through (the size runs elsewhere there).
 */
function crossesWalls(
  holes: readonly GfitRepairHole[],
  W: readonly { p: PtMm[]; kind: GfitWallKind }[],
  grid: SegGrid,
): boolean {
  const END_MM = 2;
  for (const h of holes) {
    const a0 = h.pts[0];
    const a1 = h.pts[h.pts.length - 1];
    for (let i = 0; i + 1 < h.pts.length; i++) {
      const a = h.pts[i];
      const b = h.pts[i + 1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let hit = false;
      grid.near(mid, hyp(a, b) / 2 + 0.1, (k, s) => {
        if (hit || W[k].kind === 'overlay' || W[k].kind === 'loose') return;
        const x = segIntersect(a, b, W[k].p[s], W[k].p[s + 1]);
        if (x && hyp(x.p, a0) > END_MM && hyp(x.p, a1) > END_MM) hit = true;
      });
      if (hit) return true;
    }
  }
  return false;
}

/**
 * Draw mode: does a filled stretch properly cross the outline of an anchor size, at `minDeg` or
 * steeper and farther than `endMm` from the stretch's ends? Graded outlines nest; a fill steeply
 * through one of them is a contour the grade cannot explain (it reaches the workshop as a closed
 * but wrong cut line).
 */
function crossesNest(
  holes: readonly GfitRepairHole[],
  rings: readonly (readonly PtMm[])[],
  minDeg: number,
  endMm: number,
  corners: readonly PtMm[] = [],
  cornerMm = 0,
): boolean {
  const cosMax = Math.cos((minDeg * Math.PI) / 180);
  for (const h of holes) {
    const a0 = h.pts[0];
    const a1 = h.pts[h.pts.length - 1];
    for (let i = 0; i + 1 < h.pts.length; i++) {
      const a = h.pts[i];
      const b = h.pts[i + 1];
      const al = hyp(a, b);
      if (al < 1e-9) continue;
      for (const ring of rings)
        for (let k = 0; k < ring.length; k++) {
          const c = ring[k];
          const d = ring[(k + 1) % ring.length];
          const x = segIntersect(a, b, c, d);
          if (!x || hyp(x.p, a0) <= endMm || hyp(x.p, a1) <= endMm) continue;
          const cl = hyp(c, d);
          if (cl < 1e-9) continue;
          // |cos| of the angle between the two lines: steep = small cosine
          const cos = Math.abs((b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y)) / (al * cl);
          if (cos > cosMax) continue;
          if (cornerMm > 0 && corners.some((q) => hyp(q, x.p) <= cornerMm)) continue;
          return true;
        }
    }
  }
  return false;
}

/** Corner of a ring: the line turns at least CORNER_TURN_DEG between CORNER_ARM_MM before and after. */
const CORNER_ARM_MM = 3;
const CORNER_TURN_DEG = 35;

/** The corners of a closed ring (every vertex where it turns sharply; a corner yields a cluster). */
function cornersOf(ring: readonly PtMm[]): PtMm[] {
  const n = ring.length;
  if (n < 3) return [];
  // the point CORNER_ARM_MM along the ring from vertex i, walking in direction dir
  const along = (i: number, dir: 1 | -1): PtMm => {
    let prev = ring[i];
    let left = CORNER_ARM_MM;
    let idx = (i + dir + n) % n;
    for (let steps = 0; steps < n; steps++) {
      const q = ring[idx];
      const L = hyp(prev, q);
      if (L >= left) {
        const t = left / L;
        return { x: prev.x + (q.x - prev.x) * t, y: prev.y + (q.y - prev.y) * t };
      }
      left -= L;
      prev = q;
      idx = (idx + dir + n) % n;
    }
    return prev;
  };
  const cosMin = Math.cos((CORNER_TURN_DEG * Math.PI) / 180);
  const out: PtMm[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const b = along(i, -1);
    const f = along(i, 1);
    const ux = p.x - b.x;
    const uy = p.y - b.y;
    const vx = f.x - p.x;
    const vy = f.y - p.y;
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (l > 1e-9 && (ux * vx + uy * vy) / l < cosMin) out.push(p);
  }
  return out;
}

/** A wall resampled at 0.5 mm (open walls keep both ends). */
function ringOrLine(p: readonly PtMm[], closed: boolean): PtMm[] {
  if (closed) return ringOf(p.slice(0, -1));
  const out: PtMm[] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    const L = hyp(a, b);
    const m = Math.max(1, Math.ceil(L / 0.5));
    for (let j = 1; j <= m; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / m, y: a.y + ((b.y - a.y) * j) / m });
  }
  return out;
}
