// A4 — the second pass over lane B's units (01-PLAN §2 A4): what A3 cannot see edge by edge.
//
// Two kinds of seam, both read AFTER the first pass and the units built on it:
//
//   partial   — a short edge sewn onto part of a long one (panel strips of SS26-005: 455 mm onto
//               482 mm). A3 asks for equal lengths and rejects these. Searched ONLY where a unit of
//               lane B has pieces no seam connects yet (the names said «one panel», the geometry
//               found no join): one END of the pair must true up (the two corner angles add up to a
//               straight line — the hem runs on), the short edge must fit the long one rigidly from
//               that end, and notches read from that end must not contradict.
//
//   composite — an edge of an assembled unit, glued from several pieces' free edges across the
//               seams already chosen (an armhole = front + side panels + back; a sleeve cap = upper
//               + under sleeve). Walking the boundary of the glued pieces: where a free edge ends at
//               a seam, the boundary continues on the other piece from the seam's other end; a
//               junction is soft when the corner angles of the pieces meeting there add up to a
//               straight line. A maximal soft run over ≥ 2 pieces is a composite edge. Composite
//               edges are matched against free edges, chains and other composites: length within
//               SKELETON.lenRelEased (a cap is eased into its armhole), end notches, ends that true
//               up (open runs); closed loops (armhole, cap) only against closed loops.
//
// The result is the same SeamGraph with the new seams appended to `chosen` (kind 'partial' /
// 'composite'); a composite seam names its longest part in `a` / `b` and every part in
// `aParts` / `bParts`, so every reader that splits ids by piece keeps working.

import {
  SKELETON,
  type Edge,
  type EdgeId,
  type Hand,
  type PieceGeom,
  type Pt2,
  type SeamCandidate,
  type SeamEvidence,
  type SeamGraph,
  type SkeletonUnit,
} from '../types';
import { cornerTurn, edgeIdsOf } from './match';
import { dist } from './segment';

// ── thresholds (A4; measured on SS26-005 / Allsizes / blazer — change only with a re-measure) ──

/** A partial pair: the short edge is at least this share of the long one. */
const PARTIAL_MIN_RATIO = 0.6;
/** The aligned end trues up within this many degrees (interior angles add to 180°). */
const PARTIAL_END_DEG = 20;
/** Rigid fit of the short edge onto the long one from the aligned end: RMS (mm) at score 0. */
const PARTIAL_FIT_MM = 6;
/** …and the RMS above which the pair is no fit at all. */
const PARTIAL_FIT_MAX_MM = 3.5;
/** Samples along the overlap for the rigid fit. */
const FIT_SAMPLES = 32;
/** A partial seam costs this much against an edge seam of the same evidence. */
const PARTIAL_PENALTY = 0.05;
/** A boundary junction is soft when the boundary turns less than this there (deg). */
const SOFT_JUNCTION_DEG = 45;
/** Composite ends: summed end error (deg) at which the ends term is 0. */
const COMPOSITE_ENDS_SCALE = 60;
/** Longest walk across seams at one junction (pieces meeting at one point). */
const WALK_GUARD = 6;

// ── edges of one piece in ring order ────────────────────────────────────────────────────────

type Ring = { piece: PieceGeom; byId: Map<EdgeId, Edge>; next: Map<EdgeId, Edge> };

function ringOf(piece: PieceGeom): Ring {
  const byId = new Map(piece.edges.map((e) => [e.id, e]));
  const next = new Map<EdgeId, Edge>();
  const n = piece.rs.length || 1;
  for (const e of piece.edges) {
    // The edge that starts where this one ends; a dropped corner artefact leaves a gap — then
    // the edge that starts soonest after it.
    let best: Edge | undefined;
    let bestGap = Infinity;
    for (const f of piece.edges) {
      if (f === e && piece.edges.length > 1) continue;
      const gap = (f.s - e.e + n) % n;
      if (gap < bestGap) {
        bestGap = gap;
        best = f;
      }
    }
    if (best) next.set(e.id, best);
  }
  return { piece, byId, next };
}

const turnAt = (piece: PieceGeom, idx: number) => cornerTurn(piece, idx);

// ── arc-length sampling and a rigid fit ─────────────────────────────────────────────────────

