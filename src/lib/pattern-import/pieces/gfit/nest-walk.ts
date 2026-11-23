// pieces/gfit/nest-walk — every size of a piece from ONE etalon size, by walking the size nest.
//
// All sizes of a piece are one figure, graded: each point moves by its own vector per size step,
// the step changes with the size range, a missing size shows as a double step. So the outline of a
// size is read from one fully closed size (the etalon) plus the distance from it to the next size's
// line, then to the next, and so on (Leah B: side corner 10–13 mm per step for 14–32, 5–8 for 8–12,
// 0–1 for 00–6; 26 → 22 = 23.7 mm ≈ 2 × 11.9 with 24 missing).
//
// 1. Etalon: a size closed on its own lines (+ common), the highest share on own lines, no grade
//    stretch, no bridge > 3 mm (a fill bridge ≤ 12 mm competes as a second tier), as many corners as
//    the piece's mode; ties → nearest the middle of the card. Never closed by the grade.
// 2. Landmarks on the etalon: corners (turn > 40° over ±8 mm), dart apexes (sharp corners), notch
//    centres, and arc samples every 5 mm between corners, each with its edge and arc parameter.
// 3. Walk outward both ways, one size at a time; targets are the next size's OWN lines and the
//    COMMON lines only — never a foreign line. A miss skips to the size after (the position between
//    is interpolated); at the card edge one size is extrapolated. A step that breaks the gradual
//    rule (length ±50 % / ≤ 1 mm under 2 mm; turn ≤ 30°) while most of its edge does not, gets the
//    position its edge neighbours imply.
// 4. Outline per size: the landmarks in etalon order; between two of them the size's line when it
//    runs from one to the other, else the etalon segment deformed by the landmark moves ('derived').
// Pure, mm, y-up. On in the pipeline by default; `GFIT_NEST_WALK=0` turns it off (repair-hook.ts).
import type { PtMm } from 'lib/pattern-import/types';

import {
  bboxOf,
  dist,
  resample,
  SegGrid,
  segIntersect,
  segNearest,
  signedArea,
  simplify,
} from '../geom';
import { bumpSpans } from './outline';

export const NEST_WALK = {
  stepMm: 0.5,
  sampleMm: 5,
  cornerDeg: 40,
  cornerArmMm: 8,
  /** a corner this sharp is a dart apex */
  dartDeg: 120,
  /** own-share: a perimeter sample on an own line within this */
  onLineMm: 0.5,
  /** etalon (b): longest bridge; the second tier takes fill bridges up to `facingBridgeMm` */
  bridgeMm: 3,
  facingBridgeMm: 12,
  coneDeg: 30,
  /** first step search radius, mm (no step seen yet) */
  firstStepMm: 25,
  /** later: radius = max(minStepRadiusMm, stepRadiusK × the largest step seen on the landmark) */
  stepRadiusK: 2,
  minStepRadiusMm: 6,
  /** arc sample snap from its predicted seat: max(snapMinMm, snapK × largest residual seen) */
  snapMinMm: 4,
  snapK: 2,
  snapPredK: 0.5,
  tangentDeg: 30,
  /** gradual step rule */
  stepChange: 0.5,
  smallStepMm: 2,
  smallChangeMm: 1,
  stepTurnDeg: 30,
  /** piece window around the etalon */
  windowMm: 150,
  /** a run off the size's lines shorter than this is not a derived stretch */
  derivedMinMm: 1,
  /** a ring point is drawn when it is within this of the size's own or common lines.
   *  How the point was built does not count; a point on another size's line is derived
   *  (owner, 18 Nov 2026, E1). */
  derivedOffMm: 1,
  /** stepped grade: a range break is taken when it explains the chord within `breakFitMm` and
   *  beats the next explanation by `breakMarginMm`; otherwise the even split stands */
  breakFitMm: 0.5,
  breakMarginMm: 0.6,
  /** a leak is written only when the walk, blind to the size's own lines, still lands on them
   *  within this (owner bar, 17 Nov 2026) */
  blindP95Mm: 0.5,
  blindMaxMm: 1.5,
  /** own-line samples farther than this from the blind outline are other pieces' lines */
  blindNearMm: 3,
  /** a closed size whose own outline lies farther than this (p95) from the walk's disagrees */
  confirmP95Mm: 0.5,
  /** edge trace: a measured corner's line within this; an unmeasured one's within the loose */
  traceStartMm: 1,
  traceStartLooseMm: 3,
  /** the trace has reached the far corner within this */
  traceEndMm: 0.75,
  /** another line within this is a junction; its continuation `traceAheadSteps` on is compared
   *  with the current one's, and taken when nearer the guide by `traceHysteresisMm` */
  traceJunctionMm: 0.3,
  traceAheadSteps: 6,
  traceHysteresisMm: 0.3,
  /** the trace stops where its line leaves the guide by more than this */
  traceCorridorMm: 3,
  /** a loop of the drawn line this short is read geometry (a notch, a dart tip drawn crossed) */
  loopKeepMm: 10,
};

export type NestSizeIn = {
  rank: number;
  /** the size's outline when it closed (sheet mm), else null */
  outer: readonly PtMm[] | null;
  /** how it closed: only 'class' (own lines) may be the etalon */
  from?: string | null;
  derived?: readonly { kind: string; pts: readonly PtMm[] }[];
  /** the card leaves this size out (owner decision 3 pending: never an etalon) */
  outOfCard?: boolean;
  /**
   * The label's numeric step (US: 00 → -2, 0 → 0, 2 → 2… — sizes/tokens `parseSizeToken`). Used to
   * weight interpolation between anchors; defaults to `rank` when absent.
   */
  step?: number;
};

export type NestWalkIn = {
  /** every size of the piece, card order (rank ascending) */
  sizes: readonly NestSizeIn[];
  /** rank r's own lines */
  own: (rank: number) => readonly (readonly PtMm[])[];
  common: readonly (readonly PtMm[])[];
  /** ranks whose own lines the walk must not see (leave-one-out) */
  hide?: ReadonlySet<number>;
  /** force the etalon (tests, leave-one-out) */
  etalon?: number;
  /** build only these ranks (the walk still runs through the sizes between) */
  only?: ReadonlySet<number>;
  /**
   * Edge blend between anchors: `arc` = equal arc-length fraction (default); `normal` = nearest
   * point on the other anchor's edge (same edge), then weighted + chord correction.
   */
  blendMode?: 'arc' | 'normal';
};

export type LandmarkKind = 'corner' | 'dart' | 'notch' | 'arc';
export type Landmark = {
  kind: LandmarkKind;
  /** index into the etalon ring (0.5 mm, CCW, notches chorded) */
  i: number;
  p: PtMm;
  edge: number;
  /** arc parameter between the edge's corners, 0 … 1 */
  t: number;
  /** unit tangent (CCW) and outward normal at the etalon */
  tan: PtMm;
  nrm: PtMm;
  /** corners: signed turn (deg) and the arm directions in / out */
  turn?: number;
  tin?: PtMm;
  tout?: PtMm;
};

export type LmState = 'measured' | 'interpolated' | 'extrapolated' | 'replaced' | 'etalon';
export type DerivedKind = 'derived' | 'interpolated' | 'extrapolated';
export type NestDerived = { from: PtMm; to: PtMm; mm: number; kind: DerivedKind; pts: PtMm[] };

export type NestSizeOut = {
  rank: number;
  outer: PtMm[];
  derived: NestDerived[];
  derivedMm: number;
  notches: PtMm[];
  states: Record<LmState, number>;
  /** the ring fails the checks: self-crossing / crossing the size's own lines */
  refused?: string;
  /** per `outer` point: the landmark span j → j+1 it was built on, how, and the line it lies on */
  src?: { j: number; path: boolean; line: number | null }[];
  /**
   * Loops of the size's own drawn line the edge path crossed itself on (a dash run joined out of
   * order): cut at the crossing; `cut` = kept as read geometry (≤ `loopKeepMm`), else the edge was
   * built as a gap. `lines`: 'own<i>' / 'common<i>' (indices into the inputs) on the loop.
   */
  loops?: { edge: number; at: PtMm; mm: number; cut: boolean; lines: string[] }[];
  /** how each corner landmark was placed (dump / gate) */
  cornerFrom?: { j: number; state: LmState }[];
  /** how each edge between corners was built */
  edgeFrom?: { a: number; b: number; how: 'traced' | 'blended' | 'etalon' }[];
  /** near-corner self-cross cut: intersection became the corner (loop ≤ 10 mm) */
  cornerSnaps?: { j: number; at: PtMm; mm: number }[];
  /** near-corner crossings left alone (loop > 10 mm) */
  nearCornerLong?: { j: number; at: PtMm; mm: number }[];
};

export type EtalonCand = {
  rank: number;
  ownShare: number;
  corners: number;
  tier: 1 | 2;
  fails: string[];
  eligible: boolean;
};

export type NestDemoted = {
  rank: number;
  /** landmark index (corner) with the largest error */
  corner: number;
  errMm: number;
  predLo: PtMm;
  predHi: PtMm;
  agreeMm: number;
  /** how many corners failed the leave-one-out check */
  failCorners: number;
  /** whole size dropped from anchors (≥2 fails, or a failing corner stuck on a neighbour) */
  wholeSize: boolean;
  /** mm to the nearest adjacent size's same corner for the worst failing corner; else null */
  stuckDistMm: number | null;
  /** every failing corner with its stuck distance */
  fails: { j: number; errMm: number; stuckDistMm: number | null }[];
};

export type NestWalkOut = {
  etalon: number | null;
  why?: string;
  candidates: EtalonCand[];
  modeCorners: number;
  landmarks: Landmark[];
  sizes: Map<number, NestSizeOut>;
  stats: {
    measured: number;
    interpolated: number;
    extrapolated: number;
    replaced: number;
    lost: number;
    /** per landmark: largest |break| seen (for the report) */
    worst?: { lm: number; rank: number; why: string }[];
  };
  /** per landmark, per rank: the position and how it was found (reports, pictures) */
  tracks?: { pos: (PtMm | null)[]; state: (LmState | null)[] }[];
  /** ranks kept as anchors after validation */
  anchors?: number[];
  /** closed sizes demoted: wrong closure (prediction from both sides agrees, outline disagrees) */
  demoted?: NestDemoted[];
};

// ───────────────────────── geometry helpers ─────────────────────────

const DBG = typeof process !== 'undefined' && !!process.env?.NEST_WALK_DEBUG;
const fmt = (p: PtMm) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

const sub = (a: PtMm, b: PtMm): PtMm => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: PtMm, b: PtMm): PtMm => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: PtMm, k: number): PtMm => ({ x: a.x * k, y: a.y * k });
const dot = (a: PtMm, b: PtMm) => a.x * b.x + a.y * b.y;
const len = (a: PtMm) => Math.hypot(a.x, a.y);
const unit = (a: PtMm): PtMm => {
  const L = len(a);
  return L > 1e-12 ? { x: a.x / L, y: a.y / L } : { x: 0, y: 0 };
};
const lerp = (a: PtMm, b: PtMm, t: number): PtMm => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const DEG = Math.PI / 180;
const angBetween = (a: PtMm, b: PtMm) => {
  const La = len(a);
  const Lb = len(b);
  if (La < 1e-9 || Lb < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (La * Lb))));
};
const wrapPi = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

/** The ring resampled at 0.5 mm, CCW, with notch bumps cut off by their chord. */
export function canonRing(outer: readonly PtMm[]): { pts: PtMm[]; notches: PtMm[] } {
  const o = signedArea(outer) < 0 ? outer.slice().reverse() : outer.slice();
  const raw = resample(o, NEST_WALK.stepMm, true);
  const n = raw.length;
  const pts = raw.slice();
  const notches: PtMm[] = [];
  if (n < 40) return { pts, notches };
  for (const [a, b] of bumpSpans(raw)) {
    const p = raw[a % n];
    const q = raw[b % n];
    // a notch is short: a chord across a long stretch would cut a corner
    if (b - a > 30 / NEST_WALK.stepMm) continue;
    notches.push(raw[((a + b) >> 1) % n]);
    for (let j = a + 1; j < b; j++) pts[j % n] = lerp(p, q, (j - a) / (b - a));
  }
  return { pts, notches };
}

/** Signed turn at i over ±k samples, radians (+ = left = convex on a CCW ring). */
function turnAt(p: readonly PtMm[], i: number, k: number): number {
  const n = p.length;
  const a = p[(((i - k) % n) + n) % n];
  const b = p[i];
  const c = p[(i + k) % n];
  if (dist(a, b) < 1e-6 || dist(b, c) < 1e-6) return 0;
  return wrapPi(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
}

/** Corners of a canonical ring: |turn over ±8 mm| > 40°, local maxima 8 mm apart. */
export function nestCorners(p: readonly PtMm[]): { i: number; turn: number }[] {
  const n = p.length;
  const k = Math.round(NEST_WALK.cornerArmMm / NEST_WALK.stepMm);
  if (n < 4 * k) return [];
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = turnAt(p, i, k);
  const out: { i: number; turn: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.abs(t[i]);
    if (v <= NEST_WALK.cornerDeg * DEG) continue;
    let isMax = true;
    for (let d = 1; d <= k && isMax; d++)
      if (Math.abs(t[(i - d + n) % n]) >= v || Math.abs(t[(i + d) % n]) > v) isMax = false;
    if (isMax) out.push({ i, turn: t[i] / DEG });
  }
  return out;
}

/** Tangent at i over ±k samples (unit). */
function tangentAt(p: readonly PtMm[], i: number, k = 2): PtMm {
  const n = p.length;
  return unit(sub(p[(i + k) % n], p[(((i - k) % n) + n) % n]));
}

// ───────────────────────── line index ─────────────────────────

type LinePt = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  line: number;
  k: number;
  /** one of the size's own lines (else a common one) */
  own: boolean;
};

/** The lines a size may run on, resampled at 0.5 mm, in a point grid. */
class LineIndex {
  readonly pts: LinePt[] = [];
  /** per line: index of its first point in `pts`, its point count, closed */
  readonly lines: { start: number; n: number; closed: boolean }[] = [];
  /** per kept line: its index in the constructor's `lines` */
  readonly srcOf: number[] = [];
  private readonly grid = new Map<number, number[]>();
  constructor(
    lines: readonly (readonly PtMm[])[],
    readonly cell = 4,
    /** the first `nOwn` lines are the size's own */
    nOwn = lines.length,
  ) {
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      if (l.length < 2) continue;
      const closed = l.length > 3 && dist(l[0], l[l.length - 1]) < 0.5;
      const r = resample(l, NEST_WALK.stepMm, false);
      if (r.length < 2) continue;
      const id = this.lines.length;
      this.lines.push({ start: this.pts.length, n: r.length, closed });
      this.srcOf.push(li);
      for (let k = 0; k < r.length; k++) {
        const a = r[Math.max(0, k - 2)];
        const b = r[Math.min(r.length - 1, k + 2)];
        const t = unit(sub(b, a));
        const j = this.pts.length;
        this.pts.push({ x: r[k].x, y: r[k].y, tx: t.x, ty: t.y, line: id, k, own: li < nOwn });
        const key = this.key(Math.floor(r[k].x / cell), Math.floor(r[k].y / cell));
        const arr = this.grid.get(key);
        if (arr) arr.push(j);
        else this.grid.set(key, [j]);
      }
    }
  }
  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
  near(p: PtMm, r: number, visit: (j: number, d: number) => void) {
    const c = this.cell;
    const x0 = Math.floor((p.x - r) / c);
    const x1 = Math.floor((p.x + r) / c);
    const y0 = Math.floor((p.y - r) / c);
    const y1 = Math.floor((p.y + r) / c);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const arr = this.grid.get(this.key(x, y));
        if (!arr) continue;
        for (const j of arr) {
          const q = this.pts[j];
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d <= r) visit(j, d);
        }
      }
  }
  nearest(p: PtMm, r: number): { j: number; d: number } | null {
    let best: { j: number; d: number } | null = null;
    this.near(p, r, (j, d) => {
      if (!best || d < best.d) best = { j, d };
    });
    return best;
  }
  pt(j: number): PtMm {
    return { x: this.pts[j].x, y: this.pts[j].y };
  }
  /** point m steps along the line of point j (clamped; wraps on a closed line) */
  along(j: number, m: number): number | null {
    const q = this.pts[j];
    const L = this.lines[q.line];
    let k = q.k + m;
    if (L.closed) k = ((k % L.n) + L.n) % L.n;
    else if (k < 0 || k >= L.n) return null;
    return L.start + k;
  }
}

