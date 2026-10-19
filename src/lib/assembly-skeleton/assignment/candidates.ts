// Variables: the pool's candidates, each given to the ONE operation of the order in which its two
// pieces are distinct inputs (the operation that sews them together); a piece onto itself (a tube)
// goes to the first operation that holds the piece. A pair the order never sews together (two
// pieces of one unit, a lining piece and a shell piece outside the «lining onto shell» step) is no
// variable at all — that is the order's word. Phase 2 reads the pool's pair candidates (an edge or a
// two-edge chain on each side); the composite / partial / sandwich candidates of phase 3 land here.

import { candId, isTubePair, type CandidatePool, type PoolCand } from '../geometry/match';
import { SKELETON, type EdgeId } from '../types';
import { benefitOf, FORCE_FLOOR, roleVeto } from './costs';
import {
  TUBE_CLASSES,
  TUBE_PAIR_PENALTY,
  TUBE_SELF_PENALTY,
  type Operation,
  type Variable,
} from './model';
import { aspectOf, STRIP_ASPECT } from './composites';
import type { Board } from './solve';

const pkOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));

/** The operation that sews two pieces (the first in which they are distinct inputs), by piece. */
export function operationOf(ops: readonly Operation[]) {
  const inputOf = ops.map((op) => {
    const m = new Map<string, number>();
    op.inputs.forEach((X, i) => X.forEach((k) => m.set(k, i)));
    return m;
  });
  return (pa: string, pb: string): { op: number; ia: number; ib: number } | null => {
    for (let o = 0; o < ops.length; o++) {
      const ia = inputOf[o].get(pa);
      const ib = inputOf[o].get(pb);
      if (ia === undefined || ib === undefined) continue;
      if (pa === pb) return { op: o, ia, ib };
      if (ia !== ib) return { op: o, ia, ib };
    }
    return null;
  };
}

/** A pool candidate as a variable of its operation, annotated by the board; null when no operation sews the pair. */
export function variableOf(
  c: PoolCand,
  ops: readonly Operation[],
  board: Board,
  opOf: ReturnType<typeof operationOf>,
): Variable | null {
  const pa = c.u.piece.pieceKey;
  const pb = c.v.piece.pieceKey;
  const at = opOf(pa, pb);
  if (!at) return null;
  const self = pa === pb;
  const v: Variable = {
    id: candId(c),
    cand: c,
    ea: c.u.edges.map((e) => e.id),
    eb: c.v.edges.map((e) => e.id),
    pa,
    pb,
    benefit: benefitOf(c),
    // (identical twins the board did not pair as plies — two identical sleeves — are two pieces)
    ply: c.evidence.twin === 'identical' && board.isPly(pa) && board.isPly(pb),
    self,
    mirror: c.evidence.twin === 'mirror',
    op: at.op,
    ia: at.ia,
    ib: at.ib,
    occA: [],
    occB: [],
    links: [],
  };
  // Static facts (ply mates, parity links) once; the face-up layout's broken rules cost.
  v.benefit -= board.annotate(v);
  // A third piece onto a ply pair: both plies take it; reported on the first-named ply.
  if (!v.ply && !self && board.isSecondPly(pa) !== board.isSecondPly(pb)) v.benefit -= 1;
  // A pair between a tube input and another input of its operation: the tube meets the body along
  // a composite edge — a single pair there is a coincidence more often than a seam (model.ts).
  const classes = ops[at.op].classes;
  if (!self && TUBE_CLASSES.has(classes[at.ia]) !== TUBE_CLASSES.has(classes[at.ib]))
    v.benefit -= TUBE_PAIR_PENALTY;
  return v;
}

/**
 * The pool drops a self seam that loses to a regular candidate on one of its edges (match.ts
 * `weak`) and prices every fold alike. A TUBE seam of a piece in a tube input (a sleeve's underarm)
 * is re-read for the solver: kept as a variable with the tube's own self penalty, so it competes
 * with the coincidental pair on its edge instead of yielding to it. Returns the re-priced copy
 * (the pool itself is not touched — the greedy reads it too), or null.
 */