/** Points at arc lengths `at` measured from the start (or, `fromEnd`, from the end) of `pts`. */
function sampleArc(pts: readonly Pt2[], at: readonly number[], fromEnd: boolean): Pt2[] {
  const p = fromEnd ? [...pts].reverse() : pts;
  const cum: number[] = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + dist(p[i], p[i - 1]));
  const out: Pt2[] = [];
  let j = 0;
  for (const t of at) {
    while (j < cum.length - 2 && cum[j + 1] < t) j++;
    const f = Math.max(0, Math.min(1, (t - cum[j]) / (cum[j + 1] - cum[j] || 1)));
    out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * f, p[j][1] + (p[j + 1][1] - p[j][1]) * f]);
  }
  return out;
}

/** RMS (mm) of the best proper rigid motion (no reflection) taking `b` onto `a`, pointwise. */
function rigidRms(a: readonly Pt2[], b: readonly Pt2[]): number {
  const n = a.length;
  let ax = 0;
  let ay = 0;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < n; i++) {
    ax += a[i][0];
    ay += a[i][1];
    bx += b[i][0];
    by += b[i][1];
  }
  ax /= n;
  ay /= n;
  bx /= n;
  by /= n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const px = b[i][0] - bx;
    const py = b[i][1] - by;
    const qx = a[i][0] - ax;
    const qy = a[i][1] - ay;
    sxx += px * qx + py * qy;
    sxy += px * qy - py * qx;
  }
  const th = Math.atan2(sxy, sxx);
  const c = Math.cos(th);
  const s = Math.sin(th);
  let e = 0;
  for (let i = 0; i < n; i++) {
    const px = b[i][0] - bx;
    const py = b[i][1] - by;
    const x = c * px - s * py + ax;
    const y = s * px + c * py + ay;
    e += (x - a[i][0]) ** 2 + (y - a[i][1]) ** 2;
  }
  return Math.sqrt(e / n);
}

// ── partial seams ───────────────────────────────────────────────────────────────────────────

type Partial = {
  u: Edge;
  v: Edge;
  score: number;
  /** Which corners coincide: u's start with v's end ('us') or u's end with v's start ('ue'). */
  aligned: 'us' | 'ue';
  rmsMm: number;
  endErrDeg: number;
  notchScore: SeamEvidence['notchScore'];
  notchesMatched: number;
};

/** Notches of the short side against the long side, both read from the aligned end. */
function partialNotches(
  short: number[],
  long: number[],
  span: number,
): { score: number; matched: number; evidence: SeamEvidence['notchScore'] } {
  const within = long.filter((d) => d <= span - SKELETON.cornerWinMm);
  if (short.length === 0 && within.length === 0) return { score: 0.5, matched: 0, evidence: null };
  const matched = short.filter((d) =>
    within.some((x) => Math.abs(x - d) <= SKELETON.notchTolMm),
  ).length;
  const total = Math.max(short.length, within.length);
  const share = matched / total;
  const evidence: SeamEvidence['notchScore'] =
    share >= 1 ? 1 : share >= 0.66 ? 0.7 : share > 0 ? 0.3 : 0;
  return { score: evidence, matched, evidence };
}

export function scorePartial(u: Edge, v: Edge, pu: PieceGeom, pv: PieceGeom): Partial | null {
  const [short, long] = u.lenMm <= v.lenMm ? [u, v] : [v, u];
  if (short.lenMm < SKELETON.minSeamMm) return null;
  const ratio = short.lenMm / long.lenMm;
  if (ratio < PARTIAL_MIN_RATIO || 1 - ratio <= SKELETON.lenRel) return null;
  if (pu.hand && pv.hand && pu.hand !== pv.hand) return null;
  const span = short.lenMm;
  const at = Array.from({ length: FIT_SAMPLES }, (_, i) => (span * i) / (FIT_SAMPLES - 1));
  let best: Partial | null = null;
  for (const aligned of ['us', 'ue'] as const) {
    // Face-up pieces walk a shared seam oppositely: u from its start meets v from its end.
    const uFromEnd = aligned === 'ue';
    const vFromEnd = aligned === 'us';
    const tu = turnAt(pu, uFromEnd ? u.e : u.s);
    const tv = turnAt(pv, vFromEnd ? v.e : v.s);
    const endErrDeg = Math.abs(180 - tu - tv);
    if (endErrDeg > PARTIAL_END_DEG) continue;
    const rmsMm = rigidRms(sampleArc(u.pts, at, uFromEnd), sampleArc(v.pts, at, vFromEnd));
    if (rmsMm > PARTIAL_FIT_MAX_MM) continue;
    const fromAligned = (e: Edge, fromEnd: boolean) =>
      fromEnd ? e.notchesMm.map((d) => e.lenMm - d).reverse() : e.notchesMm;
    const nu = fromAligned(u, uFromEnd);
    const nv = fromAligned(v, vFromEnd);
    const n = short === u ? partialNotches(nu, nv, span) : partialNotches(nv, nu, span);
    if (n.evidence === 0) continue;
    const fit = Math.max(0, 1 - rmsMm / PARTIAL_FIT_MM);
    const trued = Math.max(0, 1 - endErrDeg / 45);
    const score = 0.45 * fit + 0.35 * n.score + 0.2 * trued - PARTIAL_PENALTY;
    if (!best || score > best.score)
      best = {
        u,
        v,
        score,
        aligned,
        rmsMm,
        endErrDeg,
        notchScore: n.evidence,
        notchesMatched: n.matched,
      };
  }
  return best;
}