/**
 * A ring point is drawn when it lies within `tolMm` of this size's own lines or the common lines.
 * A point on another size's line is derived. Length, not sample count: a segment counts as derived
 * when its start point is off the line (the segment that leaves the last drawn point stays drawn).
 */
export function derivedByDistance(
  ring: readonly PtMm[],
  ownLines: readonly (readonly PtMm[])[],
  commonLines: readonly (readonly PtMm[])[],
  tolMm = 1,
): { on: boolean[]; derivedMm: number; perimeter: number; share: number } {
  const lines = [...ownLines, ...commonLines];
  const grid = new SegGrid(4);
  lines.forEach((l, i) => {
    if (l.length >= 2) grid.addPolyline(i, l as PtMm[], false);
  });
  const on = ring.map((p) => {
    let best = Infinity;
    grid.near(p, tolMm + 4, (o, s) => {
      const l = lines[o];
      if (s + 1 < l.length) best = Math.min(best, segNearest(p, l[s], l[s + 1]).d);
    });
    return best <= tolMm;
  });
  let derivedMm = 0;
  let perimeter = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    perimeter += L;
    if (!on[i]) derivedMm += L;
  }
  return { on, derivedMm, perimeter, share: perimeter > 0 ? derivedMm / perimeter : 0 };
}

/** Share of a ring's samples within `tol` of a line set. */
function shareOn(ring: readonly PtMm[], idx: LineIndex, tol: number): number {
  if (!ring.length) return 0;
  let on = 0;
  for (const p of ring) if (idx.nearest(p, tol)) on++;
  return on / ring.length;
}

// ───────────────────────── 1. etalon ─────────────────────────

const polyLen = (pts: readonly PtMm[]) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
};

/** Corner count of a closed outline (the etalon rule (c)). */
export function cornerCount(outer: readonly PtMm[]): number {
  return nestCorners(canonRing(outer).pts).length;
}

function modeOf(xs: number[]): number {
  const m = new Map<number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  let best = 0;
  let bc = -1;
  for (const [x, c] of m) if (c > bc || (c === bc && x < best)) [best, bc] = [x, c];
  return best;
}

export function pickEtalon(
  sizes: readonly NestSizeIn[],
  ownIdx: (rank: number) => LineIndex,
): { etalon: number | null; why?: string; candidates: EtalonCand[]; modeCorners: number } {
  const closed = sizes.filter((s) => s.outer && s.outer.length > 2);
  const corners = new Map(closed.map((s) => [s.rank, cornerCount(s.outer!)]));
  const modeCorners = modeOf([...corners.values()]);
  const candidates: EtalonCand[] = [];
  for (const s of closed) {
    if (s.outOfCard) continue;
    if (s.from && s.from !== 'class') continue;
    const fails: string[] = [];
    const d = s.derived ?? [];
    const grade = d.filter((x) => x.kind.startsWith('grade'));
    const bridges = d.filter((x) => !x.kind.startsWith('grade'));
    const longBridge = bridges.some((x) => polyLen(x.pts) > NEST_WALK.bridgeMm);
    if (grade.length) fails.push('b:grade');
    if (longBridge) fails.push('b:bridge');
    const c = corners.get(s.rank) ?? 0;
    if (c !== modeCorners) fails.push(`c:${c}≠${modeCorners}`);
    // second tier: only the fill's own closes (bridges ≤ 12 mm on own/common lines), never the grade
    const tier2 =
      fails.length === 1 &&
      fails[0] === 'b:bridge' &&
      bridges.every((x) => x.kind === 'bridge' && polyLen(x.pts) <= NEST_WALK.facingBridgeMm);
    const eligible = !fails.length || tier2;
    const ring = canonRing(s.outer!).pts;
    const ownShare = eligible ? shareOn(ring, ownIdx(s.rank), NEST_WALK.onLineMm) : 0;
    candidates.push({ rank: s.rank, ownShare, corners: c, tier: tier2 ? 2 : 1, fails, eligible });
  }
  const ok = candidates.filter((c) => c.eligible);
  if (!ok.length) return { etalon: null, why: 'no-candidate', candidates, modeCorners };
  const ranks = sizes.map((s) => s.rank);
  const mid = (Math.min(...ranks) + Math.max(...ranks)) / 2;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  ok.sort(
    (a, b) => r2(b.ownShare) - r2(a.ownShare) || Math.abs(a.rank - mid) - Math.abs(b.rank - mid),
  );
  return { etalon: ok[0].rank, candidates, modeCorners };
}

// ───────────────────────── 2. landmarks ─────────────────────────

export function landmarksOf(ring: readonly PtMm[], notches: readonly PtMm[]): Landmark[] {
  const n = ring.length;
  const k = Math.round(NEST_WALK.cornerArmMm / NEST_WALK.stepMm);
  const cs = nestCorners(ring);
  const nrmOf = (t: PtMm): PtMm => ({ x: t.y, y: -t.x }); // right of a CCW tangent = outward
  const out: Landmark[] = [];
  const sampleStep = Math.round(NEST_WALK.sampleMm / NEST_WALK.stepMm);
  const notchIdx = notches.map((q) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = dist(ring[i], q);
      if (d < bd) [bi, bd] = [i, d];
    }
    return bi;
  });
  const push = (i: number, kind: LandmarkKind, edge: number, t: number) => {
    const tan = tangentAt(ring, i);
    const lm: Landmark = { kind, i, p: ring[i], edge, t, tan, nrm: nrmOf(tan) };
    if (kind === 'corner' || kind === 'dart') {
      const a = ring[(((i - k) % n) + n) % n];
      const c = ring[(i + k) % n];
      lm.tin = unit(sub(ring[i], a));
      lm.tout = unit(sub(c, ring[i]));
      lm.turn = turnAt(ring, i, k) / DEG;
    }
    out.push(lm);
  };
  if (!cs.length) {
    for (let i = 0; i < n; i += sampleStep) push(i, 'arc', 0, i / n);
    return mergeNotches(out, notchIdx, ring);
  }
  for (let e = 0; e < cs.length; e++) {
    const i0 = cs[e].i;
    const i1 = cs[(e + 1) % cs.length].i;
    const span = (i1 - i0 + n) % n || n;
    push(i0, Math.abs(cs[e].turn) >= NEST_WALK.dartDeg ? 'dart' : 'corner', e, 0);
    // samples every 5 mm, evenly spread so none sits closer than half a step to a corner
    const m = Math.max(0, Math.round(span / sampleStep) - 1);
    for (let s = 1; s <= m; s++)
      push((i0 + Math.round((s * span) / (m + 1))) % n, 'arc', e, s / (m + 1));
  }
  return mergeNotches(out, notchIdx, ring);
}

/** Notch centres become landmarks of kind 'notch' (replacing the nearest arc sample). */
function mergeNotches(lms: Landmark[], notchIdx: number[], ring: readonly PtMm[]): Landmark[] {
  const n = ring.length;
  for (const ni of notchIdx) {
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < lms.length; j++) {
      if (lms[j].kind !== 'arc') continue;
      const d = Math.min((lms[j].i - ni + n) % n, (ni - lms[j].i + n) % n);
      if (d < bd) [best, bd] = [j, d];
    }
    if (best < 0) continue;
    const old = lms[best];
    const prev = lms[(best - 1 + lms.length) % lms.length];
    const next = lms[(best + 1) % lms.length];
    // the arc parameter of the notch between the edge's corners, from its neighbours
    const span = (next.i - prev.i + n) % n || 1;
    const u = ((ni - prev.i + n) % n) / span;
    const t0 = prev.edge === old.edge ? prev.t : 0;
    const t1 = next.edge === old.edge ? next.t : 1;
    const tan = tangentAt(ring, ni);
    lms[best] = {
      kind: 'notch',
      i: ni,
      p: ring[ni],
      edge: old.edge,
      t: t0 + (t1 - t0) * u,
      tan,
      nrm: { x: tan.y, y: -tan.x },
    };
  }
  return lms.sort((a, b) => a.i - b.i);
}

// ───────────────────────── edge trace helpers ─────────────────────────

/** A polyline with its cumulative length: the guide an edge trace keeps to. */
type Guide = { pts: PtMm[]; cum: number[]; total: number };
function guideOf(pts: readonly PtMm[]): Guide {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts: pts.slice(), cum, total: cum[cum.length - 1] };
}
/** Nearest point of the guide to q over segments [from − 3, from + ahead]: distance, arc length. */
function projOn(g: Guide, q: PtMm, from: number, ahead: number) {
  let best = { gi: Math.max(0, Math.min(from, g.pts.length - 2)), d: Infinity, s: 0 };
  const lo = Math.max(0, from - 3);
  const hi = Math.min(g.pts.length - 2, from + ahead);
  for (let i = lo; i <= hi; i++) {
    const a = g.pts[i];
    const b = g.pts[i + 1];
    const ab = sub(b, a);
    const L2 = dot(ab, ab);
    const u = L2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(q, a), ab) / L2)) : 0;
    const d = dist(q, add(a, mul(ab, u)));
    if (d < best.d) best = { gi: i, d, s: g.cum[i] + u * Math.sqrt(L2) };
  }
  return best;
}
/** Point at arc length s along a polyline (clamped). */
function atLength(pts: readonly PtMm[], cum: readonly number[], s: number): PtMm {
  if (s <= 0) return pts[0];
  for (let i = 1; i < pts.length; i++)
    if (cum[i] >= s) {
      const seg = cum[i] - cum[i - 1];
      return lerp(pts[i - 1], pts[i], seg > 1e-12 ? (s - cum[i - 1]) / seg : 0);
    }
  return pts[pts.length - 1];
}
function cumOf(pts: readonly PtMm[]): number[] {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
}

type TracePt = { p: PtMm; line: number; s: number };
type Loop = { at: PtMm; mm: number; lines: number[] };

/**
 * Cut every loop of a traced path at its crossing: the stretch between the two passes through the
 * crossing point is dropped (a dash run joined out of order, a notch drawn crossed).
 */
function cutLoops(path: TracePt[]): { path: TracePt[]; loops: Loop[] } {
  const loops: Loop[] = [];
  let pts = path;
  for (let guard = 0; guard < 50; guard++) {
    const n = pts.length;
    const cell = 4;
    const grid = new Map<number, number[]>();
    const key = (x: number, y: number) => (x + 32768) * 65536 + (y + 32768);
    const cellsOf = (i: number) => {
      const a = pts[i].p;
      const b = pts[i + 1].p;
      const out: number[] = [];
      for (
        let x = Math.floor(Math.min(a.x, b.x) / cell);
        x <= Math.floor(Math.max(a.x, b.x) / cell);
        x++
      )
        for (
          let y = Math.floor(Math.min(a.y, b.y) / cell);
          y <= Math.floor(Math.max(a.y, b.y) / cell);
          y++
        )
          out.push(key(x, y));
      return out;
    };
    let hit: { i: number; k: number; x: PtMm } | null = null;
    for (let i = 0; i + 1 < n && !hit; i++) {
      for (const c of cellsOf(i)) {
        for (const j of grid.get(c) ?? []) {
          if (j >= i - 1) continue;
          const h = segIntersect(pts[j].p, pts[j + 1].p, pts[i].p, pts[i + 1].p);
          if (h && h.t > 1e-9 && h.t < 1 - 1e-9) {
            hit = { i: j, k: i, x: h.p };
            break;
          }
        }
        if (hit) break;
      }
      for (const c of cellsOf(i)) {
        const arr = grid.get(c);
        if (arr) arr.push(i);
        else grid.set(c, [i]);
      }
    }
    if (!hit) break;
    const { i, k, x } = hit;
    let mm = dist(x, pts[i + 1].p);
    for (let m = i + 1; m < k; m++) mm += dist(pts[m].p, pts[m + 1].p);
    mm += dist(pts[k].p, x);
    const lines = [...new Set(pts.slice(i, k + 2).map((q) => q.line))];
    loops.push({ at: x, mm, lines });
    pts = [...pts.slice(0, i + 1), { p: x, line: pts[i].line, s: pts[i].s }, ...pts.slice(k + 1)];
  }
  return { path: pts, loops };
}

// ───────────────────────── 3. walk ─────────────────────────

type Track = {
  pos: (PtMm | null)[];
  state: (LmState | null)[];
  /** line point hit in the size's index (measured only) */
  hit: (number | null)[];
  maxStep: number;
  maxResid: number;
};

/**
 * Match `size` corners (ring order) to `etalon` (or predicted) corners.
 * - Equal counts: the rotation that minimises the sum of distances.
 * - More size corners than target: every target corner gets a unique match in contour order
 *   within `residMm`; if normals are given, a displacement longer than half the residual must
 *   also lie in the ±cone of the normal (grade in or out). Unmatched size corners are ignored.
 * - Fewer size corners: null (not an anchor).
 */
export function matchCorners(
  etalon: readonly PtMm[],
  size: readonly PtMm[],
  opts?: { nrms?: readonly PtMm[]; residMm?: number; coneDeg?: number },
): PtMm[] | null {
  if (!etalon.length || !size.length) return null;
  if (size.length < etalon.length) return null;
  const n = etalon.length;
  if (size.length === n) {
    let bestRot = 0;
    let best = Infinity;
    for (let rot = 0; rot < n; rot++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += dist(etalon[i], size[(i + rot) % n]);
      if (s < best) [best, bestRot] = [s, rot];
    }
    return Array.from({ length: n }, (_, i) => size[(i + bestRot) % n]);
  }
  // subset match: size has extra corners
  const resid = opts?.residMm ?? NEST_WALK.firstStepMm;
  const cosCone = Math.cos((opts?.coneDeg ?? NEST_WALK.coneDeg) * DEG);
  const nrms = opts?.nrms;
  const m = size.length;
  // try each starting offset on the size ring
  let best: PtMm[] | null = null;
  let bestSum = Infinity;
  for (let start = 0; start < m; start++) {
    const picked: PtMm[] = [];
    let j = start;
    let sum = 0;
    let ok = true;
    for (let i = 0; i < n; i++) {
      let hit = -1;
      let hitD = Infinity;
      for (let k = 0; k < m; k++) {
        const idx = (j + k) % m;
        // must not wrap past start once we've consumed a full lap (keep order)
        if (i > 0 && k > 0 && idx === start) break;
        const p = size[idx];
        const d = dist(etalon[i], p);
        if (d > resid || d >= hitD) continue;
        if (nrms && nrms[i] && d > resid * 0.5) {
          const v = sub(p, etalon[i]);
          const L = len(v);
          // ±cone: grade may run with or against the outward normal
          if (L > 1e-9 && Math.abs(dot(mul(v, 1 / L), nrms[i])) < cosCone) continue;
        }
        hit = idx;
        hitD = d;
        if (d <= resid * 0.5) break;
      }
      if (hit < 0) {
        ok = false;
        break;
      }
      picked.push(size[hit]);
      sum += hitD;
      j = (hit + 1) % m;
    }
    if (ok && sum < bestSum) {
      bestSum = sum;
      best = picked;
    }
  }
  return best;
}

