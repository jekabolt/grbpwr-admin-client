// A3 — seam candidates and their assignment (port of probe/seamgraph.mjs + 00-FEASIBILITY §G).
//
// A candidate pairs two RUNS: a single edge or a chain of two neighbouring edges of one piece.
// Score = 0.45·length + 0.45·notches + 0.1·curvature − penalties (chain, mirror twin, self seam,
// and — with `ends` — up to 0.04 for seam ends that do not true up).
// On top of the probe's scoring sit the §G rules, each switchable so the probe can show what each
// one is worth (scripts/assembly-skeleton/seams.mjs):
//   hand       — L never sews to R, except mirror twins on a centre edge;
//   orient     — notches are read in the one direction the two pieces can meet in (face-up pieces
//                walk a shared seam oppositely; stacked identical layers the same way);
//   weak       — a mirror-twin pair only on a straight edge, and a mirror-twin pair or a self seam
//                only where neither edge has a regular candidate (the «third candidate» rule);
//   identical  — identical layers meet along ONE edge (the longest convex one, notched first);
//   closure    — a straight centre pair with buttons/zip in the BOM or drills along it is a
//                closure, never a seam;
//   eased      — 1.5–8 % length difference only with agreeing notches: both end notches (ease
//                spread over the middle) or all notches from one end (ease / pleat at the other);
//   asymNotch  — equal length, one side carries one notch more: weak notch evidence, not a veto;
//   shape      — a curved edge must fit its partner rigidly: the mirror image of a fit is the
//                other hand's seam, not this one (a veto only: shaping seams — princess, sleeve —
//                join curves that are NOT congruent, so curve agreement is no score term);
//   ends       — at both seam ends the two pieces' corner angles add up to a straight line (a
//                trued hem / neckline / armhole), which tells a shoulder from its mirror side;
//   softChain  — two neighbouring edges match as one only across a soft corner;
//   sides      — unnamed mirror pairs (numbered blazer pieces) get a side: twins sit on opposite
//                sides, a confident unique notched seam puts two pieces on the same side; then the
//                hand rule applies to the inferred sides as to named ones;
//   equivRect / equivLayers — an alternative that differs only by the other long side of a
//                rectangle, or by an identical layer of the same cloth, is the same answer and
//                does not make the seam ambiguous (a technologist has nothing to choose).
// Greedy assignment, each edge at most once; alternatives within SKELETON.ambiguity are kept on
// the chosen seam as `ambiguousWith`.

import {
  SKELETON,
  type Edge,
  type EdgeId,
  type PieceGeom,
  type Pt2,
  type SeamCandidate,
  type SeamEvidence,
  type SeamGraph,
  type SkeletonFacts,
} from '../types';
import { isMirroredPair } from '../cut';
import { angleAt, dist, drillPoints } from './segment';
import { congruent } from './twins';

export type MatchRules = {
  hand: boolean;
  orient: boolean;
  weak: boolean;
  identical: boolean;
  closure: boolean;
  eased: boolean;
  asymNotch: boolean;
  shape: boolean;
  ends: boolean;
  softChain: boolean;
  /** Hands of unnamed mirror pairs, inferred through confident seams, feed the hand rule. */
  sides: boolean;
  /** An alternative on the other long side of the same rectangle is the same answer. */
  equivRect: boolean;
  /** An alternative on an identical layer of the same cloth is the same answer. */
  equivLayers: boolean;
};

export const ALL_RULES: MatchRules = {
  hand: true,
  orient: true,
  weak: true,
  identical: true,
  closure: true,
  eased: true,
  asymNotch: true,
  shape: true,
  ends: true,
  softChain: true,
  sides: true,
  equivRect: true,
  equivLayers: true,
};

/** The probe as it ran on 09.10 (hand rule only). */
export const PROBE_RULES: MatchRules = {
  hand: true,
  orient: false,
  weak: false,
  identical: false,
  closure: false,
  eased: false,
  asymNotch: false,
  shape: false,
  ends: false,
  softChain: false,
  sides: false,
  equivRect: false,
  equivLayers: false,
};