// ── the glued boundary ──────────────────────────────────────────────────────────────────────

/** One side of a seam as the walk sees it: the run of edges and the piece it lies on. */
type Side = { piece: PieceGeom; edges: Edge[] };
/** 'stop': a partial seam's unaligned end — the corner lands mid-edge, the walk cannot cross. */
type Glue = { self: Side; other: Side; how: 'join' | 'stop' };

type Step = { edge: Edge; piece: PieceGeom; turn: number } | null;

/** A run of free edges along the boundary of the glued pieces. */
type CRun = {
  id: string;
  parts: Edge[];
  pieces: Set<string>;
  lenMm: number;
  notchesMm: number[];
  closed: boolean;
  /** Boundary turn (deg) at the run's start / end junction — for open runs. */
  turnStart: number;
  turnEnd: number;
  hand: Hand;
};

function sideOf(id: EdgeId, rings: Map<string, Ring>): Side | null {
  const ids = edgeIdsOf(id);
  const piece = id.slice(0, id.lastIndexOf('#'));
  const r = rings.get(piece);
  if (!r) return null;
  const edges = ids.map((x) => r.byId.get(x)).filter((e): e is Edge => !!e);
  return edges.length === ids.length ? { piece: r.piece, edges } : null;
}

/**
 * The boundary step after free edge `f`: the next edge of its piece, or — when that one is sewn —
 * the edge after the seam's other end on the other piece. `turn` is the boundary's turn at the
 * junction: the pieces' corner turns there summed, minus 180° per seam crossed.
 */
function stepAfter(
  f: Edge,
  piece: PieceGeom,
  rings: Map<string, Ring>,
  glueOf: Map<EdgeId, Glue>,
): Step {
  let cur = f;
  let p = piece;
  let turn = turnAt(p, cur.e);
  for (let hop = 0; hop < WALK_GUARD; hop++) {
    const n = rings.get(p.pieceKey)?.next.get(cur.id);
    if (!n) return null;
    const g = glueOf.get(n.id);
    if (!g) return { edge: n, piece: p, turn };
    // Entering a seam in its middle, or at a partial seam's unaligned end: not a corner we know.
    if (g.self.edges[0] !== n || g.how === 'stop') return null;
    // Face-up pieces: n's start sits on the other side's END.
    const last = g.other.edges[g.other.edges.length - 1];
    p = g.other.piece;
    cur = last;
    turn += turnAt(p, last.e) - 180;
  }
  return null;
}

/**
 * Second and later layers of identical twins (collar / under-collar): the same outline once more,
 * never a boundary of their own.
 */
function layerFollowers(pieces: readonly PieceGeom[]): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  for (const p of pieces) {
    if (p.twinOf.some((t) => t.kind === 'identical' && seen.has(t.key))) out.add(p.pieceKey);
    seen.add(p.pieceKey);
  }
  return out;
}