/** Indices of `size` corners not used by a subset match to `etalon` (for dumps). */
export function unmatchedCorners(
  etalon: readonly PtMm[],
  size: readonly PtMm[],
  opts?: { nrms?: readonly PtMm[]; residMm?: number; coneDeg?: number },
): number[] {
  const matched = matchCorners(etalon, size, opts);
  if (!matched) return size.map((_, i) => i);
  const used = new Set(matched.map((p) => size.findIndex((q) => q === p || dist(q, p) < 1e-9)));
  // also mark by nearest if reference equality failed
  for (const p of matched) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < size.length; i++) {
      const d = dist(size[i], p);
      if (d < bd) [bd, bi] = [d, i];
    }
    if (bd < 1e-6) used.add(bi);
  }
  return size.map((_, i) => i).filter((i) => !used.has(i));
}

/** CCW stretch of a closed outline from corner `a` to corner `b` (nearest ring points). */
function edgeBetween(outer: readonly PtMm[], a: PtMm, b: PtMm): PtMm[] {
  const ring = canonRing(outer).pts;
  const n = ring.length;
  const near = (q: PtMm) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = dist(ring[i], q);
      if (d < bd) [bd, bi] = [d, i];
    }
    return bi;
  };
  const ia = near(a);
  const ib = near(b);
  const out: PtMm[] = [];
  for (let i = ia, guard = 0; guard <= n; i = (i + 1) % n, guard++) {
    out.push(ring[i]);
    if (i === ib) break;
  }
  return out;
}

// A skipped size between measured r−1 and r+1: grades are stepped by size range (Leah D, one
// landmark: 6.3 mm for 0–8, 9.5 for 10–14, 12.7 for 16–24), so the even split misses by half the
// jump at a range boundary. Along the normal, the chord T = s_r + s_{r+1} is 2·s_{r−1} (break after
// r+1), 2·s_{r+2} (break before r) or s_{r−1} + s_{r+2} (break between) — the one that fits wins.
// Anchors (measured / etalon) are left alone; an interpolated corner between them may still take
// a range break from r±2 (the stepped-grade rule).
function regrade(tracks: Track[], lms: readonly Landmark[], lo: number, hi: number) {
  const ok = (T: Track, k: number) =>
    k >= lo && k <= hi && (T.state[k] === 'measured' || T.state[k] === 'etalon');
  tracks.forEach((T, j) => {
    // an arc sample slides along its line, so only its normal component is graded; a corner is
    // a fixed point and is graded as a vector
    const n = lms[j].nrm;
    const arc = lms[j].kind === 'arc';
    const proj = (u: PtMm): PtMm => (arc ? mul(n, u.x * n.x + u.y * n.y) : u);
    for (let r = lo + 2; r <= hi - 2; r++) {
      if (T.state[r] !== 'interpolated') continue;
      if (!ok(T, r - 2) || !ok(T, r - 1) || !ok(T, r + 1) || !ok(T, r + 2)) continue;
      const a = T.pos[r - 1]!;
      const c = T.pos[r + 1]!;
      const l = proj(sub(a, T.pos[r - 2]!));
      const rr = proj(sub(T.pos[r + 2]!, c));
      const ch = proj(sub(c, a));
      const cands = [
        { res: len(sub(ch, mul(l, 2))), s: l },
        { res: len(sub(ch, mul(rr, 2))), s: sub(ch, rr) },
        { res: len(sub(ch, add(l, rr))), s: mul(add(l, sub(ch, rr)), 0.5) },
      ].sort((u, v) => u.res - v.res);
      if (cands[0].res > NEST_WALK.breakFitMm) continue;
      if (cands[1].res - cands[0].res <= NEST_WALK.breakMarginMm) continue;
      T.pos[r] = add(lerp(a, c, 0.5), sub(cands[0].s, mul(ch, 0.5)));
    }
  });
}