/** Probe's length band without notch requirement: score 0.5 up to 3.5 %. */
const PROBE_LOOSE_REL = 0.035;
/** Both edges turning more than this (deg) — two convex edges rarely sew flat. */
const CONVEX_PAIR_DEG = 25;
/** chord/len at or above this = a straight edge (centre seams and closures are straight). */
const STRAIGHT = 0.98;
/** Edges turning less than this (deg) inward still count as convex for the identical seam. */
const CONVEX_TOL_DEG = 5;
/** A centre seam runs the length of the piece: at least this share of its longest edge. */
const CENTRE_MIN_SHARE = 0.5;
/** Drills this close to an edge mark buttons/buttonholes along it. */
const DRILL_EDGE_MM = 40;
const DRILLS_FOR_CLOSURE = 2;
/** Shape test: profile samples and the deviation (mm) below which an edge is «straight enough». */
const PROFILE_SAMPLES = 24;
const PROFILE_FLAT_MM = 3;
/** The mirror reading must beat the rigid one by this factor to veto a pair. */
const SHAPE_VETO_RATIO = 2;
/** End angles: summed error (deg) at which the ends term reaches its full penalty. */
const ENDS_SCALE_DEG = 60;
const ENDS_WEIGHT = 0.04;
/** A chain may only cross a corner turning less than this (deg). */
const SOFT_CORNER_DEG = 60;
/** A seam this sure (and notch-backed, and unrivalled) carries a side from piece to piece. */
const SIDE_CONFIDENT = 0.9;
/** Rejected list keeps candidates down to this score. */
const REJECTED_FLOOR = 0.4;

const FRONT_NAME = /(^|[^a-z])(front|frt|fp|cf|перед|полоч)/i;

// ── runs ────────────────────────────────────────────────────────────────────────────────────

/** A single edge or two neighbouring edges of one piece, matched as one. */
export type Run = {
  id: EdgeId;
  piece: PieceGeom;
  edges: Edge[];
  lenMm: number;
  notchesMm: number[];
  turnDeg: number;
  chordMm: number;
  pts: Pt2[];
  chain: boolean;
  /** Turn (deg, + convex) at the run's start / end corner. */
  turnStart: number;
  turnEnd: number;
};

/** Turn (deg, + convex) of the contour at resample index `idx`, over the corner window. */
export const cornerTurn = (piece: PieceGeom, idx: number) =>
  piece.rs.length
    ? angleAt(
        piece.rs,
        idx % piece.rs.length,
        Math.max(1, Math.round(SKELETON.cornerWinMm / SKELETON.resampleMm)),
      )
    : 0;

export function runsOf(piece: PieceGeom, softOnly = true): Run[] {
  const out: Run[] = piece.edges.map((e) => ({
    id: e.id,
    piece,
    edges: [e],
    lenMm: e.lenMm,
    notchesMm: e.notchesMm,
    turnDeg: e.turnDeg,
    chordMm: e.chordMm,
    pts: e.pts,
    chain: false,
    turnStart: cornerTurn(piece, e.s),
    turnEnd: cornerTurn(piece, e.e),
  }));
  const es = piece.edges;
  if (es.length >= 3) {
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      const b = es[(i + 1) % es.length];
      if (b.s !== a.e) continue;
      if (softOnly && Math.abs(cornerTurn(piece, a.e)) > SOFT_CORNER_DEG) continue;
      const pts = [...a.pts, ...b.pts.slice(1)];
      out.push({
        id: `${piece.pieceKey}#${a.k}+${b.k}`,
        piece,
        edges: [a, b],
        lenMm: a.lenMm + b.lenMm,
        notchesMm: [...a.notchesMm, ...b.notchesMm.map((d) => d + a.lenMm)],
        turnDeg: a.turnDeg + b.turnDeg,
        chordMm: dist(pts[0], pts[pts.length - 1]),
        pts,
        chain: true,
        turnStart: cornerTurn(piece, a.s),
        turnEnd: cornerTurn(piece, b.e),
      });
    }
  }
  return out;
}

/** Edge ids a run id stands for: `P#3` → [`P#3`], `P#3+4` → [`P#3`, `P#4`]. */
export function edgeIdsOf(id: EdgeId): EdgeId[] {
  const at = id.lastIndexOf('#');
  const piece = id.slice(0, at);
  return id
    .slice(at + 1)
    .split('+')
    .map((k) => `${piece}#${k}`);
}

// ── evidence ────────────────────────────────────────────────────────────────────────────────

const maxErr = (x: number[], y: number[]) => Math.max(...x.map((d, i) => Math.abs(d - y[i])));
const ladder = (err: number): 0 | 0.3 | 0.7 | 1 =>
  err <= SKELETON.notchTolMm ? 1 : err <= 8 ? 0.7 : err <= 15 ? 0.3 : 0;

/** Notch positions of `v` read from its END (the direction two face-up pieces meet in). */
const fromEnd = (v: Run) => v.notchesMm.map((d) => v.lenMm - d).reverse();

/**
 * Which way `v` is read against `u`. Two face-up pieces walk a shared seam in opposite directions
 * ('rev'); so does a fold (self seam) and a straight centre seam of mirror twins. Identical layers
 * stacked face to face run the SAME way ('same'). A piece cut as a mirrored pair has a reflected
 * copy, which reads the other way — both are possible ('both').
 */
export type Reading = 'rev' | 'same' | 'both';