function buildRuns(
  pieces: readonly PieceGeom[],
  rings: Map<string, Ring>,
  glueOf: Map<EdgeId, Glue>,
  blocked: ReadonlySet<EdgeId>,
): CRun[] {
  const followers = layerFollowers(pieces);
  const free: { edge: Edge; piece: PieceGeom }[] = [];
  for (const p of pieces) {
    if (followers.has(p.pieceKey)) continue;
    for (const e of p.edges)
      if (!glueOf.has(e.id) && !blocked.has(e.id)) free.push({ edge: e, piece: p });
  }
  const freeIds = new Set(free.map((x) => x.edge.id));
  const succ = new Map<EdgeId, { id: EdgeId; turn: number }>();
  const pred = new Map<EdgeId, { id: EdgeId; turn: number }>();
  const pieceOf = new Map(free.map((x) => [x.edge.id, x.piece]));
  for (const { edge, piece } of free) {
    const s = stepAfter(edge, piece, rings, glueOf);
    if (!s || !freeIds.has(s.edge.id) || Math.abs(s.turn) > SOFT_JUNCTION_DEG) continue;
    if (pred.has(s.edge.id)) continue;
    succ.set(edge.id, { id: s.edge.id, turn: s.turn });
    pred.set(s.edge.id, { id: edge.id, turn: s.turn });
  }
  const edgeOf = new Map(free.map((x) => [x.edge.id, x.edge]));
  const seen = new Set<EdgeId>();
  const runs: CRun[] = [];
  const emit = (ids: EdgeId[], closed: boolean) => {
    const parts = ids.map((id) => edgeOf.get(id)!);
    const keys = new Set(parts.map((e) => e.pieceKey));
    if (keys.size < 2) return;
    const notchesMm: number[] = [];
    let at = 0;
    for (const e of parts) {
      for (const d of e.notchesMm) notchesMm.push(at + d);
      at += e.lenMm;
    }
    const first = parts[0];
    const last = parts[parts.length - 1];
    const hands = new Set(parts.map((e) => pieceOf.get(e.id)?.hand ?? null));
    hands.delete(null);
    runs.push({
      id: ids.join('|'),
      parts,
      pieces: keys,
      lenMm: at,
      notchesMm,
      closed,
      turnStart: closed ? 0 : turnAt(pieceOf.get(first.id)!, first.s),
      turnEnd: closed ? 0 : turnAt(pieceOf.get(last.id)!, last.e),
      hand: hands.size === 1 ? [...hands][0] : null,
    });
  };
  // Open runs start where nothing soft leads in.
  for (const { edge } of free) {
    if (pred.has(edge.id) || seen.has(edge.id)) continue;
    const ids: EdgeId[] = [];
    for (let id: EdgeId | undefined = edge.id; id && !seen.has(id); id = succ.get(id)?.id) {
      seen.add(id);
      ids.push(id);
    }
    emit(ids, false);
  }
  // What is left lies on closed soft loops (an armhole with both its seams sewn).
  for (const { edge } of free) {
    if (seen.has(edge.id)) continue;
    const ids: EdgeId[] = [];
    for (let id: EdgeId | undefined = edge.id; id && !seen.has(id); id = succ.get(id)?.id) {
      seen.add(id);
      ids.push(id);
    }
    emit(ids, true);
  }
  return runs;
}

// ── matching composite edges ────────────────────────────────────────────────────────────────

type Mate = {
  id: string;
  parts: Edge[];
  pieces: Set<string>;
  lenMm: number;
  notchesMm: number[];
  closed: boolean;
  turnStart: number;
  turnEnd: number;
  hand: Hand;
};

const ladder = (err: number): 0 | 0.3 | 0.7 | 1 =>
  err <= SKELETON.notchTolMm ? 1 : err <= 8 ? 0.7 : err <= 15 ? 0.3 : 0;

/** Notches of an eased pair: the end notches from each end (ease spreads over the middle). */
function easedNotches(a: Mate, b: Mate): 0 | 0.3 | 0.7 | 1 | null {
  if (a.notchesMm.length === 0 && b.notchesMm.length === 0) return null;
  if (a.notchesMm.length === 0 || b.notchesMm.length === 0) return 0;
  // Face-up: b is read from its end.
  const bn = b.notchesMm.map((d) => b.lenMm - d).reverse();
  const e0 = Math.abs(a.notchesMm[0] - bn[0]);
  const e1 = Math.abs(
    a.lenMm - a.notchesMm[a.notchesMm.length - 1] - (b.lenMm - bn[bn.length - 1]),
  );
  return ladder(Math.max(e0, e1));
}

type CompCand = { a: Mate; b: Mate; score: number; evidence: SeamEvidence };

