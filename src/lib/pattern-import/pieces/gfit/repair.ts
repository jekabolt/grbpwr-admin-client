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
import { segNearest, SegGrid } from 'lib/pattern-import/pieces/geom';

import { canonTopology, chordBumps, outlineOf, predictPair, selfIntersects } from './checks';
import { fitFamily, GFIT_TOL_P0, type GfitFamily, type GfitSizeIn, type GfitTol } from './fit';
import { analyseOutline, ringOf } from './outline';

/**
 * own = the size's own lines; common = lines every size closes on; overlay = another size's (or an
 * unranked) line the size may run on only where BOTH bracketing anchors' outlines run on it too
 * (within `overlayMm`): the sizes coincide there, the drawing draws the edge once (a shared stretch
 * in one size's pen) — the grade puts this size between them, on it.
 */
export type GfitWallKind = 'own' | 'common' | 'overlay';
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
  | 'E4-off-corridor';

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
  /** Indices (into the `walls` given) of the walls the repaired outline runs on. */
  usedWalls: number[];
  /** The anchors the grade model trusts (after the robust fit). */
  trusted?: number[];
  /** Why there is no model ('inconsistent', 'anchors<2', … — fitFamily; 'no-pair-match'). */
  modelWhy?: string;
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
  if (!fam.model || fam.why === 'inconsistent') {
    res.modelWhy = fam.why ?? 'no-model';
    refuse('no-model');
    return res;
  }
  res.trusted = fam.trusted;
  const lo = fam.trusted.filter((r) => r < rank);
  const hi = fam.trusted.filter((r) => r > rank);
  if (!lo.length || !hi.length) {
    refuse('not-bracketed');
    return res;
  }
  // the pair grade model between the bracketing anchors (checks.ts predictPair)
  const r1 = lo[lo.length - 1];
  const r2 = hi[0];
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
  const pts = P.pts;
  const n = pts.length;
  const cor = P.stepN.map((s) =>
    Math.min(C.corridorMm + C.corridorStep * s, Math.max(C.corridorMinMm, C.corridorHalfStep * s)),
  );
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
  const snapAt = (p: PtMm, r: number): Snap | null => {
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
      if (w.kind === 'overlay' && !(onRing(g1, ring1, sn.q) && onRing(g2, ring2, sn.q))) continue;
      if (!best || sn.d < best.d) best = sn;
    }
    return best;
  };
  const snaps: (Snap | null)[] = pts.map((p, i) => snapAt(p, cor[i]));
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
      holeSum += gapL;
    }
    k = k2;
  }
  res.outer = out;
  res.derived = derived;
  res.cover = L ? covL / L : 0;
  res.holeShare = L ? holeSum / L : 1;

  // E1
  if (res.cover < C.minCover) refuse('E1-cover');
  if (opts.pen !== undefined && opts.pen < C.minPen) refuse('E1-pen');
  // E2
  if (res.holes.some((h) => h.lenMm > C.maxHoleMm)) refuse('E2-hole');
  if (res.holeShare > C.maxHoleShare) refuse('E2-holes-sum');
  if (res.holes.some((h) => !h.endsOk[0] || !h.endsOk[1])) refuse('E2-hole-end');
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
  const aLo = area(lo[lo.length - 1]);
  const aHi = area(hi[0]);
  if (!(Math.min(aLo, aHi) < o.area && o.area < Math.max(aLo, aHi))) refuse('E3-area');
  const chk = fitFamily([...ins, { rank, outer: out, anchor: false }], {
    tol,
    ...(opts.frame ? { frame: opts.frame } : {}),
  });
  const v = chk.sizes.find((x) => x.rank === rank);
  res.score = v?.score;
  if (!v || v.status === 'topology') refuse('E3-topology');
  else if (v.status !== 'ok') refuse('E3-tol');
  // one geometry: the repaired ring carries the anchors' strong corners, in order
  const loS = ins.find((x) => x.rank === lo[lo.length - 1])!;
  const hiS = ins.find((x) => x.rank === hi[0])!;
  const oLo = outlineOf(loS.outer);
  const oHi = outlineOf(hiS.outer);
  if (oLo && oHi && !canonTopology([oLo, o, oHi], chk.frame, 1).ok) refuse('E3-topology');
  res.ok = res.refusals.length === 0;
  return res;
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