const readings = (v: Run, dir: Reading): number[][] =>
  dir === 'rev' ? [fromEnd(v)] : dir === 'same' ? [v.notchesMm] : [v.notchesMm, fromEnd(v)];

/**
 * Notch agreement in the allowed reading(s). null when the counts differ; 0.5 (internal) when
 * neither edge carries a notch — the contract records that as `null`.
 */
function notchScore(u: Run, v: Run, dir: Reading): number | null {
  if (u.notchesMm.length !== v.notchesMm.length) return null;
  if (u.notchesMm.length === 0) return 0.5;
  return ladder(Math.min(...readings(v, dir).map((b) => maxErr(u.notchesMm, b))));
}

/**
 * Gathered / eased / pleated seam (lengths differ by lenRel…lenRelEased). Two ways the notches
 * still agree:
 *  - ease spread over the middle: the first notch from the start and the last from the end agree;
 *  - ease or a pleat at ONE end: every notch of the shorter edge agrees with the longer edge when
 *    both are measured from the other end (the longer may carry up to two extra pleat marks).
 * Needs notches on both edges; 2+ agreeing notches score 0.7, one notch 0.3.
 */
function endNotchScore(u: Run, v: Run, dir: Reading): number | null {
  if (u.notchesMm.length === 0 || v.notchesMm.length === 0) return null;
  let best: number | null = null;
  const bump = (x: number) => {
    if (best === null || x > best) best = x;
  };
  for (const b of readings(v, dir)) {
    // spread: both end notches
    const eu = [u.notchesMm[0], u.lenMm - u.notchesMm[u.notchesMm.length - 1]];
    const ev = [b[0], v.lenMm - b[b.length - 1]];
    bump(ladder(maxErr(eu, ev)));
    // one-ended: anchored at the start, or at the end
    for (const anchor of ['start', 'end'] as const) {
      const pu = anchor === 'start' ? u.notchesMm : u.notchesMm.map((d) => u.lenMm - d);
      const pv = anchor === 'start' ? b : b.map((d) => v.lenMm - d);
      const [short, long] = pu.length <= pv.length ? [pu, pv] : [pv, pu];
      if (long.length - short.length > 2) continue;
      const ok = short.every((d) => long.some((x) => Math.abs(x - d) <= SKELETON.notchTolMm));
      if (ok) bump(short.length >= 2 ? 0.7 : 0.3);
    }
  }
  return best;
}

/** One notch more on one side, the rest agreeing: a forgotten or extra notch, weak evidence. */
function asymNotchScore(u: Run, v: Run, dir: Reading): number | null {
  const nu = u.notchesMm.length;
  const nv = v.notchesMm.length;
  if (Math.abs(nu - nv) !== 1) return null;
  if (Math.min(nu, nv) === 0) return 0.3;
  const subset = (small: number[], big: number[]) =>
    small.every((d) => big.some((x) => Math.abs(x - d) <= SKELETON.notchTolMm));
  const ok = readings(v, dir).some((b) =>
    nu < nv ? subset(u.notchesMm, b) : subset(b, u.notchesMm),
  );
  return ok ? 0.3 : null;
}

/**
 * Signed offsets of a run from its chord at PROFILE_SAMPLES arc-length fractions, positive toward
 * the piece (left of a CCW walk).
 */