function scoreComposite(a: Mate, b: Mate): CompCand | null {
  if (a.closed !== b.closed) return null;
  for (const k of a.pieces) if (b.pieces.has(k)) return null;
  if (a.hand && b.hand && a.hand !== b.hand) return null;
  if (Math.min(a.lenMm, b.lenMm) < SKELETON.minSeamMm) return null;
  const dLenMm = Math.abs(a.lenMm - b.lenMm);
  const relLen = dLenMm / Math.max(a.lenMm, b.lenMm);
  if (relLen > SKELETON.lenRelEased) return null;
  const exact = dLenMm <= SKELETON.lenAbsMm || relLen <= SKELETON.lenRel;
  const lenScore = exact ? 1 : 0.5;
  let ns: number | null;
  let endsTerm = 1;
  if (a.closed) {
    // A loop has no start to read notches from: equal counts are all a loop can say.
    ns =
      a.notchesMm.length === 0 && b.notchesMm.length === 0
        ? null
        : a.notchesMm.length === b.notchesMm.length
          ? 0.7
          : 0.3;
  } else {
    ns = easedNotches(a, b);
    const ia0 = 180 - a.turnStart;
    const ia1 = 180 - a.turnEnd;
    const ib0 = 180 - b.turnStart;
    const ib1 = 180 - b.turnEnd;
    const err = Math.abs(ia0 + ib1 - 180) + Math.abs(ia1 + ib0 - 180);
    endsTerm = Math.max(0, 1 - err / COMPOSITE_ENDS_SCALE);
  }
  // Lengths of glued runs agree by coincidence too often (two 65 mm collar ends, a 161 mm armhole
  // part and a 160 mm cap): a composite is taken only on agreeing notches.
  if (ns === null || ns < 0.7) return null;
  const score = 0.45 * lenScore + 0.45 * (ns ?? 0.5) + 0.1 * endsTerm - SKELETON.chainPenalty;
  return {
    a,
    b,
    score,
    evidence: {
      dLenMm,
      relLen,
      notchScore: ns === null ? null : (ns as 0 | 0.3 | 0.7 | 1),
      curvature: 'flat',
      hand: a.hand && b.hand ? 'same' : 'neutral',
      twin: 'none',
      self: false,
      rule: `composite ${a.closed ? 'loop' : 'edge'}: ${a.parts.length} + ${b.parts.length} parts, ${Math.round(a.lenMm)} ${exact ? '=' : 'vs'} ${Math.round(b.lenMm)} mm${exact ? '' : ' (eased)'}`,
      aLenMm: a.lenMm,
      bLenMm: b.lenMm,
      notchesMatched:
        ns !== null && ns >= 0.7 ? Math.min(a.notchesMm.length, b.notchesMm.length) : 0,
    },
  };
}

// ── A4 ──────────────────────────────────────────────────────────────────────────────────────

export type CompositeOptions = {
  /** Partial seams inside units (default on). */
  partial?: boolean;
  /** Composite edges of the glued pieces (default on). */
  composite?: boolean;
};

/** A seam this short, straight and unnotched is the weakest evidence A3 takes (two hems). */
const WEAK_SEAM_MAX_MM = 120;
/** …and it loses its pieces to a fit this many times longer from the same corner. */
const WEAK_SEAM_OUTWEIGH = 2.5;

const pieceOfId = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));
const idsOf = (c: SeamCandidate, side: 'a' | 'b') =>
  side === 'a' ? c.aParts ?? edgeIdsOf(c.a) : c.bParts ?? edgeIdsOf(c.b);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

type Board = {
  rings: Map<string, Ring>;
  glueOf: Map<EdgeId, Glue>;
  blocked: Set<EdgeId>;
  used: Set<EdgeId>;
};

/** Glue map + used / blocked edges of a seam list (closures from `rejected` block their edges). */
function boardOf(
  pieces: readonly PieceGeom[],
  chosen: readonly SeamCandidate[],
  rejected: readonly SeamCandidate[],
): Board {
  const rings = new Map(pieces.map((p) => [p.pieceKey, ringOf(p)]));
  const glueOf = new Map<EdgeId, Glue>();
  const blocked = new Set<EdgeId>();
  const used = new Set<EdgeId>();
  for (const c of chosen) {
    const ids = [...idsOf(c, 'a'), ...idsOf(c, 'b')];
    for (const id of ids) used.add(id);
    // Stacked layers, folds and composite seams do not open the boundary onto another piece.
    if (c.kind === 'composite' || c.evidence.self || c.evidence.twin === 'identical') {
      for (const id of ids) blocked.add(id);
      continue;
    }
    const sa = sideOf(c.a, rings);
    const sb = sideOf(c.b, rings);
    if (!sa || !sb) continue;
    // A partial seam is crossed only at its aligned end — by convention a's START on b's END;
    // b's start lands in the middle of a's edge (or past its end), a corner the walk cannot use.
    const howA: Glue['how'] = 'join';
    const howB: Glue['how'] = c.kind === 'partial' ? 'stop' : 'join';
    for (const e of sa.edges) glueOf.set(e.id, { self: sa, other: sb, how: howA });
    for (const e of sb.edges) glueOf.set(e.id, { self: sb, other: sa, how: howB });
  }
  for (const c of rejected) {
    if (c.kind !== 'closure-not-seam') continue;
    for (const id of [...edgeIdsOf(c.a), ...edgeIdsOf(c.b)]) {
      used.add(id);
      blocked.add(id);
    }
  }
  return { rings, glueOf, blocked, used };
}