export function nestWalk(inp: NestWalkIn): NestWalkOut {
  const ranks = inp.sizes.map((s) => s.rank);
  const lo = Math.min(...ranks);
  const hi = Math.max(...ranks);
  const N = hi + 1;
  const byRank = new Map(inp.sizes.map((s) => [s.rank, s]));
  const closedOuters = inp.sizes.filter((s) => s.outer && s.outer.length > 2);
  const empty: NestWalkOut = {
    etalon: null,
    candidates: [],
    modeCorners: 0,
    landmarks: [],
    sizes: new Map(),
    stats: { measured: 0, interpolated: 0, extrapolated: 0, replaced: 0, lost: 0 },
  };
  if (!closedOuters.length) return { ...empty, why: 'no-closed-size' };
  const win = bboxOf(closedOuters.flatMap((s) => s.outer!));
  const W = NEST_WALK.windowMm;
  const inWin = (l: readonly PtMm[]) => {
    const b = bboxOf(l);
    return !(
      b.maxX < win.minX - W ||
      b.minX > win.maxX + W ||
      b.maxY < win.minY - W ||
      b.minY > win.maxY + W
    );
  };
  const commonOrig = inp.common.flatMap((l, i) => (inWin(l) ? [i] : []));
  const commonW = commonOrig.map((i) => inp.common[i]);
  const ownMemo = new Map<number, LineIndex>();
  const tgtMemo = new Map<number, LineIndex>();
  /** indices into inp.own(r) of the lines in the piece window */
  const ownOrig = (r: number) =>
    inp.hide?.has(r) || r < lo || r > hi ? [] : inp.own(r).flatMap((l, i) => (inWin(l) ? [i] : []));
  const ownLines = (r: number) => {
    const all = inp.hide?.has(r) || r < lo || r > hi ? [] : inp.own(r);
    return ownOrig(r).map((i) => all[i]);
  };
  /** an index line of size r's targets, as 'own<i>' / 'common<i>' into the inputs */
  const lineName = (r: number, id: number) => {
    const li = tgt(r).srcOf[id];
    const o = ownOrig(r);
    return li < o.length ? `own${o[li]}` : `common${commonOrig[li - o.length]}`;
  };
  const ownIdx = (r: number) => {
    let v = ownMemo.get(r);
    if (!v) ownMemo.set(r, (v = new LineIndex(ownLines(r))));
    return v;
  };
  /** the lines size r may run on: its own + the common ones */
  const tgt = (r: number) => {
    let v = tgtMemo.get(r);
    if (!v) {
      const o = ownLines(r);
      tgtMemo.set(r, (v = new LineIndex([...o, ...commonW], 4, o.length)));
    }
    return v;
  };

  const pick =
    inp.etalon !== undefined
      ? { etalon: inp.etalon, candidates: [], modeCorners: 0 }
      : pickEtalon(inp.sizes, ownIdx);
  const E = pick.etalon;
  if (E === null || !byRank.get(E)?.outer)
    return { ...empty, why: pick.why ?? 'no-etalon', candidates: pick.candidates };
  const eRing = canonRing(byRank.get(E)!.outer!);
  const ring = eRing.pts;
  const lms = landmarksOf(ring, eRing.notches);
  const M = lms.length;
  const tracks: Track[] = lms.map((l) => {
    const pos: (PtMm | null)[] = new Array(N).fill(null);
    const state: (LmState | null)[] = new Array(N).fill(null);
    pos[E] = l.p;
    state[E] = 'etalon';
    return { pos, state, hit: new Array(N).fill(null), maxStep: 0, maxResid: 0 };
  });
  const stats = { measured: 0, interpolated: 0, extrapolated: 0, replaced: 0, lost: 0 };
  const worst: { lm: number; rank: number; why: string }[] = [];
  const cosT = Math.cos(NEST_WALK.tangentDeg * DEG);
  const coneR = NEST_WALK.coneDeg * DEG;
  /** corners of the edge e (indices into lms) */
  const cornerOfEdge = new Map<number, [number, number]>();
  {
    const cIdx = lms
      .map((l, j) => (l.kind === 'corner' || l.kind === 'dart' ? j : -1))
      .filter((j) => j >= 0);
    for (let c = 0; c < cIdx.length; c++)
      cornerOfEdge.set(lms[cIdx[c]].edge, [cIdx[c], cIdx[(c + 1) % cIdx.length]]);
  }
  const isCorner = (j: number) => lms[j].kind === 'corner' || lms[j].kind === 'dart';
  // edge correspondence (owner, 17 Nov 2026): only corners, dart apexes and notches are searched;
  // the edge between two matched corners is the size's line from one to the other, and the arc
  // samples sit on it by arc-length fraction. A piece with no corner keeps the per-sample search.
  const hasCorners = lms.some((_, j) => isCorner(j));
  const edges: { a: number; b: number; arcs: number[] }[] = [];
  if (hasCorners) {
    const cIdx = lms.map((_, j) => (isCorner(j) ? j : -1)).filter((j) => j >= 0);
    for (let c = 0; c < cIdx.length; c++) {
      const a = cIdx[c];
      const b = cIdx[(c + 1) % cIdx.length];
      const arcs: number[] = [];
      for (let j = (a + 1) % M; j !== b; j = (j + 1) % M) if (lms[j].kind === 'arc') arcs.push(j);
      edges.push({ a, b, arcs });
    }
  }
  // with corners: only corners, dart apexes and notches are searched; arcs walk as scaffold for
  // the corner's sides, then their place comes from the edge's trace (or the fill)
  const searched = (j: number) => !hasCorners || isCorner(j) || lms[j].kind === 'notch';
  const scaffold = lms.map(() => new Set<number>());
  const scaffoldArc = (j: number, r: number) => {
    if (hasCorners && lms[j].kind === 'arc') scaffold[j].add(r);
  };
  /** arc j of edge (a, b) in size r where nothing better is known: the etalon's, moved as the corners */
  const deformed = (j: number, a: number, b: number, r: number): PtMm | null => {
    const A = tracks[a].pos[r];
    const B = tracks[b].pos[r];
    if (!A || !B) return null;
    return add(lms[j].p, lerp(sub(A, lms[a].p), sub(B, lms[b].p), lms[j].t));
  };

  // ── point 4 + stepped interp + anchor validation (owner, 17 Nov 2026) ──
  const cornerJs = lms.map((_, j) => (isCorner(j) ? j : -1)).filter((j) => j >= 0);
  const sizeStep = (r: number) => byRank.get(r)?.step ?? r;
  const isClosedSize = (r: number) => !!byRank.get(r)?.outer && !inp.hide?.has(r);
  const anchors = new Set<number>();
  const demoted: NestDemoted[] = [];
  const allRanks = [...byRank.keys()].sort((a, b) => a - b);

  /** Per-unit step of corner j on the interval a → b (a, b have positions). */
  const unitStep = (j: number, a: number, b: number): PtMm | null => {
    const pa = tracks[j].pos[a];
    const pb = tracks[j].pos[b];
    if (!pa || !pb) return null;
    const ds = sizeStep(b) - sizeStep(a);
    if (Math.abs(ds) < 1e-9) return null;
    return mul(sub(pb, pa), 1 / ds);
  };

  /**
   * Corner j at rank r between anchors loA and hiA: even split by size step, or a range break
   * from the intervals just outside [loA, hiA] when it explains the chord within breakFitMm and
   * beats the even split by breakMarginMm.
   */
  const steppedCorner = (j: number, r: number, loA: number, hiA: number): PtMm => {
    const A = tracks[j].pos[loA]!;
    const B = tracks[j].pos[hiA]!;
    const ds = sizeStep(hiA) - sizeStep(loA) || 1;
    const dL = sizeStep(r) - sizeStep(loA);
    const even = lerp(A, B, dL / ds);
    const aRanks = [...anchors].sort((x, y) => x - y);
    const loPrev = [...aRanks].filter((x) => x < loA).pop();
    const hiNext = aRanks.find((x) => x > hiA);
    const sL = loPrev != null ? unitStep(j, loPrev, loA) : null;
    const sR = hiNext != null ? unitStep(j, hiA, hiNext) : null;
    if (!sL && !sR) return even;
    const ch = sub(B, A);
    const cands: { res: number; p: PtMm }[] = [];
    // pure left / pure right (no break, or break at an end)
    if (sL) cands.push({ res: len(sub(ch, mul(sL, ds))), p: add(A, mul(sL, dL)) });
    if (sR)
      cands.push({
        res: len(sub(ch, mul(sR, ds))),
        p: sub(B, mul(sR, sizeStep(hiA) - sizeStep(r))),
      });
    // one change of step inside the gap: break after each interior size
    if (sL && sR) {
      for (const br of allRanks.filter((x) => x > loA && x < hiA)) {
        const dBr = sizeStep(br) - sizeStep(loA);
        const walk = add(mul(sL, dBr), mul(sR, ds - dBr));
        const p =
          sizeStep(r) <= sizeStep(br)
            ? add(A, mul(sL, dL))
            : sub(B, mul(sR, sizeStep(hiA) - sizeStep(r)));
        cands.push({ res: len(sub(ch, walk)), p });
      }
    }
    cands.sort((u, v) => u.res - v.res);
    // beat the even split: chord residual ≤ breakFitMm and |p − even| ≥ breakMarginMm
    if (cands[0].res > NEST_WALK.breakFitMm) return even;
    if (len(sub(cands[0].p, even)) < NEST_WALK.breakMarginMm) return even;
    if (cands.length > 1 && cands[1].res - cands[0].res <= NEST_WALK.breakMarginMm) {
      if (cands[0].res <= NEST_WALK.breakFitMm && cands[1].res <= NEST_WALK.breakFitMm)
        return len(sub(cands[0].p, even)) <= len(sub(cands[1].p, even)) ? cands[0].p : cands[1].p;
    }
    return cands[0].p;
  };

  /** true when rank r may keep its own measured seats (not a leave-one-out hide) */
  const keepsOwnSeats = (r: number) => !!byRank.get(r)?.outer && !inp.hide?.has(r);
  /** Fill non-anchor ranks from the current anchors (stepped / extrapolate one). */
  const fillFromAnchors = () => {
    for (const r of allRanks) {
      for (const j of cornerJs) {
        if (anchors.has(r)) continue;
        // closed non-hidden outers keep matched seats; leave-one-out hides are refilled
        if (keepsOwnSeats(r)) continue;
        // clear previous fill (incl. frozen hide seats from the outer match)
        if (
          tracks[j].state[r] === 'interpolated' ||
          tracks[j].state[r] === 'extrapolated' ||
          (inp.hide?.has(r) && tracks[j].state[r] === 'etalon')
        ) {
          tracks[j].pos[r] = null;
          tracks[j].state[r] = null;
        }
      }
    }
    const aRanks = [...anchors].sort((a, b) => a - b);
    if (!aRanks.length) return;
    const minA = aRanks[0];
    const maxA = aRanks[aRanks.length - 1];
    const below = allRanks.filter((r) => r < minA).sort((a, b) => b - a);
    const above = allRanks.filter((r) => r > maxA).sort((a, b) => a - b);
    for (const r of allRanks) {
      if (anchors.has(r)) continue;
      if (keepsOwnSeats(r)) continue;
      const loA = [...aRanks].filter((x) => x < r).pop();
      const hiA = aRanks.find((x) => x > r);
      if (loA != null && hiA != null) {
        for (const j of cornerJs) {
          if (!tracks[j].pos[loA] || !tracks[j].pos[hiA]) continue;
          tracks[j].pos[r] = steppedCorner(j, r, loA, hiA);
          tracks[j].state[r] = 'interpolated';
        }
      } else if (hiA == null && loA != null && above[0] === r && aRanks.length >= 2) {
        const b = aRanks[aRanks.length - 2];
        const w = (sizeStep(r) - sizeStep(b)) / (sizeStep(loA) - sizeStep(b) || 1);
        for (const j of cornerJs) {
          if (!tracks[j].pos[b] || !tracks[j].pos[loA]) continue;
          tracks[j].pos[r] = lerp(tracks[j].pos[b]!, tracks[j].pos[loA]!, w);
          tracks[j].state[r] = 'extrapolated';
        }
      } else if (loA == null && hiA != null && below[0] === r && aRanks.length >= 2) {
        const b = aRanks[1];
        const w = (sizeStep(r) - sizeStep(b)) / (sizeStep(hiA) - sizeStep(b) || 1);
        for (const j of cornerJs) {
          if (!tracks[j].pos[b] || !tracks[j].pos[hiA]) continue;
          tracks[j].pos[r] = lerp(tracks[j].pos[b]!, tracks[j].pos[hiA]!, w);
          tracks[j].state[r] = 'extrapolated';
        }
      }
    }
  };

  if (hasCorners && cornerJs.length) {
    const etalonCs = cornerJs.map((j) => lms[j].p);
    const etalonNrms = cornerJs.map((j) => lms[j].nrm);
    const matchOpts = { nrms: etalonNrms, residMm: NEST_WALK.firstStepMm };
    /** matched corners from every closed outline (incl. hidden) — demotion duplicate check */
    const rawCorners = new Map<number, PtMm[]>();
    const cornersOf = (r: number): PtMm[] | null => {
      const o = byRank.get(r)?.outer;
      if (!o || o.length < 3) return null;
      const cr = canonRing(o);
      return nestCorners(cr.pts).map((c) => cr.pts[c.i]);
    };
    // pass 1: equal-count matches against the etalon (absolute distance is fine near E).
    // Hidden sizes (leave-one-out) still get track seats so demotion can bracket through them.
    for (const r of allRanks) {
      const cs = cornersOf(r);
      if (!cs || cs.length !== etalonCs.length) continue;
      const matched = matchCorners(etalonCs, cs, matchOpts);
      if (!matched) continue;
      rawCorners.set(r, matched);
      cornerJs.forEach((j, i) => {
        tracks[j].pos[r] = matched[i];
        tracks[j].hit[r] = null;
        if (isClosedSize(r)) {
          tracks[j].state[r] = r === E ? 'etalon' : 'measured';
        } else {
          // frozen seat for demotion; not an anchor and not cleared by fillFromAnchors
          tracks[j].state[r] = 'etalon';
        }
      });
      if (isClosedSize(r)) anchors.add(r);
    }
    // pass 2: sizes with extra corners — match against a prediction from the nearest anchors
    // (stepped between, or extrapolated from the two nearest on one side). Iterate so a new
    // anchor can seed the next size out.
    const predictCorners = (r: number): PtMm[] | null => {
      const aRanks = [...anchors].sort((a, b) => a - b);
      if (aRanks.length < 1) return null;
      const loA = [...aRanks].filter((x) => x < r).pop();
      const hiA = aRanks.find((x) => x > r);
      const out: PtMm[] = [];
      for (const j of cornerJs) {
        let p: PtMm | null = null;
        if (loA != null && hiA != null && tracks[j].pos[loA] && tracks[j].pos[hiA]) {
          p = steppedCorner(j, r, loA, hiA);
        } else if (loA != null && aRanks.length >= 2) {
          const b = [...aRanks].filter((x) => x < loA).pop() ?? aRanks.find((x) => x > loA);
          if (b != null && tracks[j].pos[b] && tracks[j].pos[loA]) {
            const w = (sizeStep(r) - sizeStep(b)) / (sizeStep(loA) - sizeStep(b) || 1);
            p = lerp(tracks[j].pos[b]!, tracks[j].pos[loA]!, w);
          }
        } else if (hiA != null && aRanks.length >= 2) {
          const b = aRanks.find((x) => x > hiA) ?? [...aRanks].filter((x) => x < hiA).pop();
          if (b != null && tracks[j].pos[b] && tracks[j].pos[hiA]) {
            const w = (sizeStep(r) - sizeStep(b)) / (sizeStep(hiA) - sizeStep(b) || 1);
            p = lerp(tracks[j].pos[b]!, tracks[j].pos[hiA]!, w);
          }
        }
        if (!p) return null;
        out.push(p);
      }
      return out;
    };
    for (let guard = 0; guard < allRanks.length; guard++) {
      let added = false;
      // prefer sizes closest to an existing anchor so predictions stay local
      const aRanks = [...anchors].sort((a, b) => a - b);
      const cand = allRanks
        .filter((r) => !anchors.has(r) && isClosedSize(r))
        .map((r) => ({
          r,
          dist: Math.min(...aRanks.map((a) => Math.abs(sizeStep(r) - sizeStep(a)))),
        }))
        .sort((u, v) => u.dist - v.dist);
      for (const { r } of cand) {
        const cs = cornersOf(r);
        if (!cs || cs.length <= etalonCs.length) continue;
        const pred = predictCorners(r);
        if (!pred) continue;
        const matched = matchCorners(pred, cs, matchOpts);
        if (!matched) continue;
        rawCorners.set(r, matched);
        cornerJs.forEach((j, i) => {
          tracks[j].pos[r] = matched[i];
          tracks[j].state[r] = 'measured';
          tracks[j].hit[r] = null;
        });
        anchors.add(r);
        added = true;
      }
      if (!added) break;
    }
    // also record equal/subset matches for hidden closed sizes (demotion stuckDist)
    for (const r of allRanks) {
      if (rawCorners.has(r) || !byRank.get(r)?.outer) continue;
      const cs = cornersOf(r);
      if (!cs) continue;
      const target = cs.length === etalonCs.length ? etalonCs : predictCorners(r);
      if (!target) continue;
      const matched = matchCorners(target, cs, matchOpts);
      if (matched) rawCorners.set(r, matched);
    }
    // validate per corner: untrusted corners are replaced by the stepped prediction (size
    // stays an anchor); whole size when ≥2 corners fail OR a failing corner is stuck (≤1 mm
    // from the same corner of an adjacent size). Demotion neighbours are taken from every
    // size that has an outer (including `hide`) so leave-one-out does not widen the bracket
    // and falsely demote a good size (Leah C10 when 12 is hidden).
    const demotedSet = new Set<number>();
    const untrusted = new Set<string>();
    const closedOuterRanks = allRanks.filter((x) => !!byRank.get(x)?.outer);
    const interpCorner = (rs: number, js: number, aRanks: number[]) => {
      const loA = [...aRanks].filter((x) => x < rs).pop();
      const hiA = aRanks.find((x) => x > rs);
      if (loA != null && hiA != null && tracks[js].pos[loA] && tracks[js].pos[hiA]) {
        tracks[js].pos[rs] = steppedCorner(js, rs, loA, hiA);
        tracks[js].state[rs] = 'interpolated';
        return;
      }
      if (loA != null && aRanks.length >= 2) {
        const b = [...aRanks].filter((x) => x < loA).pop() ?? aRanks.find((x) => x > loA);
        if (b != null && tracks[js].pos[b] && tracks[js].pos[loA]) {
          const w = (sizeStep(rs) - sizeStep(b)) / (sizeStep(loA) - sizeStep(b) || 1);
          tracks[js].pos[rs] = lerp(tracks[js].pos[b]!, tracks[js].pos[loA]!, w);
          tracks[js].state[rs] = 'extrapolated';
        }
      }
    };
    /** nearest distance of corner j at size a to the same corner on an adjacent closed size */
    const stuckDistOf = (a: number, j: number, iC: number): number | null => {
      if (iC < 0 || !rawCorners.has(a)) return null;
      const pa = rawCorners.get(a)![iC];
      let best: number | null = null;
      for (const [b, cs] of rawCorners) {
        if (b === a) continue;
        const gap = Math.abs(sizeStep(a) - sizeStep(b));
        if (gap < 1e-9 || gap > 4) continue;
        const d = dist(pa, cs[iC]);
        if (best == null || d < best) best = d;
      }
      return best;
    };
    for (let round = 0; round < 3; round++) {
      fillFromAnchors();
      const aRanks = [...anchors].sort((a, b) => a - b);
      type Fail = {
        j: number;
        errMm: number;
        predLo: PtMm;
        predHi: PtMm;
        agreeMm: number;
        stuckDistMm: number | null;
        gradeStepMm: number;
      };
      let pick: { rank: number; fails: Fail[]; whole: boolean; score: number } | null = null;
      for (const a of aRanks) {
        if (a === E) continue;
        // neighbours by closed outers (not by anchors alone) so a hidden LOO size still
        // brackets its adjacent anchors for the demotion check; skip already-demoted ranks
        const nbrs = closedOuterRanks.filter((x) => !demotedSet.has(x));
        const loA = [...nbrs].filter((x) => x < a).pop();
        const hiA = nbrs.find((x) => x > a);
        const loPrev = loA != null ? [...nbrs].filter((x) => x < loA).pop() : undefined;
        const hiNext = hiA != null ? nbrs.find((x) => x > hiA) : undefined;
        if (loA == null && hiA == null) continue;
        const adjWrong =
          demotedSet.has(a - 1) ||
          demotedSet.has(a + 1) ||
          (loA != null && demotedSet.has(loA)) ||
          (hiA != null && demotedSet.has(hiA));
        const fails: Fail[] = [];
        for (const j of cornerJs) {
          if (untrusted.has(`${a}:${j}`)) continue;
          if (tracks[j].state[a] !== 'measured' && tracks[j].state[a] !== 'etalon') continue;
          const actual = tracks[j].pos[a]!;
          let predLo: PtMm | null = null;
          let predHi: PtMm | null = null;
          if (loA != null && loPrev != null && tracks[j].pos[loA] && tracks[j].pos[loPrev]) {
            const s = unitStep(j, loPrev, loA);
            if (s) predLo = add(tracks[j].pos[loA]!, mul(s, sizeStep(a) - sizeStep(loA)));
          }
          if (hiA != null && hiNext != null && tracks[j].pos[hiA] && tracks[j].pos[hiNext]) {
            const s = unitStep(j, hiA, hiNext);
            if (s) predHi = sub(tracks[j].pos[hiA]!, mul(s, sizeStep(hiA) - sizeStep(a)));
          }
          let loo: PtMm | null = null;
          if (loA != null && hiA != null && tracks[j].pos[loA] && tracks[j].pos[hiA]) {
            loo = steppedCorner(j, a, loA, hiA);
          }
          const both = !!(predLo && predHi);
          const agree = both ? dist(predLo!, predHi!) : 0;
          const avg = both ? lerp(predLo!, predHi!, 0.5) : predLo ?? predHi ?? loo;
          if (!avg) continue;
          const err = dist(actual, avg);
          const looErr = loo ? dist(actual, loo) : 0;
          const iC = cornerJs.indexOf(j);
          const stuckDistMm = stuckDistOf(a, j, iC);
          const stuck = stuckDistMm != null && stuckDistMm <= 1;
          const hit =
            (both && agree <= 1 && err > 2) ||
            (!both && adjWrong && err > 2) ||
            (loo != null && looErr > 10 && stuck);
          if (!hit) continue;
          // local grade step at this corner (from the outside intervals, else the LOO chord)
          let gradeStep = 0;
          if (loA != null && loPrev != null) {
            const s = unitStep(j, loPrev, loA);
            if (s) gradeStep = Math.max(gradeStep, len(s) * Math.abs(sizeStep(a) - sizeStep(loA)));
          }
          if (hiA != null && hiNext != null) {
            const s = unitStep(j, hiA, hiNext);
            if (s) gradeStep = Math.max(gradeStep, len(s) * Math.abs(sizeStep(hiA) - sizeStep(a)));
          }
          if (
            !gradeStep &&
            loA != null &&
            hiA != null &&
            tracks[j].pos[loA] &&
            tracks[j].pos[hiA]
          ) {
            const ds = sizeStep(hiA) - sizeStep(loA) || 1;
            gradeStep =
              (len(sub(tracks[j].pos[hiA]!, tracks[j].pos[loA]!)) / Math.abs(ds)) *
              Math.min(
                Math.abs(sizeStep(a) - sizeStep(loA)),
                Math.abs(sizeStep(hiA) - sizeStep(a)),
              );
          }
          fails.push({
            j,
            errMm: Math.round(Math.max(err, looErr) * 100) / 100,
            predLo: predLo ?? loo ?? avg,
            predHi: predHi ?? loo ?? avg,
            agreeMm: Math.round(agree * 100) / 100,
            stuckDistMm: stuckDistMm != null ? Math.round(stuckDistMm * 100) / 100 : null,
            gradeStepMm: Math.round(gradeStep * 100) / 100,
          });
        }
        if (!fails.length) continue;
        // whole size: ≥2 fails, OR stuck ≤1 mm with err ≥ max(5, 0.5 × local grade step)
        const stuckWhole = (f: (typeof fails)[0]) =>
          f.stuckDistMm != null &&
          f.stuckDistMm <= 1 &&
          f.errMm >= Math.max(5, 0.5 * f.gradeStepMm);
        const whole = fails.length >= 2 || fails.some(stuckWhole);
        const worst = fails.reduce((x, y) => (y.errMm > x.errMm ? y : x));
        const score =
          (fails.some(stuckWhole) ? 1000 : 0) + worst.errMm + (whole ? 100 : 0) + fails.length;
        if (!pick || score > pick.score) pick = { rank: a, fails, whole, score };
      }
      if (!pick) break;
      const worst = pick.fails.reduce((x, y) => (y.errMm > x.errMm ? y : x));
      demoted.push({
        rank: pick.rank,
        corner: worst.j,
        errMm: worst.errMm,
        predLo: worst.predLo,
        predHi: worst.predHi,
        agreeMm: worst.agreeMm,
        failCorners: pick.fails.length,
        wholeSize: pick.whole,
        stuckDistMm: worst.stuckDistMm,
        fails: pick.fails.map((f) => ({
          j: f.j,
          errMm: f.errMm,
          stuckDistMm: f.stuckDistMm,
        })),
      });
      if (pick.whole) {
        anchors.delete(pick.rank);
        demotedSet.add(pick.rank);
        for (const j of cornerJs) {
          tracks[j].pos[pick.rank] = null;
          tracks[j].state[pick.rank] = null;
          untrusted.delete(`${pick.rank}:${j}`);
        }
      } else {
        for (const f of pick.fails) {
          untrusted.add(`${pick.rank}:${f.j}`);
          interpCorner(pick.rank, f.j, aRanks);
        }
      }
    }
    fillFromAnchors();
    // demoted whole sizes must never remain / reappear as anchors (LOO or build)
    for (const d of demoted) {
      if (!d.wholeSize) continue;
      anchors.delete(d.rank);
      demotedSet.add(d.rank);
      for (const j of cornerJs) {
        tracks[j].pos[d.rank] = null;
        tracks[j].state[d.rank] = null;
      }
    }
  }
  /** Nearest anchors below and above r (for edge blending). Skips demoted ranks. */
  const bracket = (r: number): [number, number] | [number] | null => {
    const a = [...anchors]
      .filter((x) => !demoted.some((d) => d.wholeSize && d.rank === x))
      .sort((x, y) => x - y);
    if (!a.length) return null;
    const loA = [...a].filter((x) => x < r).pop();
    const hiA = a.find((x) => x > r);
    if (loA != null && hiA != null) return [loA, hiA];
    if (loA != null) return [loA];
    if (hiA != null) return [hiA];
    return null;
  };
  const weightOf = (r: number, a: number, b: number) =>
    (sizeStep(r) - sizeStep(a)) / (sizeStep(b) - sizeStep(a) || 1);

  /**
   * One-way trace in size r's lines from `start` along the guide toward its end: the line through
   * the start that runs along the guide, on at each step; at a junction (another line within
   * `traceJunctionMm`) the continuation nearer the guide `traceAheadSteps` on is taken (hysteresis);
   * at a line end the trace hops to a line within 0.5 mm. Stops at the guide's end, or where the
   * line leaves the guide by `traceCorridorMm`.
   */
  const traceRun = (r: number, G: Guide, start: PtMm, tol: number) => {
    const idx = tgt(r);
    const end = G.pts[G.pts.length - 1];
    const ahead = NEST_WALK.traceAheadSteps;
    const devAhead = (k: number, sg: number, gi: number) => {
      let m = k;
      for (let s = 0; s < ahead; s++) {
        const nx = idx.along(m, sg);
        if (nx == null) break;
        m = nx;
      }
      return { m, p: projOn(G, idx.pt(m), gi, 16) };
    };
    let best: { k: number; sg: number; score: number } | null = null;
    idx.near(start, tol, (k, d) => {
      const p0 = projOn(G, idx.pt(k), 0, 6);
      for (const sg of [1, -1]) {
        const a = devAhead(k, sg, p0.gi);
        if (a.m === k || a.p.s <= p0.s + 0.5) continue;
        if (a.p.d > NEST_WALK.traceCorridorMm) continue;
        const score = d + a.p.d + (idx.pts[k].own ? 0 : 0.05);
        if (!best || score < best.score) best = { k, sg, score };
      }
    });
    const out: TracePt[] = [];
    if (!best) return { path: out, reached: false };
    const b0 = best as { k: number; sg: number };
    let cur = b0.k;
    let sg = b0.sg;
    let pj = projOn(G, idx.pt(cur), 0, 6);
    out.push({ p: idx.pt(cur), line: idx.pts[cur].line, s: pj.s });
    const maxSteps = Math.ceil((1.6 * G.total + 20) / NEST_WALK.stepMm);
    for (let step = 0; step < maxSteps; step++) {
      const q = idx.pt(cur);
      if (dist(q, end) <= NEST_WALK.traceEndMm) return { path: out, reached: true };
      // a junction: the other lines through q, each way, against the current line
      const here = devAhead(cur, sg, pj.gi);
      let alt: { k: number; sg: number; d: number } | null = null;
      idx.near(q, NEST_WALK.traceJunctionMm, (m) => {
        if (idx.pts[m].line === idx.pts[cur].line) return;
        for (const s2 of [1, -1]) {
          const a = devAhead(m, s2, pj.gi);
          if (a.m === m || a.p.s <= pj.s + 0.5) continue;
          if (!alt || a.p.d < alt.d) alt = { k: m, sg: s2, d: a.p.d };
        }
      });
      const ended = here.m === cur;
      const al = alt as { k: number; sg: number; d: number } | null;
      if (al && (ended || al.d + NEST_WALK.traceHysteresisMm < here.p.d)) {
        cur = al.k;
        sg = al.sg;
        pj = projOn(G, idx.pt(cur), pj.gi, 6);
        out.push({ p: idx.pt(cur), line: idx.pts[cur].line, s: pj.s });
        continue;
      }
      if (ended) {
        // a line end: the nearest line within 0.5 mm that goes on along the guide
        let hop: { k: number; sg: number; d: number } | null = null;
        idx.near(q, NEST_WALK.onLineMm, (m) => {
          if (idx.pts[m].line === idx.pts[cur].line) return;
          for (const s2 of [1, -1]) {
            const a = devAhead(m, s2, pj.gi);
            if (a.m === m || a.p.s <= pj.s + 0.5 || a.p.d > NEST_WALK.traceCorridorMm) continue;
            if (!hop || a.p.d < hop.d) hop = { k: m, sg: s2, d: a.p.d };
          }
        });
        const h = hop as { k: number; sg: number; d: number } | null;
        if (!h) break;
        cur = h.k;
        sg = h.sg;
        pj = projOn(G, idx.pt(cur), pj.gi, 6);
        out.push({ p: idx.pt(cur), line: idx.pts[cur].line, s: pj.s });
        continue;
      }
      const nx = idx.along(cur, sg)!;
      const pn = projOn(G, idx.pt(nx), pj.gi, 16);
      if (pn.d > NEST_WALK.traceCorridorMm || pn.s > G.total + 1) break;
      cur = nx;
      pj = pn;
      out.push({ p: idx.pt(cur), line: idx.pts[cur].line, s: pj.s });
    }
    return { path: out, reached: false };
  };

  type EdgeTrace = {
    /** the stretch read from the start corner on, and the one read back from the end corner */
    head: TracePt[];
    tail: TracePt[];
    full: boolean;
    loops: (Loop & { cut: boolean })[];
  };
  /** Edge (a, b) in size r along guide G (from a's position to b's): traced from both ends. */
  const traceEdge = (r: number, G: Guide, aOn: boolean, bOn: boolean): EdgeTrace => {
    const loose = NEST_WALK.traceStartLooseMm;
    const tolA = aOn ? NEST_WALK.traceStartMm : loose;
    const tolB = bOn ? NEST_WALK.traceStartMm : loose;
    const loops: (Loop & { cut: boolean })[] = [];
    const clean = (p: TracePt[]) => {
      const c = cutLoops(p);
      let ok = true;
      for (const l of c.loops) {
        const cut = l.mm <= NEST_WALK.loopKeepMm;
        loops.push({ ...l, cut });
        if (!cut) ok = false;
      }
      return ok ? c.path : null;
    };
    const f = traceRun(r, G, G.pts[0], tolA);
    if (f.reached) {
      const p = clean(f.path);
      return p
        ? { head: p, tail: [], full: true, loops }
        : { head: [], tail: [], full: false, loops };
    }
    const Gr = guideOf(G.pts.slice().reverse());
    const bk = traceRun(r, Gr, Gr.pts[0], tolB);
    const back: TracePt[] = bk.path.map((q) => ({ ...q, s: G.total - q.s })).reverse();
    if (bk.reached) {
      const p = clean(back);
      return p
        ? { head: p, tail: [], full: true, loops }
        : { head: [], tail: [], full: false, loops };
    }
    let head = clean(f.path);
    let tail = clean(back);
    if (!head || !tail) return { head: [], tail: [], full: false, loops };
    // the two reads overlap: the head stops where the tail begins
    if (head.length && tail.length) {
      const sT = tail[0].s;
      const cut = head.findIndex((q) => q.s >= sT);
      if (cut >= 0) head = head.slice(0, cut);
      if (head.length) {
        const sH = head[head.length - 1].s;
        tail = tail.filter((q) => q.s > sH);
      }
    }
    return { head, tail, full: false, loops };
  };
  /** The guide of edge (a, b) in size r: its corners there and its arcs at `base` moved as the corners. */
  const edgeGuide = (ed: { a: number; b: number; arcs: number[] }, r: number, base: number) => {
    const A = tracks[ed.a].pos[r]!;
    const B = tracks[ed.b].pos[r]!;
    const A0 = tracks[ed.a].pos[base] ?? A;
    const B0 = tracks[ed.b].pos[base] ?? B;
    const pts: PtMm[] = [A];
    const js: number[] = [ed.a];
    for (const j of ed.arcs) {
      const p0 = tracks[j].pos[base] ?? deformed(j, ed.a, ed.b, base);
      if (!p0) continue;
      pts.push(add(p0, lerp(sub(A, A0), sub(B, B0), lms[j].t)));
      js.push(j);
    }
    pts.push(B);
    js.push(ed.b);
    return { G: guideOf(pts), js };
  };
  /** Size r's arcs of an edge on its traced stretches, by arc-length fraction. */
  const placeArcs = (
    ed: { a: number; b: number; arcs: number[] },
    r: number,
    tr: EdgeTrace,
    G: Guide,
  ) => {
    const along = (seg: TracePt[], s0: number, s1: number, s: number) => {
      const pts = seg.map((q) => q.p);
      const c = cumOf(pts);
      const L = c[c.length - 1];
      return atLength(pts, c, s1 > s0 ? ((s - s0) / (s1 - s0)) * L : 0);
    };
    for (const j of ed.arcs) {
      const T = tracks[j];
      if ((T.state[r] === 'measured' && !scaffold[j].has(r)) || T.state[r] === 'etalon') continue;
      const t = lms[j].t;
      let q: PtMm | null = null;
      if (tr.full && tr.head.length > 1) q = along(tr.head, 0, 1, t);
      else {
        const s = t * G.total;
        const h = tr.head;
        const tl = tr.tail;
        if (h.length > 1 && s <= h[h.length - 1].s) q = along(h, 0, h[h.length - 1].s, s);
        else if (tl.length > 1 && s >= tl[0].s) q = along(tl, tl[0].s, G.total, s);
      }
      if (q) {
        T.pos[r] = q;
        T.state[r] = 'measured';
        T.hit[r] = null;
        scaffold[j].delete(r);
      }
    }
  };

  /**
   * Arc sample snap in size r from a seat: the nearest line point along ±normal (±30°), tangent
   * aligned. `out` (first step, nothing predicted): only on the side the walk grows to.
   */
  const findArc = (j: number, r: number, seat: PtMm, R: number, out = 0) => {
    const L = lms[j];
    const idx = tgt(r);
    let best: { k: number; d: number; own: boolean } | null = null;
    idx.near(seat, R, (k, d) => {
      const q = idx.pts[k];
      if (Math.abs(q.tx * L.tan.x + q.ty * L.tan.y) < cosT) return;
      if (d > 0.5) {
        const a = angBetween(sub(q, seat), L.nrm);
        if (Math.min(a, Math.PI - a) > coneR) return;
        if (out && dot(sub(q, seat), L.nrm) * out < 0) return;
      }
      // the size's own line wins over a common one beside it (a shoulder drawn by both)
      const b = best as { k: number; d: number; own: boolean } | null;
      if (!b || (q.own && !b.own) || (q.own === b.own && d < b.d)) best = { k, d, own: q.own };
    });
    if (!best) return null;
    const k = (best as { k: number }).k;
    return { q: idx.pt(k), k, d: (best as { d: number }).d };
  };

  const stepOf = (j: number, r: number, dirn: number): PtMm | null => {
    const a = tracks[j].pos[r - dirn];
    const b = tracks[j].pos[r];
    return a && b ? sub(b, a) : null;
  };

  /** Points along the line of hit k, both ways, up to `mm`, with the line's ends carried on 3 mm. */
  const walkOut = (idx: LineIndex, k: number, mm: number) => {
    const out: { p: PtMm; s: number; k: number | null }[] = [{ p: idx.pt(k), s: 0, k }];
    const steps = Math.round(mm / NEST_WALK.stepMm);
    for (const sg of [1, -1]) {
      let last = k;
      let s = 1;
      for (; s <= steps; s++) {
        const nx = idx.along(k, sg * s);
        if (nx == null) break;
        out.push({ p: idx.pt(nx), s, k: nx });
        last = nx;
      }
      if (s <= steps) {
        // an end: the wall-bridge reach
        const prev = idx.along(last, -sg) ?? last;
        const t = unit(sub(idx.pt(last), idx.pt(prev)));
        for (let e = 1; e * NEST_WALK.stepMm <= NEST_WALK.bridgeMm; e++)
          out.push({ p: add(idx.pt(last), mul(t, e * NEST_WALK.stepMm)), s: s - 1 + e, k: null });
      }
    }
    return out;
  };

  /**
   * Corner j in size r from the hits of its two edges: on one line, the extreme along the bisector
   * between the hits; on two lines, where they first meet (≤ 0.5 mm, an end carried ≤ 3 mm).
   */
  const meet = (j: number, r: number, ka: number, kb: number, reach: number) => {
    const idx = tgt(r);
    const L = lms[j];
    const A = idx.pts[ka];
    const B = idx.pts[kb];
    const bis = unit(sub(L.tin!, L.tout!));
    if (A.line === B.line) {
      const seg = walkTo(idx, ka, kb, Math.round((2 * reach) / NEST_WALK.stepMm));
      if (!seg || seg.length < 2) return null;
      let best = seg[0];
      for (const q of seg) if (dot(q, bis) > dot(best, bis)) best = q;
      return best;
    }
    const W1 = walkOut(idx, ka, reach);
    const W2 = walkOut(idx, kb, reach);
    let best: { p: PtMm; s: number } | null = null;
    for (const a of W1)
      for (const b of W2) {
        if (best && a.s + b.s >= best.s) continue;
        if (dist(a.p, b.p) <= NEST_WALK.onLineMm) best = { p: lerp(a.p, b.p, 0.5), s: a.s + b.s };
      }
    return best?.p ?? null;
  };

  /** The arcs nearest corner j on its two sides (ring order, within 15 mm of the etalon arc). */
  const sidesOf = (j: number): [number[], number[]] => {
    const n = ring.length;
    const before: number[] = [];
    const after: number[] = [];
    for (let d = 1; d < M && before.length < 3; d++) {
      const m = (j - d + M) % M;
      if (isCorner(m) || (lms[j].i - lms[m].i + n) % n > 15 / NEST_WALK.stepMm) break;
      before.push(m);
    }
    for (let d = 1; d < M && after.length < 3; d++) {
      const m = (j + d) % M;
      if (isCorner(m) || (lms[m].i - lms[j].i + n) % n > 15 / NEST_WALK.stepMm) break;
      after.push(m);
    }
    return [before, after];
  };

  /** Corner j in size `r`, `f` sizes on from prevR (1, or 2 over a skipped size). */
  const measureCorner = (j: number, r: number, prevR: number, f: number, dirn: number) => {
    const T = tracks[j];
    const p = T.pos[prevR]!;
    const lastC = stepOf(j, prevR, dirn);
    const side = (arcs: number[]) => {
      for (const m of arcs) {
        const Tm = tracks[m];
        const pm = Tm.pos[prevR];
        if (!pm) continue;
        // beside a corner an arc moves either with the corner (a hem corner slides down the centre
        // front while the centre-front samples stay on their line) or as it did itself: both seats
        // are tried, the hit nearer its seat wins
        let best: { k: number; d: number } | null = null;
        const seats = [lastC, stepOf(m, prevR, dirn)];
        for (const last of seats.some(Boolean) ? seats.filter(Boolean) : [null]) {
          const first = !last;
          const pred = mul(last ?? { x: 0, y: 0 }, f);
          const R = first
            ? NEST_WALK.firstStepMm * f
            : Math.max(NEST_WALK.snapMinMm, NEST_WALK.snapPredK * len(pred) + 2, 2 * Tm.maxResid) *
              f;
          const h = findArc(m, r, add(pm, pred), R, first ? dirn : 0);
          if (DBG)
            console.log(
              `NW   side #${m} of #${j} r${r} seat ${fmt(add(pm, pred))} R ${R.toFixed(1)} → ${h ? fmt(h.q) : '-'}`,
            );
          if (h && (!best || h.d < best.d)) best = { k: h.k, d: h.d };
        }
        if (best) return best.k;
      }
      return null;
    };
    const [bef, aft] = sidesOf(j);
    const ka = side(bef);
    const kb = side(aft);
    if (ka != null && kb != null) {
      const q = meet(j, r, ka, kb, 20 + f * len(lastC ?? { x: 0, y: 0 }));
      if (DBG)
        console.log(
          `NW corner #${j} r${r} f${f} prev ${p.x.toFixed(1)},${p.y.toFixed(1)} ka ${fmt(tgt(r).pts[ka])} L${tgt(r).pts[ka].line}${tgt(r).pts[ka].own ? 'o' : 'c'} kb ${fmt(tgt(r).pts[kb])} L${tgt(r).pts[kb].line}${tgt(r).pts[kb].own ? 'o' : 'c'} → ${q ? fmt(q) : '-'}`,
        );
      if (q) return q;
    }
    // two edges that do not meet: a hole at the corner (Leah D 22: the hem stops 15 mm short of
    // the centre front) — the size after it is measured and this one interpolated. No search
    // for an extreme: on a sheet of nested sizes, another size's line always offers one
    return null;
  };

  const walk = (dirn: 1 | -1) => {
    for (let r = E + dirn; r >= lo && r <= hi; r += dirn) {
      const prevR = r - dirn;
      const nextR = r + dirn;
      const hasNext = nextR >= lo && nextR <= hi;
      // past every rank asked for (two sizes more: a skip lands on the next, the stepped-grade
      // regrade reads the one after); the first step is always taken — the other way starts from it
      if (
        inp.only &&
        r !== E + dirn &&
        ![...inp.only].some((x) => (dirn > 0 ? x >= r - 2 : x <= r + 2))
      )
        break;
      const place = (j: number, q: PtMm | null, q2: PtMm | null) => {
        const T = tracks[j];
        const p = T.pos[prevR]!;
        const last = stepOf(j, prevR, dirn);
        if (q) {
          T.pos[r] = q;
          T.state[r] = 'measured';
        } else if (q2) {
          T.pos[nextR] = q2;
          T.state[nextR] = 'measured';
          T.pos[r] = lerp(p, q2, 0.5);
          T.state[r] = 'interpolated';
        } else if (!hasNext && last && T.state[prevR] !== 'extrapolated') {
          T.pos[r] = add(p, last);
          T.state[r] = 'extrapolated';
        }
      };
      // corners first, from their two edges
      for (let j = 0; j < M; j++) {
        if (!isCorner(j) || tracks[j].pos[r] || !tracks[j].pos[prevR]) continue;
        const q = measureCorner(j, r, prevR, 1, dirn);
        const q2 = !q && hasNext ? measureCorner(j, nextR, prevR, 2, dirn) : null;
        place(j, q, q2);
      }
      // arcs: seated where the corner moves put them (blend by the arc parameter) plus the bulge
      // the last step showed, then snapped along the normal
      for (let j = 0; j < M; j++) {
        const T = tracks[j];
        if (isCorner(j) || !searched(j) || T.pos[r] || !T.pos[prevR]) continue;
        const p = T.pos[prevR]!;
        const last = stepOf(j, prevR, dirn);
        const ce = cornerOfEdge.get(lms[j].edge);
        const blendTo = (rt: number) => {
          if (!ce) return null;
          const a0 = tracks[ce[0]].pos;
          const b0 = tracks[ce[1]].pos;
          if (!a0[rt] || !b0[rt] || !a0[prevR] || !b0[prevR]) return null;
          return lerp(sub(a0[rt]!, a0[prevR]!), sub(b0[rt]!, b0[prevR]!), lms[j].t);
        };
        const prevBlend = (() => {
          if (!ce || !last) return null;
          const pp = prevR - dirn;
          const a0 = tracks[ce[0]].pos;
          const b0 = tracks[ce[1]].pos;
          if (!a0[pp] || !b0[pp] || !a0[prevR] || !b0[prevR]) return null;
          return lerp(sub(a0[prevR]!, a0[pp]!), sub(b0[prevR]!, b0[pp]!), lms[j].t);
        })();
        const resid = last && prevBlend ? sub(last, prevBlend) : { x: 0, y: 0 };
        const seatFor = (rt: number, f: number) => {
          const b0 = blendTo(rt) ?? (rt !== r ? blendTo(r) : null);
          const b = b0 && rt !== r && !blendTo(rt) ? mul(b0, f) : b0;
          if (b) return add(p, add(b, mul(resid, f)));
          return add(p, mul(last ?? { x: 0, y: 0 }, f));
        };
        const first = !last && !blendTo(r);
        const pred1 = sub(seatFor(r, 1), p);
        const Rs = first
          ? NEST_WALK.firstStepMm
          : Math.max(
              NEST_WALK.snapMinMm,
              NEST_WALK.snapK * T.maxResid,
              NEST_WALK.snapPredK * len(pred1) * (ce ? 0.3 : 1) + 2,
            );
        const h = findArc(j, r, seatFor(r, 1), Rs, first ? dirn : 0);
        let h2: ReturnType<typeof findArc> = null;
        if (h) T.maxResid = Math.max(T.maxResid, h.d);
        else if (hasNext) h2 = findArc(j, nextR, seatFor(nextR, 2), 2 * Rs, first ? dirn : 0);
        place(j, h?.q ?? null, h2?.q ?? null);
        if (h) T.hit[r] = h.k;
        if (h2) T.hit[nextR] = h2.k;
        if (T.pos[r]) scaffoldArc(j, r);
        if (h2) scaffoldArc(j, nextR);
      }
      // gradual steps; a break that most of its edge does not share is replaced
      const broke = new Array<boolean>(M).fill(false);
      for (let j = 0; j < M; j++) {
        if (!searched(j)) continue;
        const s1 = stepOf(j, r, dirn);
        const s0 = stepOf(j, prevR, dirn);
        if (!s1 || !s0 || tracks[j].state[r] !== 'measured') continue;
        const a = len(s0);
        const b = len(s1);
        let why = '';
        if (a < NEST_WALK.smallStepMm && b < NEST_WALK.smallStepMm) {
          if (Math.abs(a - b) > NEST_WALK.smallChangeMm) why = 'len';
        } else if (Math.abs(a - b) > NEST_WALK.stepChange * Math.max(a, b)) why = 'len';
        if (!why && a >= NEST_WALK.smallStepMm && b >= NEST_WALK.smallStepMm)
          if (angBetween(s0, s1) > NEST_WALK.stepTurnDeg * DEG) why = 'turn';
        if (why) {
          broke[j] = true;
          worst.push({ lm: j, rank: r, why });
        }
      }
      const edgeBreak = new Map<number, [number, number]>();
      for (let j = 0; j < M; j++) {
        const e = lms[j].edge;
        const v = edgeBreak.get(e) ?? [0, 0];
        v[0] += broke[j] ? 1 : 0;
        v[1] += 1;
        edgeBreak.set(e, v);
      }
      const replaceAt = (j: number) => {
        // the nearest landmarks on either side (ring order) that hold at r
        const okAt = (m: number) => !broke[m] && !!tracks[m].pos[r] && !!tracks[m].pos[prevR];
        let a = -1;
        let b = -1;
        for (let d = 1; d < M && a < 0; d++) if (okAt((j - d + M) % M)) a = (j - d + M) % M;
        for (let d = 1; d < M && b < 0; d++) if (okAt((j + d) % M)) b = (j + d) % M;
        const p = tracks[j].pos[prevR];
        if (a < 0 || b < 0 || !p) return false;
        const n = ring.length;
        const da = (lms[j].i - lms[a].i + n) % n;
        const db = (lms[b].i - lms[j].i + n) % n;
        const u = da + db > 0 ? da / (da + db) : 0.5;
        const s = lerp(stepOf(a, r, dirn)!, stepOf(b, r, dirn)!, u);
        tracks[j].pos[r] = add(p, s);
        tracks[j].hit[r] = null;
        tracks[j].state[r] = 'replaced';
        scaffoldArc(j, r);
        return true;
      };
      for (let j = 0; j < M; j++) {
        const [nb, nt] = edgeBreak.get(lms[j].edge)!;
        if (broke[j] && nb * 2 <= nt) replaceAt(j);
      }
      // a landmark lost at r takes the place its neighbours imply
      for (let j = 0; j < M; j++)
        if (searched(j) && !tracks[j].pos[r] && tracks[j].pos[prevR]) replaceAt(j);
      // the edges between the corners found: the size's line, the arcs on it by fraction
      for (const ed of edges) {
        if (!tracks[ed.a].pos[r] || !tracks[ed.b].pos[r]) continue;
        const { G } = edgeGuide(ed, r, prevR);
        const tr = traceEdge(
          r,
          G,
          tracks[ed.a].state[r] === 'measured',
          tracks[ed.b].state[r] === 'measured',
        );
        placeArcs(ed, r, tr, G);
      }
      for (let j = 0; j < M; j++) {
        const T = tracks[j];
        const s = stepOf(j, r, dirn);
        if (s && T.state[r] === 'measured') T.maxStep = Math.max(T.maxStep, len(s));
        // a step over a skipped size counts per size
        if (T.state[r] === 'interpolated' && s) T.maxStep = Math.max(T.maxStep, len(s));
      }
    }
  };
  // the first step has nothing to go by: take it toward a closed neighbour; the other way then
  // starts from that step (mirrored) — a seat and a check
  const closedAt = (r: number) => !!byRank.get(r)?.outer && !inp.hide?.has(r);
  const firstDir: 1 | -1 = closedAt(E + 1) || !closedAt(E - 1) ? 1 : -1;
  walk(firstDir);
  walk(firstDir === 1 ? -1 : 1);
  for (let j = 0; j < M; j++)
    for (const r of scaffold[j]) {
      tracks[j].pos[r] = null;
      tracks[j].state[r] = null;
      tracks[j].hit[r] = null;
    }
  // an arc of an edge no line carried: the same arc of the nearest sizes read on both sides, by
  // the corners' moves; with one side only, the etalon edge moved as the corners
  for (const ed of edges)
    for (const j of ed.arcs) {
      const T = tracks[j];
      const known = (k: number) => T.state[k] === 'measured' || T.state[k] === 'etalon';
      const resid = (k: number) => {
        const d = deformed(j, ed.a, ed.b, k);
        return d && T.pos[k] ? sub(T.pos[k]!, d) : null;
      };
      for (let r = lo; r <= hi; r++) {
        if (r === E || T.pos[r]) continue;
        const here = deformed(j, ed.a, ed.b, r);
        if (!here) continue;
        let k0 = r - 1;
        while (k0 >= lo && !known(k0)) k0--;
        let k1 = r + 1;
        while (k1 <= hi && !known(k1)) k1++;
        const r0 = k0 >= lo ? resid(k0) : null;
        const r1 = k1 <= hi ? resid(k1) : null;
        if (r0 && r1) {
          T.pos[r] = add(here, lerp(r0, r1, weightOf(r, k0, k1)));
          T.state[r] = 'interpolated';
        } else {
          // one side only: deform the etalon edge (owner point 4)
          T.pos[r] = here;
          T.state[r] = 'extrapolated';
        }
      }
    }
  regrade(tracks, lms, lo, hi);

  // settle each size on its own measured landmarks: a corner not measured goes where its two edges
  // (lines through their nearest measured arcs) cross; an arc not measured that sits off the place
  // its measured neighbours imply goes there (Leah B 00: extrapolated arcs ran on past a corner)
  for (let r = lo; r <= hi; r++) if (r !== E) settle(r);
  function settle(r: number) {
    const n = ring.length;
    const ok = (m: number) => tracks[m].state[r] === 'measured' && !!tracks[m].pos[r];
    const near = (j: number, sg: 1 | -1, cnt: number, maxMm: number) => {
      const out: number[] = [];
      for (let d = 1; d < M && out.length < cnt; d++) {
        const m = (j + sg * d + M) % M;
        if (
          (sg > 0 ? lms[m].i - lms[j].i + n : lms[j].i - lms[m].i + n) % n >
          maxMm / NEST_WALK.stepMm
        )
          break;
        if (isCorner(m)) break;
        if (ok(m)) out.push(m);
      }
      return out;
    };
    for (let j = 0; j < M; j++) {
      // anchors / step-interpolated corners stay; settle only patches a walk miss
      if (
        !isCorner(j) ||
        ok(j) ||
        !tracks[j].pos[r] ||
        tracks[j].state[r] === 'interpolated' ||
        tracks[j].state[r] === 'extrapolated'
      )
        continue;
      const a = near(j, -1, 2, 25);
      const b = near(j, 1, 2, 25);
      if (a.length < 2 || b.length < 2) continue;
      const pa = tracks[a[0]].pos[r]!;
      const pb = tracks[b[0]].pos[r]!;
      const da = sub(pa, tracks[a[1]].pos[r]!);
      const db = sub(pb, tracks[b[1]].pos[r]!);
      // the two lines pa + s·da, pb + u·db
      const den = da.x * db.y - da.y * db.x;
      if (Math.abs(den) < 1e-9) continue;
      const s = ((pb.x - pa.x) * db.y - (pb.y - pa.y) * db.x) / den;
      const q = add(pa, mul(da, s));
      if (dist(q, tracks[j].pos[r]!) > 15) continue;
      tracks[j].pos[r] = q;
      tracks[j].state[r] = 'replaced';
    }
    for (let j = 0; j < M; j++) {
      const st = tracks[j].state[r];
      if (isCorner(j) || !st || st === 'measured') continue;
      const okc = (m: number) => ok(m) || (isCorner(m) && !!tracks[m].pos[r]);
      let a = -1;
      let b = -1;
      for (let d = 1; d < M && a < 0; d++) if (okc((j - d + M) % M)) a = (j - d + M) % M;
      for (let d = 1; d < M && b < 0; d++) if (okc((j + d) % M)) b = (j + d) % M;
      if (a < 0 || b < 0) continue;
      const ia = (lms[j].i - lms[a].i + n) % n;
      const ib = (lms[b].i - lms[j].i + n) % n;
      // only a local implication: across a long stretch with nothing measured the walk's own
      // interpolation between sizes knows more
      if (Math.max(ia, ib) * NEST_WALK.stepMm > 30) continue;
      const u = ia + ib ? ia / (ia + ib) : 0.5;
      const implied = add(
        lms[j].p,
        lerp(sub(tracks[a].pos[r]!, lms[a].p), sub(tracks[b].pos[r]!, lms[b].p), u),
      );
      const tol = st === 'interpolated' ? 3 : 1;
      if (dist(implied, tracks[j].pos[r]!) <= tol) continue;
      tracks[j].pos[r] = implied;
      tracks[j].state[r] = 'replaced';
    }
  }

  const sizes = new Map<number, NestSizeOut>();
  for (let r = lo; r <= hi; r++) {
    if (inp.only && !inp.only.has(r)) continue;
    const states: Record<LmState, number> = {
      measured: 0,
      interpolated: 0,
      extrapolated: 0,
      replaced: 0,
      etalon: 0,
    };
    let lost = 0;
    for (const T of tracks) {
      const s = T.state[r];
      if (s) states[s]++;
      else lost++;
    }
    if (r !== E) {
      stats.measured += states.measured;
      stats.interpolated += states.interpolated;
      stats.extrapolated += states.extrapolated;
      stats.replaced += states.replaced;
      stats.lost += lost;
    }
    if (lost) continue;
    if (r === E) {
      sizes.set(r, {
        rank: r,
        outer: ring.slice(),
        derived: [],
        derivedMm: 0,
        notches: eRing.notches.slice(),
        states,
      });
      continue;
    }
    sizes.set(r, hasCorners ? buildSizeEdges(r, states) : buildSize(r, states));
  }
  return {
    etalon: E,
    candidates: pick.candidates,
    modeCorners: pick.modeCorners,
    landmarks: lms,
    sizes,
    stats: { ...stats, worst },
    tracks: tracks.map((T) => ({ pos: T.pos, state: T.state })),
    anchors: [...anchors].sort((a, b) => a - b),
    ...(demoted.length ? { demoted } : {}),
  };

  // ───────────────────────── 4. outline ─────────────────────────
  /**
   * Edge by edge: the corner, then the size's line traced to the next corner; where no line carries
   * it, the edge's arcs (the neighbouring sizes' same arcs, else the etalon edge moved as the
   * corners) moved to meet the two read stretches — derived.
   */
  function buildSizeEdges(r: number, states: Record<LmState, number>): NestSizeOut {
    const idx = tgt(r);
    const out: PtMm[] = [];
    const on: boolean[] = [];
    const kindAt: DerivedKind[] = [];
    const srcAt: { j: number; path: boolean; line: number | null }[] = [];
    const loops: NonNullable<NestSizeOut['loops']> = [];
    const edgeFrom: NonNullable<NestSizeOut['edgeFrom']> = [];
    const push = (p: PtMm, isOn: boolean, kind: DerivedKind, j: number, line: number | null) => {
      out.push(p);
      on.push(isOn);
      kindAt.push(kind);
      srcAt.push({ j, path: isOn && line != null, line });
    };
    const kindOf = (js: number[]): DerivedKind => {
      const st = js.map((j) => tracks[j].state[r]);
      if (st.includes('extrapolated')) return 'extrapolated';
      if (st.includes('interpolated') || st.includes('replaced')) return 'interpolated';
      return 'derived';
    };
    // Interior non-anchor: the etalon points moved by the per-point grade shifts (tracks).
    // Own/common replace a point only inside the corridor (≤ onLineMm). No edge re-trace —
    // on small sizes neighbour lines sit 0–1 mm away and the trace hops onto them (gate8).
    // Ends (one-sided) keep the etalon-driven trace below.
    const brAll = bracket(r);
    const interior = !!(brAll && brAll.length === 2) && !anchors.has(r);
    let builtFromBlend = false;

    if (interior && brAll && brAll.length === 2) {
      const ra = brAll[0];
      const rb = brAll[1];
      const oa = byRank.get(ra)?.outer;
      const ob = byRank.get(rb)?.outer;
      // size-step weight for normal-proj insert; paired arc-length blend uses the floor's
      // midpoint (0.5) — a label-step weight across a sparse/demoted skirt misses the true
      // ring by centimetres (Leah E28 w=2/3 → 29 mm, w=1/2 → 14.5 mm = floor).
      const wStep = weightOf(r, ra, rb);
      const w = wStep; // default for insert / primary / track fill
      const nCorners = (o: readonly PtMm[]) => nestCorners(canonRing(o).pts).length;
      const nE = cornerJs.length;
      // leave-one-out must not read the hidden outer's corner count (Leah B26: 6 vs etalon 5)
      const nTarget =
        byRank.get(r)?.outer && !inp.hide?.has(r) ? nCorners(byRank.get(r)!.outer!) : nE;
      const nearSeg = (ring: readonly PtMm[], q: PtMm) => {
        let best = ring[0];
        let bd = Infinity;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const ab = sub(b, a);
          const L2 = dot(ab, ab);
          const t = L2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(q, a), ab) / L2)) : 0;
          const p = add(a, mul(ab, t));
          const d = dist(q, p);
          if (d < bd) [bd, best] = [d, p];
        }
        return best;
      };
      const emitRing = (cur: PtMm[]) => {
        if (cur.length < 3) return false;
        // own lines replace a point in the corridor; common alone can pull the mid onto a
        // neighbour nest (Leah B22 LOO). Leave-one-out has no own lines — keep the blend pure.
        const allowSnap = !inp.hide?.has(r);
        for (const g of cur) {
          const h = allowSnap ? idx.nearest(g, NEST_WALK.onLineMm) : null;
          if (h && idx.pts[h.j].own) {
            push(idx.pt(h.j), true, 'derived', cornerJs[0] ?? 0, idx.pts[h.j].line);
          } else {
            push(g, false, 'interpolated', cornerJs[0] ?? 0, null);
          }
        }
        for (const ed of edges) edgeFrom.push({ a: ed.a, b: ed.b, how: 'blended' });
        return true;
      };
      /** corner-aligned arc-length lerp — needs equal corner counts */
      const pairedAligned = (A: PtMm[], B: PtMm[]): PtMm[] | null => {
        const cA = nestCorners(A).map((c) => A[c.i]);
        const cB = nestCorners(B).map((c) => B[c.i]);
        if (cA.length < 3 || cA.length !== cB.length) return null;
        const matched = matchCorners(cA, cB);
        if (!matched) return null;
        const iA = nestCorners(A)[0].i;
        let iB = 0;
        let bd = Infinity;
        for (let i = 0; i < B.length; i++) {
          const d = dist(B[i], matched[0]);
          if (d < bd) {
            bd = d;
            iB = i;
          }
        }
        const rot = (R: PtMm[], i0: number) => [...R.slice(i0), ...R.slice(0, i0)];
        const A2 = rot(A, iA);
        let B2 = rot(B, iB);
        const probe = Math.min(10, A2.length - 1, B2.length - 1);
        const dF = dist(A2[probe], B2[probe]);
        const Br = [...B2].reverse();
        const dR = dist(A2[probe], Br[probe]);
        if (dR < dF) B2 = Br;
        const n = Math.max(A2.length, B2.length);
        const pick = (R: PtMm[], i: number) =>
          R[Math.min(R.length - 1, Math.floor((i * (R.length - 1)) / (n - 1)))];
        const out: PtMm[] = [];
        for (let i = 0; i < n; i++) out.push(lerp(pick(A2, i), pick(B2, i), 0.5));
        return out;
      };
      const insertBlend = (A: PtMm[], B: PtMm[]) => {
        const step = Math.max(1, Math.round(1 / NEST_WALK.stepMm));
        const cur: PtMm[] = [];
        for (let i = 0; i < A.length; i += step) cur.push(lerp(A[i], nearSeg(B, A[i]), wStep));
        for (let i = 0; i < B.length; i += step) {
          const m = lerp(nearSeg(A, B[i]), B[i], wStep);
          let bi = 0;
          let bd = Infinity;
          let bt = 0;
          for (let j = 0; j < cur.length; j++) {
            const a = cur[j];
            const b = cur[(j + 1) % cur.length];
            const ab = sub(b, a);
            const L2 = dot(ab, ab);
            const t = L2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(m, a), ab) / L2)) : 0;
            const p = add(a, mul(ab, t));
            const d = dist(m, p);
            if (d < bd) {
              bd = d;
              bi = j;
              bt = t;
            }
          }
          if (bd > 0.3 && bt > 0.05 && bt < 0.95) cur.splice(bi + 1, 0, m);
        }
        return cur;
      };
      if (oa && ob) {
        const A0 = canonRing(oa).pts;
        const B0 = canonRing(ob).pts;
        const nA = nCorners(oa);
        const nB = nCorners(ob);
        const step = Math.max(1, Math.round(1 / NEST_WALK.stepMm));
        let cur: PtMm[] = [];
        if (nA === nTarget && nB === nTarget) {
          const paired = pairedAligned(A0, B0);
          const inserted = insertBlend(A0, B0);
          // orientation flip collapses area — reject. Paired wins on widely nested rings
          // (Leah E16 gap~50); insert wins when rings nearly coincide (Leah B2 gap~14).
          const areaA = signedArea(A0);
          const pairedOk =
            !!paired &&
            !ringCheck(paired, [], []) &&
            signedArea(paired!) * areaA > 0 &&
            Math.abs(signedArea(paired!)) > 0.25 * Math.abs(areaA);
          const nestGap = ringDistance(A0, B0).p95;
          cur = pairedOk && paired && nestGap > 20 ? paired : inserted;
        } else if (nA === nTarget && nB !== nTarget) {
          // A matches the target; insert B's extras when it has more corners (Leah G28)
          if (nB > nA) cur = insertBlend(A0, B0);
          else
            for (let i = 0; i < A0.length; i += step) cur.push(lerp(A0[i], nearSeg(B0, A0[i]), w));
        } else if (nB === nTarget && nA !== nTarget) {
          // B matches target corner count (Leah B6: anchors 4=7 vs 8=5, target 5)
          for (let i = 0; i < B0.length; i += step) cur.push(lerp(nearSeg(A0, B0[i]), B0[i], w));
          if (nA > nB) {
            for (let i = 0; i < A0.length; i += step) {
              const m = lerp(A0[i], nearSeg(B0, A0[i]), w);
              let bi = 0;
              let bd = Infinity;
              let bt = 0;
              for (let j = 0; j < cur.length; j++) {
                const a = cur[j];
                const b = cur[(j + 1) % cur.length];
                const ab = sub(b, a);
                const L2 = dot(ab, ab);
                const t = L2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(m, a), ab) / L2)) : 0;
                const p = add(a, mul(ab, t));
                const d = dist(m, p);
                if (d < bd) {
                  bd = d;
                  bi = j;
                  bt = t;
                }
              }
              if (bd > 0.3 && bt > 0.05 && bt < 0.95) cur.splice(bi + 1, 0, m);
            }
          }
        } else {
          cur = insertBlend(A0, B0);
        }
        builtFromBlend = emitRing(cur);
      }
      // open interior (no anchor outers): etalon points moved by the grade seats
      if (!builtFromBlend) {
        for (let j = 0; j < M; j++) {
          if (!tracks[j].pos[r] && tracks[j].pos[ra] && tracks[j].pos[rb]) {
            tracks[j].pos[r] = isCorner(j)
              ? steppedCorner(j, r, ra, rb)
              : lerp(tracks[j].pos[ra]!, tracks[j].pos[rb]!, w);
            tracks[j].state[r] = 'interpolated';
          }
        }
        if (tracks.every((T) => T.pos[r])) {
          builtFromBlend = emitRing(tracks.map((T) => T.pos[r]!));
        }
      }
    }

    // Ends / one-sided: etalon-driven guide + trace; gap filled by deformed etalon edge.
    for (const ed of edges) {
      if (builtFromBlend) break;
      const A = tracks[ed.a].pos[r]!;
      const B = tracks[ed.b].pos[r]!;
      const known = (j: number) =>
        tracks[j].state[r] === 'measured' || tracks[j].state[r] === 'etalon';
      const { G, js } = edgeGuide(ed, r, r);
      const tr = traceEdge(r, G, known(ed.a), known(ed.b));
      for (const l of tr.loops)
        loops.push({
          edge: lms[ed.a].edge,
          at: l.at,
          mm: l.mm,
          cut: l.cut,
          lines: l.lines.map((id) => lineName(r, id)),
        });
      const jAt = (s: number) => {
        let k = 0;
        while (k + 1 < G.cum.length && G.cum[k + 1] <= s) k++;
        return js[k];
      };
      const aHit = idx.nearest(A, NEST_WALK.onLineMm);
      push(A, !!aHit, kindOf([ed.a]), ed.a, aHit ? idx.pts[aHit.j].line : null);
      const h = tr.head;
      const t = tr.full ? [] : tr.tail;
      for (const q of h) push(q.p, true, 'derived', jAt(q.s), q.line);
      if (tr.full) {
        edgeFrom.push({ a: ed.a, b: ed.b, how: 'traced' });
        continue;
      }
      const s0 = h.length ? h[h.length - 1].s : 0;
      const s1 = t.length ? t[0].s : G.total;
      const inGap = js.filter((_, k) => G.cum[k] > s0 && G.cum[k] < s1);
      const kind = kindOf(inGap.length ? inGap : [ed.a, ed.b]);
      const p0 = h.length ? h[h.length - 1].p : A;
      const p1 = t.length ? t[0].p : B;
      if (s1 > s0 + 1e-6) {
        const g0 = atLength(G.pts, G.cum, s0);
        const g1 = atLength(G.pts, G.cum, s1);
        for (let k = 0; k < G.pts.length; k++) {
          const s = G.cum[k];
          if (s <= s0 || s >= s1) continue;
          const u = (s - s0) / (s1 - s0);
          push(add(G.pts[k], lerp(sub(p0, g0), sub(p1, g1), u)), false, kind, js[k], null);
        }
        edgeFrom.push({ a: ed.a, b: ed.b, how: 'etalon' });
      } else {
        edgeFrom.push({ a: ed.a, b: ed.b, how: 'traced' });
      }
      for (const q of t) push(q.p, true, 'derived', jAt(q.s), q.line);
    }
    const cornerSnaps: NonNullable<NestSizeOut['cornerSnaps']> = [];
    const nearCornerLong: NonNullable<NestSizeOut['nearCornerLong']> = [];
    // spike drop + near-corner loop cut are for traced edges; on a blended mid-ring they
    // carve false chords through the piece (Leah B22: 1.4 mm blend → 8 mm after the cut)
    if (!builtFromBlend) {
      // a backtrack of under 1 mm where two reads meet (a corner a hair off its line's end) is a spike
      for (let guard = 0; guard < 4; guard++) {
        let dropped = false;
        for (let i = 0; i < out.length && out.length > 3; i++) {
          const a = out[(i - 1 + out.length) % out.length];
          const b = out[i];
          const c = out[(i + 1) % out.length];
          const u = sub(b, a);
          const v = sub(c, b);
          if (Math.min(len(u), len(v)) >= 1 || angBetween(u, v) < 150 * DEG) continue;
          for (const arr of [out, on, kindAt, srcAt] as unknown[][]) arr.splice(i, 1);
          dropped = true;
          i--;
        }
        if (!dropped) break;
      }
      // near-corner: rotate so index 0 is mid-edge (middle of the longest traced run) so the
      // wrap-around is not at a corner; scan/snap; rotate back.
      {
        const n0 = out.length;
        // longest traced run (on[i] && src.path)
        let bestRun = { start: 0, len: 0 };
        for (let i = 0; i < n0; ) {
          if (!(on[i] && srcAt[i].path)) {
            i++;
            continue;
          }
          let j = i;
          while (j < n0 && on[j] && srcAt[j].path) j++;
          // also count wrap from 0 if i==0 and run at end
          if (j - i > bestRun.len) bestRun = { start: i, len: j - i };
          i = j;
        }
        // wrap-around traced run
        if (on[0] && srcAt[0].path && on[n0 - 1] && srcAt[n0 - 1].path) {
          let a = 0;
          while (a < n0 && on[a] && srcAt[a].path) a++;
          let b = n0 - 1;
          while (b > a && on[b] && srcAt[b].path) b--;
          const len = a + (n0 - 1 - b);
          if (len > bestRun.len) bestRun = { start: (b + 1) % n0, len };
        }
        const mid = bestRun.len
          ? (bestRun.start + Math.floor(bestRun.len / 2)) % n0
          : Math.floor(n0 / 2);
        const rot = <T>(arr: T[]) => {
          const head = arr.splice(0, mid);
          arr.push(...head);
        };
        if (mid) {
          rot(out);
          rot(on);
          rot(kindAt);
          rot(srcAt);
        }
        for (let guard = 0; guard < cornerJs.length + 2; guard++) {
          const n = out.length;
          if (n < 6) break;
          const corners: { j: number; i: number }[] = [];
          for (const j of cornerJs) {
            const cp = tracks[j].pos[r];
            if (!cp) continue;
            let bi = 0;
            let bd = Infinity;
            for (let i = 0; i < n; i++) {
              const d = dist(out[i], cp);
              if (d < bd) [bd, bi] = [d, i];
            }
            if (bd <= 5) corners.push({ j, i: bi });
          }
          let cut = false;
          for (const { j, i: c } of corners) {
            const C = out[c];
            const incoming: number[] = [];
            for (let d = 1; d < n; d++) {
              const i = (c - d + n) % n;
              if (corners.some((x) => x.i === i)) break;
              incoming.push(i);
              if (dist(out[i], C) > 10) break;
            }
            const outgoing: number[] = [];
            for (let d = 1; d < n; d++) {
              const i = (c + d) % n;
              if (corners.some((x) => x.i === i)) break;
              outgoing.push(i);
              if (dist(out[i], C) > 10) break;
            }
            let best: { p: PtMm; mm: number; dropFrom: number; dropTo: number } | null = null;
            for (let a = 0; a + 1 < incoming.length; a++) {
              const iFar = incoming[a + 1];
              const iNear = incoming[a];
              for (let b = 0; b + 1 < outgoing.length; b++) {
                const oNear = outgoing[b];
                const oFar = outgoing[b + 1];
                const h = segIntersect(out[iFar], out[iNear], out[oNear], out[oFar]);
                if (!h || !(h.t > 1e-6 && h.t < 1 - 1e-6 && h.u > 1e-6 && h.u < 1 - 1e-6)) continue;
                if (dist(h.p, C) > 10) continue;
                let mm = dist(h.p, out[iNear]);
                for (let k = a - 1; k >= 0; k--) mm += dist(out[incoming[k + 1]], out[incoming[k]]);
                mm += dist(out[incoming[0]], C);
                mm += dist(C, out[outgoing[0]]);
                for (let k = 0; k < b; k++) mm += dist(out[outgoing[k]], out[outgoing[k + 1]]);
                mm += dist(out[oNear], h.p);
                if (!best || mm < best.mm) best = { p: h.p, mm, dropFrom: iFar, dropTo: oFar };
              }
            }
            if (!best) continue;
            const rec = { j, at: best.p, mm: Math.round(best.mm * 100) / 100 };
            if (best.mm > NEST_WALK.loopKeepMm) {
              if (!nearCornerLong.some((x) => x.j === j && Math.abs(x.mm - rec.mm) < 0.1))
                nearCornerLong.push(rec);
              continue;
            }
            const dropSet = new Set<number>();
            for (let k = 1; k < n; k++) {
              const i = (best.dropFrom + k) % n;
              if (i === best.dropTo) break;
              dropSet.add(i);
            }
            const newOut: PtMm[] = [];
            const newOn: boolean[] = [];
            const newKind: DerivedKind[] = [];
            const newSrc: typeof srcAt = [];
            for (let i = 0; i < n; i++) {
              if (dropSet.has(i)) {
                if (i === (best.dropFrom + 1) % n) {
                  newOut.push(best.p);
                  newOn.push(true);
                  newKind.push('derived');
                  newSrc.push({ j, path: false, line: null });
                }
                continue;
              }
              newOut.push(out[i]);
              newOn.push(on[i]);
              newKind.push(kindAt[i]);
              newSrc.push(srcAt[i]);
            }
            out.length = 0;
            on.length = 0;
            kindAt.length = 0;
            srcAt.length = 0;
            out.push(...newOut);
            on.push(...newOn);
            kindAt.push(...newKind);
            srcAt.push(...newSrc);
            cornerSnaps.push(rec);
            cut = true;
            break;
          }
          if (!cut) break;
        }
        // rotate back so the original mid-edge index is restored as well as possible
        if (mid && out.length) {
          const back = (out.length - (mid % out.length)) % out.length;
          if (back) {
            const rotBack = <T>(arr: T[]) => {
              const head = arr.splice(0, back);
              arr.push(...head);
            };
            rotBack(out);
            rotBack(on);
            rotBack(kindAt);
            rotBack(srcAt);
          }
        }
      }
    } // end !builtFromBlend spike/near-corner
    // E1: drawn iff within derivedOffMm of this size's own or common lines
    const drawn = derivedByDistance(out, ownLines(r), commonW, NEST_WALK.derivedOffMm);
    for (let i = 0; i < out.length; i++) on[i] = drawn.on[i];
    // derived runs (off the size's own and common lines)
    const derived: NestDerived[] = [];
    const m = out.length;
    let startAt = on.findIndex((x) => x);
    if (startAt < 0) startAt = 0;
    for (let s = 0; s < m; ) {
      const i = (startAt + s) % m;
      if (on[i]) {
        s++;
        continue;
      }
      const run: PtMm[] = [out[(i - 1 + m) % m]];
      let kind: DerivedKind = 'derived';
      let e = s;
      while (e < m && !on[(startAt + e) % m]) {
        const ii = (startAt + e) % m;
        run.push(out[ii]);
        if (kindAt[ii] === 'extrapolated') kind = 'extrapolated';
        else if (kindAt[ii] === 'interpolated' && kind === 'derived') kind = 'interpolated';
        e++;
      }
      run.push(out[(startAt + e) % m]);
      // length from the first off point: the segment that leaves the last drawn point is still on the line
      const mm = polyLen(run.slice(1));
      if (mm >= NEST_WALK.derivedMinMm)
        derived.push({ from: run[0], to: run[run.length - 1], mm, kind, pts: run });
      s = e;
    }
    const keep = dedupeIdx(out);
    const res: NestSizeOut = {
      rank: r,
      outer: keep.map((i) => out[i]),
      src: keep.map((i) => srcAt[i]),
      derived,
      derivedMm: drawn.derivedMm,
      notches: lms
        .map((l, j) => (l.kind === 'notch' ? tracks[j].pos[r] : null))
        .filter((x): x is PtMm => !!x),
      states,
      cornerFrom: cornerJs.map((j) => ({
        j,
        state: (tracks[j].state[r] ?? 'replaced') as LmState,
      })),
      edgeFrom,
      ...(loops.length ? { loops } : {}),
      ...(cornerSnaps.length ? { cornerSnaps } : {}),
      ...(nearCornerLong.length ? { nearCornerLong } : {}),
    };
    const why = ringCheck(res.outer, derived, ownLines(r));
    if (why) res.refused = why;
    return res;
  }

  function buildSize(r: number, states: Record<LmState, number>): NestSizeOut {
    const n = ring.length;
    const idx = tgt(r);
    const out: PtMm[] = [];
    /** per output point: on a line (true) or derived (false) */
    const on: boolean[] = [];
    const kindAt: DerivedKind[] = [];
    const srcAt: { j: number; path: boolean; line: number | null }[] = [];
    const disp = (j: number) => sub(tracks[j].pos[r]!, lms[j].p);
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      const a = lms[j];
      const b = lms[j2];
      const span = (b.i - a.i + n) % n || n;
      const da = disp(j);
      const db = disp(j2);
      const sa = tracks[j].state[r];
      const sb = tracks[j2].state[r];
      const kind: DerivedKind =
        sa === 'extrapolated' || sb === 'extrapolated'
          ? 'extrapolated'
          : sa === 'interpolated' || sb === 'interpolated'
            ? 'interpolated'
            : 'derived';
      // the etalon segment deformed by the two landmark moves
      const guide: PtMm[] = [];
      for (let s = 0; s < span; s++) guide.push(add(ring[(a.i + s) % n], lerp(da, db, s / span)));
      // the size's line when it runs from one landmark to the other
      const path = linePath(idx, tracks[j].hit[r], tracks[j2].hit[r], guide, tracks[j2].pos[r]!);
      if (path) {
        const line = tracks[j].hit[r] != null ? idx.pts[tracks[j].hit[r]!].line : null;
        for (const q of path) {
          out.push(q);
          on.push(true);
          kindAt.push(kind);
          srcAt.push({ j, path: true, line });
        }
        continue;
      }
      for (const g of guide) {
        const h = idx.nearest(g, NEST_WALK.onLineMm);
        out.push(h ? idx.pt(h.j) : g);
        on.push(!!h);
        kindAt.push(kind);
        srcAt.push({ j, path: false, line: h ? idx.pts[h.j].line : null });
      }
    }
    // E1: drawn iff within derivedOffMm of this size's own or common lines
    const drawn = derivedByDistance(out, ownLines(r), commonW, NEST_WALK.derivedOffMm);
    for (let i = 0; i < out.length; i++) on[i] = drawn.on[i];
    // derived runs (off the size's own and common lines)
    const derived: NestDerived[] = [];
    const m = out.length;
    let startAt = on.findIndex((x) => x);
    if (startAt < 0) startAt = 0;
    for (let s = 0; s < m; ) {
      const i = (startAt + s) % m;
      if (on[i]) {
        s++;
        continue;
      }
      const run: PtMm[] = [out[(i - 1 + m) % m]];
      let kind: DerivedKind = 'derived';
      let e = s;
      while (e < m && !on[(startAt + e) % m]) {
        const ii = (startAt + e) % m;
        run.push(out[ii]);
        if (kindAt[ii] === 'extrapolated') kind = 'extrapolated';
        else if (kindAt[ii] === 'interpolated' && kind === 'derived') kind = 'interpolated';
        e++;
      }
      run.push(out[(startAt + e) % m]);
      const mm = polyLen(run.slice(1));
      if (mm >= NEST_WALK.derivedMinMm)
        derived.push({ from: run[0], to: run[run.length - 1], mm, kind, pts: run });
      s = e;
    }
    const keep = dedupeIdx(out);
    const outer = keep.map((i) => out[i]);
    const res: NestSizeOut = {
      rank: r,
      outer,
      src: keep.map((i) => srcAt[i]),
      derived,
      derivedMm: drawn.derivedMm,
      notches: lms
        .map((l, j) => (l.kind === 'notch' ? tracks[j].pos[r]! : null))
        .filter((x): x is PtMm => !!x),
      states,
    };
    const why = ringCheck(outer, derived, ownLines(r));
    if (why) res.refused = why;
    return res;
  }
}

