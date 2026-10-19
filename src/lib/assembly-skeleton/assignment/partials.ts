// PARTIAL candidates for the solver (05-ASSIGNMENT-DESIGN phase 3): a short edge sewn onto part of
// a long one, between two pieces the order puts in distinct inputs of one operation and the pair
// pool cannot pair at all (12.10 corpus, card 8: the side panel's back edge 520 onto the back panel's
// 599 from the hem up — the pool, asking for equal lengths, paired the two 599 edges with each other
// and the two 520 edges with each other, left side to right side).
//
// Read BEFORE the assignment, as a variable that competes with the pool's pairs for its edges. The
// evidence is the NOTCHES: read from the aligned end (the end where the two pieces' corners true up
// — the hem runs on), every notch of the short edge sits on a notch of the long one and every notch
// of the long one within the sewn stretch is met — a 322 = 322 coincidence over a 520-mm edge. A4's
// rigid fit (geometry/composite.ts scorePartial) is not asked for: a side-back seam is a shaping
// seam, its two curves are not congruent (card 8: 75 rigid-fit partials, three taken, all wrong).
// Only where the order says the two pieces are sewn (an operation with slack) and the pool offers no
// acceptable pair between them — a partial is never a second seam between two pieces the pool joins.

import { candId, cornerTurn, type CandidatePool, type PoolCand, type Run } from '../geometry/match';
import { SKELETON, type Edge, type PieceGeom, type SeamCandidate } from '../types';
import { roleOf } from './costs';
import type { Operation } from './model';

/** The short edge is at least this share of the long one, and at least this long. */
const PARTIAL_MIN_RATIO = 0.6;
const PARTIAL_MIN_MM = 200;
/** The aligned end trues up within this (deg): the hem (the neckline) runs on across the seam. */
const PARTIAL_END_DEG = 30;
/** A notch of the short edge sits on one of the long edge within this (mm), read from the aligned end. */
const PARTIAL_NOTCH_MM = 5;
/** A partial costs this against a pair of the same evidence (as A4). */
const PARTIAL_PENALTY = 0.05;

export type Partial = {
  u: Edge;
  v: Edge;
  score: number;
  /** Which corners coincide: u's start with v's end ('us') or u's end with v's start ('ue'). */
  aligned: 'us' | 'ue';
  endErrDeg: number;
  notchScore: 0.7 | 1;
  notchesMatched: number;
  rmsMm: number;
};

/**
 * A notch-anchored partial of two edges, or null. Face-up pieces walk a shared seam oppositely: u
 * from its start meets v from its end ('us'), or u from its end meets v from its start ('ue').
 */
export function notchedPartial(u: Edge, v: Edge, pu: PieceGeom, pv: PieceGeom): Partial | null {
  const [short, long] = u.lenMm <= v.lenMm ? [u, v] : [v, u];
  if (short.lenMm < PARTIAL_MIN_MM) return null;
  const ratio = short.lenMm / long.lenMm;
  if (ratio < PARTIAL_MIN_RATIO || 1 - ratio <= SKELETON.lenRel) return null;
  if (pu.hand && pv.hand && pu.hand !== pv.hand) return null;
  if (short.notchesMm.length === 0 || long.notchesMm.length === 0) return null;
  const span = short.lenMm;
  let best: Partial | null = null;
  for (const aligned of ['us', 'ue'] as const) {
    const uFromEnd = aligned === 'ue';
    const vFromEnd = aligned === 'us';
    const tu = cornerTurn(pu, uFromEnd ? u.e : u.s);
    const tv = cornerTurn(pv, vFromEnd ? v.e : v.s);
    const endErrDeg = Math.abs(180 - tu - tv);
    if (endErrDeg > PARTIAL_END_DEG) continue;
    const fromAligned = (e: Edge, fromEnd: boolean) =>
      fromEnd ? e.notchesMm.map((d) => e.lenMm - d).reverse() : e.notchesMm;
    const ns = fromAligned(short, short === u ? uFromEnd : vFromEnd);
    const nl = fromAligned(long, long === u ? uFromEnd : vFromEnd);
    // The long edge's notches within the sewn stretch (its end window excepted).
    const within = nl.filter((d) => d <= span - SKELETON.cornerWinMm);
    const hit = (d: number, list: number[]) =>
      list.some((x) => Math.abs(x - d) <= PARTIAL_NOTCH_MM);
    const matched = ns.filter((d) => hit(d, within)).length;
    if (matched === 0) continue;
    // Every notch of the short edge met, and none of the long edge's within the stretch unmet: the
    // two edges tell the same story from this end. One side's notches met only: weaker.
    const all = matched === ns.length && within.every((d) => hit(d, ns));
    if (!all && matched < ns.length) continue;
    const notchScore: 0.7 | 1 = all ? 1 : 0.7;
    const trued = Math.max(0, 1 - endErrDeg / 45);
    const score = 0.45 * 1 + 0.45 * notchScore + 0.1 * trued - PARTIAL_PENALTY;
    if (!best || score > best.score)
      best = { u, v, score, aligned, endErrDeg, notchScore, notchesMatched: matched, rmsMm: 0 };
  }
  return best;
}