export function tubeSelfOf(c: PoolCand, ops: readonly Operation[]): PoolCand | null {
  if (!c.evidence.self || c.kind !== 'edge') return null;
  if (c.dropped && !/self seam loses to a regular candidate/.test(c.dropped)) return null;
  if (!isTubePair(c.u, c.v)) return null;
  // Only a SLEEVE input: a collar's or a cuff's two ends are a tube pair by the drawing too, and
  // they are never sewn to each other (12.10 corpus: three collars closed into rings).
  const k = c.u.piece.pieceKey;
  const tube = ops.some((op) =>
    op.inputs.some((X, i) => X.includes(k) && op.classes[i] === 'sleeve'),
  );
  if (!tube) return null;
  const score = c.score + SKELETON.selfPenalty - TUBE_SELF_PENALTY;
  return {
    ...c,
    score,
    dropped: undefined,
    evidence: {
      ...c.evidence,
      rule: `tube seam: the piece's two lengthwise edges, equal, on opposite sides (a sleeve's underarm) — a tube onto the body is sewn to itself first${c.dropped ? ' (the pool had it losing to a pair on this edge)' : ''}`,
    },
  };
}

export function variablesOf(
  P: CandidatePool,
  ops: readonly Operation[],
  board: Board,
  /** Candidates the forced list already stands for (a person's confirmed seam). */
  forcedSame: ReadonlySet<PoolCand>,
  /** Pieces never sewn as shell (hardware, interfacing). */
  skip: ReadonlySet<string>,
  /** Candidates read for the solver alone (partials.ts), after the pool's. */
  extra: readonly PoolCand[] = [],
  /** Surface pieces (pockets, loops: operations.ts surfacePieces). */
  surface: ReadonlySet<string> = new Set(),
  /** Lining pieces (by cloth, else by name — index.ts). */
  lining: ReadonlySet<string> = new Set(),
): Variable[] {
  const opOf = operationOf(ops);
  const out: Variable[] = [];
  // An input of more than one piece: an assembled unit.
  const unit = ops.map((op) => op.inputs.map((X) => X.length >= 2));
  for (const c0 of [...P.all, ...extra]) {
    if (c0.kind === 'closure-not-seam' || forcedSame.has(c0)) continue;
    const tube = tubeSelfOf(c0, ops);
    if (c0.dropped && !tube) continue;
    const c = tube ?? c0;
    const pa = c.u.piece.pieceKey;
    const pb = c.v.piece.pieceKey;
    if (skip.has(pa) || skip.has(pb)) continue;
    // A surface piece (a pocket, a loop) lies on a panel's FACE: an edge pair between it and a panel
    // is a coincidence that takes the panel's edge away from its real seam (12.10 corpus, card 6:
    // the fronts' neck edges 105 went to the chest pockets' 105, and the neckline was gone). Two
    // surface pieces (a bag's halves) are sewn edge to edge.
    if (pa !== pb && surface.has(pa) !== surface.has(pb)) continue;
    if (pa !== pb && roleVeto(c.u.piece, c.v.piece)) continue;
    const v = variableOf(c, ops, board, opOf);
    if (!v) continue;
    // A lining piece onto a shell piece where the order joins two assembled UNITS (the bagged body
    // lining onto the assembled shell): the lining is traced from the shell, so its edges equal the
    // shell's everywhere, and the two layers meet along facings and hems — not along the shell's
    // construction edges (12.10 corpus, card 8: the side panel's armhole 142 onto its lining's
    // 142, the cap onto the lining cap; the armholes were then held and the sleeves never set). A
    // facing onto its single piece (a waistband's) stays; plies (identical twins) stay.
    if (
      !v.self &&
      c.evidence.twin !== 'identical' &&
      lining.has(pa) !== lining.has(pb) &&
      unit[v.op][v.ia] &&
      unit[v.op][v.ib] &&
      // (a facing — a strip piece — is where the lining meets the shell: kept)
      aspectOf(c.u.piece) < STRIP_ASPECT &&
      aspectOf(c.v.piece) < STRIP_ASPECT
    )
      continue;
    if (tube) v.origin = c0;
    const floor = ops[v.op].slack > 0 ? FORCE_FLOOR : SKELETON.accept;
    if (c.score < floor - 1e-9) continue;
    if (!board.free(v)) continue;
    out.push(v);
  }
  // Best first, ties by id: the search order and the greedy incumbent are deterministic.
  out.sort((x, y) => y.benefit - x.benefit || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return out;
}

export { pkOf };