/** The size's line from hit a to hit b, when one line (or two meeting within 0.5 mm) carries it. */
function linePath(
  idx: LineIndex,
  ha: number | null,
  hb: number | null,
  guide: readonly PtMm[],
  pb: PtMm,
): PtMm[] | null {
  if (ha == null || hb == null) return null;
  const gLen = polyLen([...guide, pb]);
  const maxSteps = Math.ceil((1.5 * gLen + 2) / NEST_WALK.stepMm);
  const minSteps = Math.max(0, Math.floor((0.5 * gLen - 1) / NEST_WALK.stepMm));
  const A = idx.pts[ha];
  const B = idx.pts[hb];
  const head = (dirSign: number) => {
    const nx = idx.along(ha, dirSign);
    if (nx == null) return -Infinity;
    const g1 = guide[Math.min(guide.length - 1, 2)] ?? pb;
    return dot(sub(idx.pt(nx), A), sub(g1, A));
  };
  const sgn = head(1) >= head(-1) ? 1 : -1;
  const path: PtMm[] = [];
  let cur = ha;
  for (let s = 0; s <= maxSteps; s++) {
    const q = idx.pts[cur];
    if (q.line === B.line && cur === hb) return s >= minSteps ? path : null;
    path.push(idx.pt(cur));
    // a junction onto b's line
    if (q.line !== B.line) {
      let hop: number | null = null;
      idx.near(q, NEST_WALK.onLineMm, (m) => {
        if (hop == null && idx.pts[m].line === B.line) hop = m;
      });
      if (hop != null) {
        // continue on b's line toward hb
        const rest = walkTo(idx, hop, hb, maxSteps - s);
        if (rest) return path.length + rest.length >= minSteps ? [...path, ...rest] : null;
      }
    }
    const nx = idx.along(cur, sgn);
    if (nx == null) return null;
    cur = nx;
  }
  return null;
}