const isWeak = (c: SeamCandidate, geom: ReadonlyMap<string, PieceGeom>) => {
  if (c.kind !== 'edge' || c.evidence.notchScore !== null) return false;
  if (c.a.includes('+') || c.b.includes('+')) return false;
  const e = (id: EdgeId) => geom.get(pieceOfId(id))?.edges.find((x) => x.id === id);
  const ea = e(c.a);
  const eb = e(c.b);
  return (
    !!ea &&
    !!eb &&
    Math.max(ea.lenMm, eb.lenMm) <= WEAK_SEAM_MAX_MM &&
    ea.chordMm / ea.lenMm >= 0.98 &&
    eb.chordMm / eb.lenMm >= 0.98
  );
};

/** The corner (piece, resample index) where a partial pair's aligned ends meet, on each piece. */
const alignedCorners = (p: Partial): [string, number][] =>
  p.aligned === 'us'
    ? [
        [p.u.pieceKey, p.u.s],
        [p.v.pieceKey, p.v.e],
      ]
    : [
        [p.u.pieceKey, p.u.e],
        [p.v.pieceKey, p.v.s],
      ];

/** A partial seam as a candidate: `a` is the side whose START sits on `b`'s END (aligned end). */
function partialCandidate(p: Partial, unitName: string, rival: boolean): SeamCandidate {
  const [s, l] = p.u.lenMm <= p.v.lenMm ? [p.u, p.v] : [p.v, p.u];
  const [a, b] = p.aligned === 'us' ? [p.u, p.v] : [p.v, p.u];
  return {
    a: a.id,
    b: b.id,
    score: round3(p.score),
    kind: 'partial',
    evidence: {
      dLenMm: l.lenMm - s.lenMm,
      relLen: (l.lenMm - s.lenMm) / l.lenMm,
      notchScore: p.notchScore,
      curvature: 'flat',
      hand: 'neutral',
      twin: 'none',
      self: false,
      rule: `partial: ${Math.round(s.lenMm)} mm onto ${Math.round(l.lenMm)} mm from the end that trues up (${p.endErrDeg.toFixed(0)}°, fit ${p.rmsMm.toFixed(1)} mm) — ${unitName}`,
      aLenMm: a.lenMm,
      bLenMm: b.lenMm,
      notchesMatched: p.notchesMatched,
    },
    ...(rival ? { ambiguousWith: [] } : {}),
  };
}

/**
 * A4: partial seams inside lane B's units, then composite edges of the glued pieces. Returns a new
 * graph: `chosen` gains the new seams (a weak seam a partial outweighs moves to `rejected`),
 * `components` and `warnings` follow. Without units the partial pass has nothing to look at.
 */