function profile(r: Run): number[] {
  const pts = r.pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const L = dist(a, b) || 1;
  const nx = -(b[1] - a[1]) / L;
  const ny = (b[0] - a[0]) / L;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const total = cum[cum.length - 1] || 1;
  const out: number[] = [];
  let j = 0;
  for (let s = 0; s < PROFILE_SAMPLES; s++) {
    const t = ((s + 0.5) / PROFILE_SAMPLES) * total;
    while (j < cum.length - 2 && cum[j + 1] < t) j++;
    const f = (t - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f;
    const y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
    out.push((x - a[0]) * nx + (y - a[1]) * ny);
  }
  return out;
}

const rms = (x: number[], y: number[]) =>
  Math.sqrt(x.reduce((s, d, i) => s + (d - y[i]) ** 2, 0) / x.length);

/**
 * How two runs meet, which fixes how their profiles (and corner angles) must relate:
 *  'join'  — two face-up pieces walk the shared curve oppositely, pieces on opposite sides:
 *            p_u(t) ≈ −p_v(1−t);
 *  'fold'  — one piece folded onto itself (self seam): p_u(t) ≈ p_v(1−t);
 *  'stack' — identical layers face to face: p_u(t) ≈ p_v(t);
 *  'any'   — a piece cut as a mirrored pair: 'join' or its reflection.
 */
type Meeting = 'join' | 'fold' | 'stack' | 'any';

const reflectProfile = (pv: number[]) => pv.map((d) => -d);
const joinProfile = (pv: number[]) => pv.map((_, i) => -pv[pv.length - 1 - i]);
const foldProfile = (pv: number[]) => pv.map((_, i) => pv[pv.length - 1 - i]);

function shapeRms(u: Run, v: Run, how: Meeting): number {
  const pu = profile(u);
  const pv = profile(v);
  switch (how) {
    case 'join':
      return rms(pu, joinProfile(pv));
    case 'fold':
      return rms(pu, foldProfile(pv));
    case 'stack':
      return rms(pu, pv);
    case 'any':
      return Math.min(rms(pu, joinProfile(pv)), rms(pu, reflectProfile(pv)));
  }
}

/**
 * The other hand's seam: the pair fits only as a reflection (p_u(t) ≈ −p_v(t)), clearly better
 * than as a face-up join. Straight edges carry no hand and are never vetoed.
 */
function mirrorOnly(u: Run, v: Run): boolean {
  const pu = profile(u);
  const pv = profile(v);
  const dev = Math.max(...pu.map(Math.abs), ...pv.map(Math.abs));
  if (dev < PROFILE_FLAT_MM) return false;
  const rigid = rms(pu, joinProfile(pv));
  const mirror = rms(pu, reflectProfile(pv));
  return mirror * SHAPE_VETO_RATIO < rigid && rigid > PROFILE_FLAT_MM;
}

/**
 * Corner angles at the seam ends. Pattern lines are trued across a seam: at each end the two
 * pieces' interior angles add up to 180° (join), or are equal (fold, stacked layers).
 */
function endsError(u: Run, v: Run, how: Meeting): number {
  const iu0 = 180 - u.turnStart;
  const iu1 = 180 - u.turnEnd;
  const iv0 = 180 - v.turnStart;
  const iv1 = 180 - v.turnEnd;
  const join = Math.abs(iu0 + iv1 - 180) + Math.abs(iu1 + iv0 - 180);
  switch (how) {
    case 'join':
      return join;
    case 'fold':
      return Math.abs(iu0 - iv1) + Math.abs(iu1 - iv0);
    case 'stack':
      return Math.abs(iu0 - iv0) + Math.abs(iu1 - iv1);
    case 'any':
      return Math.min(join, Math.abs(iu0 + iv0 - 180) + Math.abs(iu1 + iv1 - 180));
  }
}

// ── candidates ──────────────────────────────────────────────────────────────────────────────

/** The terms a score was built from — for the probe and for «evidence in words». */
export type ScoreParts = {
  lenScore: number;
  notch: number;
  shapeRmsMm: number;
  endsErrDeg: number;
  meeting: 'join' | 'fold' | 'stack' | 'any';
};

type Cand = {
  u: Run;
  v: Run;
  score: number;
  evidence: SeamEvidence;
  kind: SeamCandidate['kind'];
  regular: boolean;
  parts: ScoreParts;
  /** Why a rule dropped it (kept for `rejected`). */
  dropped?: string;
};

const isStraight = (r: Run) => r.chordMm / r.lenMm >= STRAIGHT;
const isCentreLong = (r: Run) =>
  r.lenMm >= CENTRE_MIN_SHARE * Math.max(...r.piece.edges.map((e) => e.lenMm));

function twinKindOf(a: PieceGeom, b: PieceGeom): 'mirror' | 'identical' | null {
  return a.twinOf.find((t) => t.key === b.pieceKey)?.kind ?? null;
}

/** The one edge along which identical layers are sewn: longest convex, notched ones first. */
function identicalSeamEdge(p: PieceGeom): Edge | undefined {
  const convex = p.edges.filter(
    (e) => e.turnDeg > -CONVEX_TOL_DEG && e.lenMm >= SKELETON.minSeamMm,
  );
  const pool = convex.filter((e) => e.notchesMm.length > 0);
  const from = pool.length ? pool : convex.length ? convex : p.edges;
  return from.reduce<Edge | undefined>((m, e) => (!m || e.lenMm > m.lenMm ? e : m), undefined);
}

/** What scorePair needs beyond the two runs. */
type PairCtx = {
  /** Edges designated for the one identical-layer seam of their piece. */
  designated: ReadonlySet<EdgeId>;
  /** Pieces cut as a mirrored pair from one pattern (card cut symmetry MIRRORED). */
  mirroredCut: ReadonlySet<string>;
  /** Mirrored blocks cut twice (×2 MIRRORED): one key, both hands — so no hand of its own. */
  bothHands?: ReadonlySet<string>;
};

function scorePair(u: Run, v: Run, rules: MatchRules, ctx: PairCtx): Cand | null {
  const self = u.piece === v.piece;
  if (self) {
    if (u.chain || v.chain || u.piece.rect) return null;
    if (u.edges.some((e) => v.edges.includes(e))) return null;
    // Adjacent edges share a corner — a dart, not a seam.
    if (u.edges[0].e === v.edges[0].s || v.edges[0].e === u.edges[0].s) return null;
  }
  const tk = self ? null : twinKindOf(u.piece, v.piece);
  const hu = ctx.bothHands?.has(u.piece.pieceKey) ? null : u.piece.hand;
  const hv = ctx.bothHands?.has(v.piece.pieceKey) ? null : v.piece.hand;
  const cross = !!hu && !!hv && hu !== hv;
  if (rules.hand && cross && tk !== 'mirror') return null;

  if (rules.identical && tk === 'identical') {
    if (u.chain || v.chain) return null;
    if (!ctx.designated.has(u.edges[0].id) && !ctx.designated.has(v.edges[0].id)) return null;
  }
  const dir: Reading = !rules.orient
    ? 'both'
    : ctx.mirroredCut.has(u.piece.pieceKey) || ctx.mirroredCut.has(v.piece.pieceKey)
      ? 'both'
      : tk === 'identical'
        ? 'same'
        : 'rev';

  if (Math.min(u.lenMm, v.lenMm) < SKELETON.minSeamMm) return null;
  const dLenMm = Math.abs(u.lenMm - v.lenMm);
  const relLen = dLenMm / Math.max(u.lenMm, v.lenMm);

  let lenScore: number;
  let ns: number | null;
  let rule: string | undefined;
  const exact = dLenMm <= SKELETON.lenAbsMm;
  if (exact || relLen <= SKELETON.lenRel) {
    lenScore = exact ? 1 : 0.8;
    ns = notchScore(u, v, dir);
    if (ns === null && rules.asymNotch && exact) {
      ns = asymNotchScore(u, v, dir);
      if (ns !== null) rule = 'one notch more on one side';
    }
  } else if (rules.eased && relLen <= SKELETON.lenRelEased) {
    lenScore = 0.5;
    ns = endNotchScore(u, v, dir);
    if (ns === null || ns < 0.7) return null;
    rule = `eased ${(relLen * 100).toFixed(1)} %: end notches agree`;
  } else if (!rules.eased && relLen <= PROBE_LOOSE_REL) {
    lenScore = 0.5;
    ns = notchScore(u, v, dir);
  } else {
    return null;
  }
  if (ns === null) return null;

  const reflectedCopy =
    ctx.mirroredCut.has(u.piece.pieceKey) || ctx.mirroredCut.has(v.piece.pieceKey);
  if (
    rules.shape &&
    !self &&
    tk !== 'identical' &&
    !reflectedCopy &&
    !(u.piece.rect || v.piece.rect)
  ) {
    if (mirrorOnly(u, v)) return null;
  }
  const how: Meeting = self
    ? 'fold'
    : tk === 'identical'
      ? 'stack'
      : reflectedCopy || !rules.orient
        ? 'any'
        : 'join';

  const bothConvex = u.turnDeg > CONVEX_PAIR_DEG && v.turnDeg > CONVEX_PAIR_DEG;
  const complementary = (u.turnDeg > 10 && v.turnDeg < -10) || (u.turnDeg < -10 && v.turnDeg > 10);
  const score =
    0.45 * lenScore +
    0.45 * ns +
    0.1 * (bothConvex ? 0.75 : 1) -
    (rules.ends ? ENDS_WEIGHT * Math.min(1, endsError(u, v, how) / ENDS_SCALE_DEG) : 0) -
    (u.chain ? SKELETON.chainPenalty : 0) -
    (v.chain ? SKELETON.chainPenalty : 0) -
    (tk === 'mirror' ? SKELETON.twinMirrorPenalty : 0) -
    (self ? SKELETON.selfPenalty : 0);

  const parts: ScoreParts = {
    lenScore,
    notch: ns,
    shapeRmsMm: shapeRms(u, v, how),
    endsErrDeg: endsError(u, v, how),
    meeting: how,
  };
  const notchEvidence: SeamEvidence['notchScore'] =
    u.notchesMm.length === 0 && v.notchesMm.length === 0 ? null : (ns as 0 | 0.3 | 0.7 | 1);
  if (tk === 'identical' && rules.identical) {
    rule = 'identical layers: one seam along the longest convex edge';
  }
  return {
    u,
    v,
    score,
    parts,
    regular: !self && tk !== 'mirror',
    kind: 'edge',
    evidence: {
      dLenMm,
      relLen,
      notchScore: notchEvidence,
      curvature: bothConvex ? 'both-convex' : complementary ? 'complementary' : 'flat',
      hand: cross ? 'cross' : hu && hv ? 'same' : 'neutral',
      twin: tk ?? 'none',
      self,
      rule,
    },
  };
}

/**
 * Score two runs as one seam, or null when no rule lets them pair. Exported for the composite pass
 * (A4): a unit's edge is a Run whose `pts` / `notchesMm` are the glued edges of its pieces.
 */
export function scoreRuns(
  u: Run,
  v: Run,
  rules: MatchRules = ALL_RULES,
): { score: number; evidence: SeamEvidence; parts: ScoreParts } | null {
  const c = scorePair(u, v, rules, { designated: new Set(), mirroredCut: new Set() });
  return c ? { score: c.score, evidence: c.evidence, parts: c.parts } : null;
}

// ── sides of unnamed mirror pairs ───────────────────────────────────────────────────────────

/**
 * Parity union-find over pieces: «same side» / «opposite side». Anchors: named hands (L ≠ R) and
 * mirror twins (opposite). Then confident, notch-backed, unrivalled seams join their pieces on one
 * side, best first, skipping any that would contradict what is already known. Returns a test that
 * answers only when both pieces sit in one connected group.
 */
function inferSides(
  pieces: readonly PieceGeom[],
  cands: readonly Cand[],
): (a: string, b: string) => boolean | undefined {
  const parent = new Map<string, string>();
  const parity = new Map<string, number>(); // parity to parent
  const find = (k: string): [string, number] => {
    if (!parent.has(k)) {
      parent.set(k, k);
      parity.set(k, 0);
    }
    let r = k;
    let p = 0;
    while (parent.get(r) !== r) {
      p ^= parity.get(r) ?? 0;
      r = parent.get(r) ?? r;
    }
    return [r, p];
  };
  /** Constrain parity(a) xor parity(b) = rel; false on contradiction. */
  const link = (a: string, b: string, rel: number): boolean => {
    const [ra, pa] = find(a);
    const [rb, pb] = find(b);
    if (ra === rb) return (pa ^ pb) === rel;
    parent.set(ra, rb);
    parity.set(ra, pa ^ pb ^ rel);
    return true;
  };
  const L = '\u0000L';
  const R = '\u0000R';
  link(L, R, 1);
  const inPlay = new Set<string>();
  for (const p of pieces) {
    if (p.hand) {
      link(p.pieceKey, p.hand === 'L' ? L : R, 0);
      inPlay.add(p.pieceKey);
    }
    for (const t of p.twinOf) {
      if (t.kind !== 'mirror') continue;
      link(p.pieceKey, t.key, 1);
      inPlay.add(p.pieceKey);
      inPlay.add(t.key);
    }
  }
  for (const c of cands) {
    if (c.score < SIDE_CONFIDENT) break;
    if (!c.regular || c.evidence.notchScore === null || c.evidence.notchScore < 0.7) continue;
    const a = c.u.piece.pieceKey;
    const b = c.v.piece.pieceKey;
    if (!inPlay.has(a) || !inPlay.has(b)) continue;
    const mine = new Set([...c.u.edges, ...c.v.edges].map((e) => e.id));
    const rivals = cands.some(
      (q) =>
        q !== c &&
        q.score >= c.score - SKELETON.ambiguity &&
        [...q.u.edges, ...q.v.edges].some((e) => mine.has(e.id)),
    );
    if (!rivals) link(a, b, 0);
  }
  return (a, b) => {
    if (!inPlay.has(a) || !inPlay.has(b)) return undefined;
    const [ra, pa] = find(a);
    const [rb, pb] = find(b);
    return ra === rb ? pa === pb : undefined;
  };
}

// ── closures ────────────────────────────────────────────────────────────────────────────────

function closureReason(c: Cand, facts: SkeletonFacts, drills: Map<string, Pt2[]>): string | null {
  if (!isStraight(c.u) || !isStraight(c.v)) return null;
  const near = (r: Run) =>
    (drills.get(r.piece.pieceKey) ?? []).filter((d) =>
      r.pts.some((p) => dist(p, d) <= DRILL_EDGE_MM),
    ).length;
  const nd = Math.max(near(c.u), near(c.v));
  if (nd >= DRILLS_FOR_CLOSURE) return `closure: ${nd} drills along the edge`;
  const trims = facts.bom.zipper + facts.bom.buttons + facts.bom.snaps;
  const front = FRONT_NAME.test(c.u.piece.name) || FRONT_NAME.test(c.v.piece.name);
  if (trims > 0 && front) return 'closure: centre front with zip / buttons / snaps in the BOM';
  return null;
}

// ── A3 ──────────────────────────────────────────────────────────────────────────────────────

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** A candidate's identity regardless of which side was read first. */
const candId = (c: Cand) => [c.u.id, c.v.id].sort(cmp).join('~');

const toCandidate = (c: Cand, ambiguousWith?: SeamCandidate[]): SeamCandidate => ({
  a: c.u.id,
  b: c.v.id,
  score: Math.round(c.score * 1000) / 1000,
  evidence: c.dropped ? { ...c.evidence, rule: c.dropped } : c.evidence,
  kind: c.kind,
  ...(ambiguousWith && ambiguousWith.length ? { ambiguousWith } : {}),
});

export function matchSeams(
  pieces: readonly PieceGeom[],
  facts: SkeletonFacts,
  rules: MatchRules = ALL_RULES,
): SeamGraph {
  const warnings: string[] = [];
  // CANONICAL ORDER. Pieces by key, candidates by score then by their edge ids: the graph must not
  // depend on the order the card lists its pieces in (ties — equal unnotched edges, the two sides of
  // a symmetric piece — were broken by input order, and a reversed card read 10/60 blazer seams
  // differently).
  const byKey = [...pieces].sort((a, b) => cmp(a.pieceKey, b.pieceKey));
  const runs = byKey.flatMap((p) => runsOf(p, rules.softChain));

  // Identical layers: one designated edge per piece that has an identical twin.
  const designated = new Set<EdgeId>();
  if (rules.identical) {
    for (const p of pieces) {
      if (!p.twinOf.some((t) => t.kind === 'identical')) continue;
      const e = identicalSeamEdge(p);
      if (e) designated.add(e.id);
    }
  }

  const mirroredCut = new Set(
    facts.pieces.filter((p) => /MIRROR/i.test(p.cutSymmetry ?? '')).map((p) => p.pieceKey),
  );
  const bothHands = new Set(facts.pieces.filter(isMirroredPair).map((p) => p.pieceKey));
  const all: Cand[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const c = scorePair(runs[i], runs[j], rules, { designated, mirroredCut, bothHands });
      if (c) all.push(c);
    }
  }
  all.sort((a, b) => b.score - a.score || cmp(candId(a), candId(b)));
  if (rules.sides && rules.hand) {
    const sameSide = inferSides(
      byKey.map((p) => (bothHands.has(p.pieceKey) ? { ...p, hand: null } : p)),
      all,
    );
    for (const c of all) {
      if (c.evidence.twin === 'mirror' || c.evidence.self || c.evidence.hand === 'cross') continue;
      if (sameSide(c.u.piece.pieceKey, c.v.piece.pieceKey) === false) {
        c.dropped = 'opposite sides (inferred from the mirror pair and its confident seams)';
      }
    }
  }

  // Weak kinds (mirror twins, self seams): only on a straight edge for mirrors, and only where
  // neither edge has a regular candidate that would pass on its own.
  const bestRegular = new Map<EdgeId, number>();
  for (const c of all) {
    if (!c.regular || c.dropped) continue;
    for (const e of [...c.u.edges, ...c.v.edges]) {
      bestRegular.set(e.id, Math.max(bestRegular.get(e.id) ?? -Infinity, c.score));
    }
  }
  const drills = new Map<string, Pt2[]>();
  for (const p of facts.pieces) drills.set(p.pieceKey, drillPoints(p.piece));

  for (const c of all) {
    if (c.regular) continue;
    const mirror = c.evidence.twin === 'mirror';
    if (rules.closure && mirror) {
      const why = closureReason(c, facts, drills);
      // A closure is judged on the base score: the twin penalty is what makes it a closure.
      const rivalled = [...c.u.edges, ...c.v.edges].some(
        (e) => (bestRegular.get(e.id) ?? -Infinity) >= SKELETON.accept,
      );
      if (why && !rivalled && c.score + SKELETON.twinMirrorPenalty >= SKELETON.accept) {
        c.kind = 'closure-not-seam';
        c.evidence = { ...c.evidence, rule: why };
        continue;
      }
    }
    if (!rules.weak) continue;
    if (mirror && (!isStraight(c.u) || !isStraight(c.v) || c.u.chain || c.v.chain)) {
      c.dropped = 'mirror twins meet only along a straight centre edge';
      continue;
    }
    if (mirror && (!isCentreLong(c.u) || !isCentreLong(c.v))) {
      c.dropped = 'mirror twins meet only along a centre edge that runs the piece';
      continue;
    }
    const rival = [...c.u.edges, ...c.v.edges].some(
      (e) => (bestRegular.get(e.id) ?? -Infinity) >= SKELETON.accept,
    );
    if (rival) {
      c.dropped = `${mirror ? 'mirror-twin pair' : 'self seam'} loses to a regular candidate on the same edge`;
    }
  }

  // Greedy: closures first (they take their edges out of play), then seams. Each edge is sewn
  // once — except an edge of a mirrored block cut twice (×2 MIRRORED): its reflected copy is the
  // other hand, so it may meet a SECOND edge of the same single piece it already meets (FRONT_L's
  // shoulder onto both shoulders of the back). Never twice onto another ×2 block: two copies of a
  // sleeve meet two copies of a cuff in one pair of edges, not two.
  const usedBy = new Map<EdgeId, { piece: string; edge: EdgeId }[]>();
  const sides = (c: Cand): [Run, Run][] => [
    [c.u, c.v],
    [c.v, c.u],
  ];
  const take = (c: Cand) => {
    for (const [r, other] of sides(c))
      for (const e of r.edges)
        usedBy.set(e.id, [
          ...(usedBy.get(e.id) ?? []),
          { piece: other.piece.pieceKey, edge: other.edges[0].id },
        ]);
  };
  const free = (c: Cand) =>
    sides(c).every(([r, other]) =>
      r.edges.every((e) => {
        const uses = usedBy.get(e.id) ?? [];
        if (uses.length === 0) return true;
        return (
          uses.length === 1 &&
          bothHands.has(r.piece.pieceKey) &&
          !bothHands.has(other.piece.pieceKey) &&
          uses[0].piece === other.piece.pieceKey &&
          uses[0].edge !== other.edges[0].id
        );
      }),
    );
  const closures: Cand[] = [];
  for (const c of all) {
    if (c.kind !== 'closure-not-seam' || !free(c)) continue;
    closures.push(c);
    take(c);
    warnings.push(`${c.u.id} ↔ ${c.v.id} is a closure, not a seam (${c.evidence.rule})`);
  }
  const eligible = all.filter((c) => c.kind !== 'closure-not-seam' && !c.dropped);
  const chosenC: Cand[] = [];
  for (const c of eligible) {
    if (c.score < SKELETON.accept) break;
    if (!free(c)) continue;
    chosenC.push(c);
    take(c);
  }

  const touches = (a: Cand, b: Cand) => {
    const ea = new Set([...a.u.edges, ...a.v.edges].map((e) => e.id));
    return [...b.u.edges, ...b.v.edges].some((e) => ea.has(e.id));
  };
  const sameAnswer = (x: Run, y: Run) => {
    if (x.chain || y.chain) return false;
    if (Math.abs(x.lenMm - y.lenMm) > SKELETON.lenAbsMm) return false;
    if (x.notchesMm.length !== y.notchesMm.length) return false;
    if (x.piece === y.piece) return rules.equivRect && x.piece.rect;
    // Another piece of the same shape and (as far as the card knows) the same cloth: the pattern
    // cannot tell the two apart from this edge — which one is a question of cloth, not of seams.
    return rules.equivLayers && congruent(x.piece, y.piece);
  };
  const equivalent = (c: Cand, q: Cand) =>
    (c.u.id === q.u.id && sameAnswer(c.v, q.v)) ||
    (c.u.id === q.v.id && sameAnswer(c.v, q.u)) ||
    (c.v.id === q.u.id && sameAnswer(c.u, q.v)) ||
    (c.v.id === q.v.id && sameAnswer(c.u, q.u));
  const chosenSet = new Set(chosenC);
  const chosen = chosenC.map((c) => {
    const alts = eligible.filter(
      (q) =>
        q !== c &&
        // The other hand's copy of a ×2 mirrored block is sewn too, not an alternative.
        !chosenSet.has(q) &&
        Math.abs(q.score - c.score) <= SKELETON.ambiguity &&
        touches(c, q) &&
        !equivalent(c, q),
    );
    return toCandidate(
      c,
      alts.map((q) => toCandidate(q)),
    );
  });

  const rejected = [
    ...closures.map((c) => toCandidate(c)),
    ...all
      .filter(
        (c) => !chosenSet.has(c) && c.kind !== 'closure-not-seam' && c.score >= REJECTED_FLOOR,
      )
      .map((c) => toCandidate(c)),
  ];

  // Connected components over seams (closures do not join pieces).
  const parent = new Map(pieces.map((p) => [p.pieceKey, p.pieceKey]));
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    parent.set(k, r);
    return r;
  };
  for (const c of chosenC) parent.set(find(c.u.piece.pieceKey), find(c.v.piece.pieceKey));
  const groups = new Map<string, string[]>();
  for (const p of pieces) {
    const r = find(p.pieceKey);
    groups.set(r, [...(groups.get(r) ?? []), p.pieceKey]);
  }

  const unnotched = pieces.filter((p) => p.notchIdx.length === 0).length;
  if (pieces.length && unnotched === pieces.length) {
    warnings.push('no notches in the pattern — every pair rests on length alone');
  } else if (unnotched > 0) {
    warnings.push(`${unnotched} of ${pieces.length} pieces carry no notches`);
  }

  return { pieces: [...pieces], chosen, rejected, components: [...groups.values()], warnings };
}