function walkTo(idx: LineIndex, from: number, to: number, maxSteps: number): PtMm[] | null {
  const a = idx.pts[from];
  const b = idx.pts[to];
  if (a.line !== b.line) return null;
  const L = idx.lines[a.line];
  let fwd = b.k - a.k;
  if (L.closed) {
    fwd = ((fwd % L.n) + L.n) % L.n;
    if (fwd > L.n / 2) fwd -= L.n;
  }
  if (Math.abs(fwd) > maxSteps) return null;
  const out: PtMm[] = [];
  const sg = Math.sign(fwd);
  for (let s = 0; s < Math.abs(fwd); s++) out.push(idx.pt(idx.along(from, s * sg)!));
  return out;
}

/** Indices of `pts` without consecutive repeats (the ring's closing repeat too). */
function dedupeIdx(pts: PtMm[]): number[] {
  const out: number[] = [];
  pts.forEach((p, i) => {
    if (!out.length || dist(pts[out[out.length - 1]], p) > 1e-6) out.push(i);
  });
  while (out.length > 2 && dist(pts[out[0]], pts[out[out.length - 1]]) < 1e-6) out.pop();
  return out;
}

/** The ring is simple and its derived stretches do not cross the size's own lines. */
function ringCheck(
  outer: readonly PtMm[],
  derived: readonly NestDerived[],
  own: readonly (readonly PtMm[])[],
): string | null {
  const s = simplify([...outer, outer[0]], 0.05);
  const n = s.length - 1;
  const cell = 10;
  const grid = new Map<number, number[]>();
  const key = (x: number, y: number) => (x + 32768) * 65536 + (y + 32768);
  for (let i = 0; i < n; i++) {
    const a = s[i];
    const b = s[i + 1];
    for (
      let x = Math.floor(Math.min(a.x, b.x) / cell);
      x <= Math.floor(Math.max(a.x, b.x) / cell);
      x++
    )
      for (
        let y = Math.floor(Math.min(a.y, b.y) / cell);
        y <= Math.floor(Math.max(a.y, b.y) / cell);
        y++
      ) {
        const k = key(x, y);
        const arr = grid.get(k);
        if (arr) arr.push(i);
        else grid.set(k, [i]);
      }
  }
  for (let i = 0; i < n; i++) {
    const a = s[i];
    const b = s[i + 1];
    const seen = new Set<number>();
    for (
      let x = Math.floor(Math.min(a.x, b.x) / cell);
      x <= Math.floor(Math.max(a.x, b.x) / cell);
      x++
    )
      for (
        let y = Math.floor(Math.min(a.y, b.y) / cell);
        y <= Math.floor(Math.max(a.y, b.y) / cell);
        y++
      )
        for (const j of grid.get(key(x, y)) ?? []) {
          if (j <= i + 1 || seen.has(j) || (i === 0 && j === n - 1)) continue;
          seen.add(j);
          const h = segIntersect(a, b, s[j], s[j + 1]);
          if (h && h.t > 1e-6 && h.t < 1 - 1e-6) return 'self-crossing';
        }
  }
  for (const d of derived) {
    const ds = simplify(d.pts, 0.05);
    for (const l of own) {
      const b = bboxOf(l);
      const db = bboxOf(ds);
      if (b.maxX < db.minX || b.minX > db.maxX || b.maxY < db.minY || b.minY > db.maxY) continue;
      for (let i = 1; i < ds.length; i++)
        for (let k = 1; k < l.length; k++) {
          const h = segIntersect(ds[i - 1], ds[i], l[k - 1], l[k]);
          if (!h) continue;
          if (dist(h.p, d.from) < 1 || dist(h.p, d.to) < 1) continue;
          const a = angBetween(sub(ds[i], ds[i - 1]), sub(l[k], l[k - 1]));
          if (Math.min(a, Math.PI - a) >= 20 * DEG) return 'crosses-own-line';
        }
    }
  }
  return null;
}