/**
 * The sewn stretch of each side of a partial read here (mm along the edge from its start): the whole
 * short edge, and of the long edge the `span` from its aligned end — the rest of the long edge is
 * free (an armhole runs over the free top of a side-back seam). Keyed by the pool candidate the
 * solver's variable carries; `withRange` puts it on the SeamCandidate made from it.
 */
const rangeOf = new WeakMap<PoolCand, NonNullable<SeamCandidate['range']>>();
export const withRange = (c: SeamCandidate, cand: PoolCand): SeamCandidate => {
  const r = rangeOf.get(cand);
  return r ? { ...c, range: r } : c;
};

/** A partial as the pool would hold it: `u` is the side whose START sits on `v`'s END (A4's `a`). */
function partialCand(p: Partial, runOf: Map<string, Run>, label: string): PoolCand | null {
  const [a, b] = p.aligned === 'us' ? [p.u, p.v] : [p.v, p.u];
  const u = runOf.get(a.id);
  const v = runOf.get(b.id);
  if (!u || !v) return null;
  const [s, l] = p.u.lenMm <= p.v.lenMm ? [p.u, p.v] : [p.v, p.u];
  const dLenMm = l.lenMm - s.lenMm;
  const relLen = dLenMm / l.lenMm;
  const hu = u.piece.hand;
  const hv = v.piece.hand;
  // a's START sits on b's END: a is sewn over [0, span], b over its last `span`.
  const span = s.lenMm;
  const range: NonNullable<SeamCandidate['range']> = {
    a: [0, span],
    b: [b.lenMm - span, b.lenMm],
  };
  const cand: PoolCand = {
    u,
    v,
    score: p.score,
    kind: 'partial',
    regular: true,
    parts: {
      lenScore: s.lenMm / l.lenMm,
      notch: p.notchScore ?? 0.5,
      shapeRmsMm: p.rmsMm,
      endsErrDeg: p.endErrDeg,
      meeting: 'join',
    },
    evidence: {
      dLenMm,
      relLen,
      notchScore: p.notchScore,
      curvature: 'flat',
      hand: hu && hv ? (hu === hv ? 'same' : 'cross') : 'neutral',
      twin: 'none',
      self: false,
      rule: `partial: ${Math.round(s.lenMm)} mm onto ${Math.round(l.lenMm)} mm from the end that trues up (${p.endErrDeg.toFixed(0)}°), ${p.notchesMatched} notch${p.notchesMatched > 1 ? 'es' : ''} agree from that end — the order sews the two in «${label}»`,
      aLenMm: u.lenMm,
      bLenMm: v.lenMm,
      notchesMatched: p.notchesMatched,
    },
  };
  rangeOf.set(cand, range);
  return cand;
}

/**
 * Notch-anchored partial candidates between the inputs of every operation with slack, for piece
 * pairs the pool cannot pair (no non-dropped regular pair at or above the accept line). Sorted best
 * first, ties by id (deterministic), at most one per edge pair.
 */
export function partialCandidates(
  P: CandidatePool,
  ops: readonly Operation[],
  /** Pieces never sewn as shell (hardware, interfacing) and surface pieces (pockets, loops). */
  skip: ReadonlySet<string>,
): PoolCand[] {
  const geom = new Map(P.pieces.map((p) => [p.pieceKey, p]));
  const runOf = new Map<string, Run>();
  for (const r of P.runs) if (!r.chain) runOf.set(r.id, r);
  // Piece pairs the pool pairs acceptably (either way round).
  const paired = new Set<string>();
  for (const c of P.all) {
    if (c.dropped || !c.regular || c.kind !== 'edge' || c.score < SKELETON.accept) continue;
    paired.add(`${c.u.piece.pieceKey}\u0000${c.v.piece.pieceKey}`);
    paired.add(`${c.v.piece.pieceKey}\u0000${c.u.piece.pieceKey}`);
  }
  const sewable = (p: PieceGeom | undefined): p is PieceGeom =>
    !!p && !skip.has(p.pieceKey) && p.cloth !== 'interfacing' && roleOf(p) !== 'pocket';
  const seen = new Set<string>();
  const out: PoolCand[] = [];
  for (const op of ops) {
    if (op.slack <= 0) continue;
    for (let i = 0; i < op.inputs.length; i++)
      for (let j = i + 1; j < op.inputs.length; j++)
        for (const ka of op.inputs[i])
          for (const kb of op.inputs[j]) {
            const pa = geom.get(ka);
            const pb = geom.get(kb);
            if (!sewable(pa) || !sewable(pb)) continue;
            if (paired.has(`${ka}\u0000${kb}`)) continue;
            // Mirror twins meet on their centre line as a pair, never as a partial.
            if (pa.twinOf.some((t) => t.key === kb)) continue;
            for (const ea of pa.edges)
              for (const eb of pb.edges) {
                const key = [ea.id, eb.id].sort().join('~');
                if (seen.has(key)) continue;
                const p = notchedPartial(ea, eb, pa, pb);
                if (!p || p.score < SKELETON.accept) continue;
                const c = partialCand(p, runOf, op.label);
                if (!c) continue;
                seen.add(key);
                out.push(c);
              }
          }
  }
  out.sort((a, b) => b.score - a.score || (candId(a) < candId(b) ? -1 : 1));
  return out;
}