export function compositeSeams(
  graph: SeamGraph,
  units: readonly SkeletonUnit[],
  options: CompositeOptions = {},
): SeamGraph {
  const geom = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const warnings = [...graph.warnings];
  // Surface joins (P2 lane S) take no edge: they neither use nor glue the host's boundary. Set
  // aside for the edge passes, back at the end.
  const surface = graph.chosen.filter((c) => c.kind === 'surface');
  let chosen = graph.chosen.filter((c) => c.kind !== 'surface');
  const edgeCount = chosen.length;
  const rejected = [...graph.rejected];
  const added: SeamCandidate[] = [];

  // ── partial seams where a unit's pieces are not connected by its own seams ────────────────
  if (options.partial ?? true) {
    const used = new Set(chosen.flatMap((c) => [...idsOf(c, 'a'), ...idsOf(c, 'b')]));
    for (const c of rejected)
      if (c.kind === 'closure-not-seam')
        for (const id of [...edgeIdsOf(c.a), ...edgeIdsOf(c.b)]) used.add(id);

    /** Best partial pair between two piece groups, and the best score after it. */
    const bestBetween = (left: string[], right: string[]) => {
      let best: Partial | null = null;
      let second = -Infinity;
      for (const ka of left)
        for (const kb of right) {
          const pa = geom.get(ka);
          const pb = geom.get(kb);
          if (!pa || !pb || pa.cloth === 'interfacing' || pb.cloth === 'interfacing') continue;
          for (const ea of pa.edges)
            for (const eb of pb.edges) {
              if (used.has(ea.id) || used.has(eb.id)) continue;
              const c = scorePartial(ea, eb, pa, pb);
              if (!c) continue;
              if (!best || c.score > best.score) {
                if (best) second = Math.max(second, best.score);
                best = c;
              } else second = Math.max(second, c.score);
            }
        }
      return { best, second };
    };
    const take = (p: Partial, unitName: string, rival: boolean) => {
      const cand = partialCandidate(p, unitName, rival);
      used.add(p.u.id);
      used.add(p.v.id);
      chosen.push(cand);
      added.push(cand);
      if (rival)
        warnings.push(
          `partial seam ${p.u.id} ↔ ${p.v.id} has a rival within ${SKELETON.ambiguity}`,
        );
    };

    for (const u of units) {
      const keys = u.pieceKeys.filter((k) => geom.has(k));
      if (keys.length < 2) continue;
      const inUnit = new Set(keys);
      const inside = () =>
        chosen.filter(
          (c) =>
            !c.evidence.self &&
            c.kind !== 'composite' &&
            inUnit.has(pieceOfId(c.a)) &&
            inUnit.has(pieceOfId(c.b)),
        );
      const groups = (seams: SeamCandidate[]) => {
        const parent = new Map(keys.map((k) => [k, k]));
        const find = (k: string): string => {
          let r = k;
          while (parent.get(r) !== r) r = parent.get(r) ?? r;
          return r;
        };
        for (const c of seams) parent.set(find(pieceOfId(c.a)), find(pieceOfId(c.b)));
        const g = new Map<string, string[]>();
        for (const k of keys) g.set(find(k), [...(g.get(find(k)) ?? []), k]);
        return [...g.values()];
      };

      // 1. Pieces of the unit no seam of the unit reaches: the best partial between the groups.
      for (;;) {
        const gs = groups(inside());
        if (gs.length < 2) break;
        let pick: { p: Partial; second: number } | null = null;
        for (let i = 0; i < gs.length; i++)
          for (let j = i + 1; j < gs.length; j++) {
            const { best, second } = bestBetween(gs[i], gs[j]);
            if (best && (!pick || best.score > pick.p.score)) pick = { p: best, second };
          }
        if (!pick || pick.p.score < SKELETON.accept) break;
        take(pick.p, u.name, pick.second >= pick.p.score - SKELETON.ambiguity);
      }

      // 2. A weak seam (two short straight unnotched edges — the hems of two panels) that alone
      //    holds two parts of the unit together loses to a long partial fit from the same corner:
      //    the hems run on, the panels are sewn along their long edges.
      // A seam a person confirmed (`provenance`) never gives way.
      for (const w of inside().filter((c) => isWeak(c, geom) && !c.provenance)) {
        const rest = inside().filter((c) => c !== w);
        const gs = groups(rest);
        if (gs.length < 2) continue;
        const left = gs.find((g) => g.includes(pieceOfId(w.a)));
        const right = gs.find((g) => g.includes(pieceOfId(w.b)));
        if (!left || !right || left === right) continue;
        const { best, second } = bestBetween(left, right);
        if (!best || best.score < SKELETON.accept) continue;
        const wLen = Math.max(
          ...[w.a, w.b].map(
            (id) => geom.get(pieceOfId(id))?.edges.find((e) => e.id === id)?.lenMm ?? 0,
          ),
        );
        if (Math.min(best.u.lenMm, best.v.lenMm) < WEAK_SEAM_OUTWEIGH * wLen) continue;
        const wEdges = [w.a, w.b].map((id) =>
          geom.get(pieceOfId(id))?.edges.find((e) => e.id === id),
        );
        const touches = alignedCorners(best).every(([k, idx]) =>
          wEdges.some((e) => e && e.pieceKey === k && (e.s === idx || e.e === idx)),
        );
        if (!touches) continue;
        chosen = chosen.filter((c) => c !== w);
        for (const id of [w.a, w.b]) used.delete(id);
        rejected.unshift({
          ...w,
          evidence: {
            ...w.evidence,
            rule: `the hems run on: ${w.a} ↔ ${w.b} gives way to the long fit ${best.u.id} ↔ ${best.v.id}`,
          },
        });
        warnings.push(
          `A4 dropped ${w.a} ↔ ${w.b}: short straight pair at the corner of a longer fit`,
        );
        take(best, u.name, second >= best.score - SKELETON.ambiguity);
      }
    }
  }

  // ── composite edges of the glued pieces ───────────────────────────────────────────────────
  if (options.composite ?? true) {
    const board = boardOf(graph.pieces, chosen, rejected);
    const runs = buildRuns(graph.pieces, board.rings, board.glueOf, board.blocked);
    const followers = layerFollowers(graph.pieces);
    const singles: Mate[] = [];
    for (const p of graph.pieces) {
      if (followers.has(p.pieceKey)) continue;
      for (const e of p.edges) {
        if (board.used.has(e.id)) continue;
        singles.push({
          id: e.id,
          parts: [e],
          pieces: new Set([p.pieceKey]),
          lenMm: e.lenMm,
          notchesMm: e.notchesMm,
          closed: false,
          turnStart: turnAt(p, e.s),
          turnEnd: turnAt(p, e.e),
          hand: p.hand,
        });
      }
    }
    const all: CompCand[] = [];
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const c = scoreComposite(runs[i], runs[j]);
        if (c) all.push(c);
      }
      for (const s of singles) {
        const c = scoreComposite(runs[i], s);
        if (c) all.push(c);
      }
    }
    all.sort((x, y) => y.score - x.score);
    const taken = new Set<EdgeId>();
    const free = (m: Mate) => m.parts.every((e) => !taken.has(e.id));
    const longest = (m: Mate) => m.parts.reduce((x, e) => (e.lenMm > x.lenMm ? e : x)).id;
    const toCand = (x: CompCand): SeamCandidate => ({
      a: longest(x.a),
      b: longest(x.b),
      ...(x.a.parts.length > 1 ? { aParts: x.a.parts.map((e) => e.id) } : {}),
      ...(x.b.parts.length > 1 ? { bParts: x.b.parts.map((e) => e.id) } : {}),
      score: round3(x.score),
      kind: 'composite',
      evidence: x.evidence,
    });
    for (const c of all) {
      if (c.score < SKELETON.accept) break;
      if (!free(c.a) || !free(c.b)) continue;
      const rivals = all.filter(
        (q) =>
          q !== c &&
          Math.abs(q.score - c.score) <= SKELETON.ambiguity &&
          (q.a === c.a || q.b === c.b || q.a === c.b || q.b === c.a),
      );
      const cand = {
        ...toCand(c),
        ...(rivals.length ? { ambiguousWith: rivals.map(toCand) } : {}),
      };
      chosen.push(cand);
      added.push(cand);
      for (const e of [...c.a.parts, ...c.b.parts]) taken.add(e.id);
    }
  }

  if (added.length === 0 && chosen.length === edgeCount) return graph;
  for (const c of added) warnings.push(`A4 ${c.kind}: ${c.a} ↔ ${c.b} (${c.evidence.rule ?? ''})`);

  // Components over every seam, the new ones included (folds join nothing new).
  const parent = new Map(graph.pieces.map((p) => [p.pieceKey, p.pieceKey]));
  const root = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    return r;
  };
  chosen = [...chosen, ...surface];
  for (const c of chosen) {
    if (c.evidence.self) continue;
    for (const id of [...idsOf(c, 'a'), ...idsOf(c, 'b')]) {
      const k = pieceOfId(id);
      if (parent.has(k) && parent.has(pieceOfId(c.a))) parent.set(root(k), root(pieceOfId(c.a)));
    }
  }
  const groups = new Map<string, string[]>();
  for (const p of graph.pieces)
    groups.set(root(p.pieceKey), [...(groups.get(root(p.pieceKey)) ?? []), p.pieceKey]);
  return { ...graph, chosen, rejected, components: [...groups.values()], warnings };
}

/** Diagnostics for the probe: the composite runs of a graph's glued boundary. */
export function boundaryRuns(
  graph: SeamGraph,
): { id: string; lenMm: number; closed: boolean; notches: number; pieces: string[] }[] {
  const board = boardOf(graph.pieces, graph.chosen, graph.rejected);
  return buildRuns(graph.pieces, board.rings, board.glueOf, board.blocked).map((r) => ({
    id: r.id,
    lenMm: Math.round(r.lenMm),
    closed: r.closed,
    notches: r.notchesMm.length,
    pieces: [...r.pieces],
  }));
}