/** Symmetric distance between two closed rings, sampled at 0.5 mm: p95 and max, mm. */
export function ringDistance(
  a: readonly PtMm[],
  b: readonly PtMm[],
): { p95: number; max: number; at: PtMm } {
  const A = resample(a, 0.5, true);
  const B = resample(b, 0.5, true);
  const one = (from: PtMm[], to: PtMm[]) => {
    const idx = new LineIndex([[...to, to[0]]], 4);
    return from.map((p) => {
      let r = 2;
      for (;;) {
        const h = idx.nearest(p, r);
        if (h) return { d: h.d, p };
        r *= 2;
        if (r > 4096) return { d: Infinity, p };
      }
    });
  };
  const ds = [...one(A, B), ...one(B, A)].sort((x, y) => x.d - y.d);
  const p95 = ds[Math.min(ds.length - 1, Math.ceil(0.95 * ds.length) - 1)]?.d ?? 0;
  const top = ds[ds.length - 1];
  return { p95, max: top?.d ?? 0, at: top?.p ?? { x: 0, y: 0 } };
}

/** Distance from each sample of `lines` within `near` mm of the ring to the ring: p95 and max. */
export function linesToRing(
  lines: readonly (readonly PtMm[])[],
  ring: readonly PtMm[],
  near: number,
): { p95: number; max: number; n: number; at: PtMm } {
  const idx = new LineIndex([[...ring, ring[0]]], 4);
  const ds: { d: number; p: PtMm }[] = [];
  for (const l of lines)
    for (const p of resample(l, 0.5, false)) {
      const h = idx.nearest(p, near);
      if (h) ds.push({ d: h.d, p });
    }
  ds.sort((x, y) => x.d - y.d);
  const p95 = ds[Math.min(ds.length - 1, Math.ceil(0.95 * ds.length) - 1)]?.d ?? 0;
  const top = ds[ds.length - 1];
  return { p95, max: top?.d ?? 0, n: ds.length, at: top?.p ?? { x: 0, y: 0 } };
}

export { LineIndex as NestLineIndex };
