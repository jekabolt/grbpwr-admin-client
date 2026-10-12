// Variables: the pool's candidates, each given to the ONE operation of the order in which its two
// pieces are distinct inputs (the operation that sews them together); a piece onto itself (a tube)
// goes to the first operation that holds the piece. A pair the order never sews together (two
// pieces of one unit, a lining piece and a shell piece outside the «lining onto shell» step) is no
// variable at all — that is the order's word. Phase 2 reads the pool's pair candidates (an edge or a
// two-edge chain on each side); the composite / partial / sandwich candidates of phase 3 land here.

import { candId, type CandidatePool, type PoolCand } from '../geometry/match';
import { SKELETON, type EdgeId } from '../types';
import { benefitOf, FORCE_FLOOR, roleVeto } from './costs';
import type { Operation, Variable } from './model';
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
    ply: c.evidence.twin === 'identical',
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
  return v;
}

export function variablesOf(
  P: CandidatePool,
  ops: readonly Operation[],
  board: Board,
  /** Candidates the forced list already stands for (a person's confirmed seam). */
  forcedSame: ReadonlySet<PoolCand>,
  /** Pieces never sewn as shell (hardware, interfacing). */
  skip: ReadonlySet<string>,
): Variable[] {
  const opOf = operationOf(ops);
  const out: Variable[] = [];
  for (const c of P.all) {
    if (c.dropped || c.kind === 'closure-not-seam' || forcedSame.has(c)) continue;
    const pa = c.u.piece.pieceKey;
    const pb = c.v.piece.pieceKey;
    if (skip.has(pa) || skip.has(pb)) continue;
    // (a pocket piece onto a panel is allowed as EVIDENCE — the bag's edge caught in a seam — but
    // never forced: operations.ts gives such a step no slack)
    if (pa !== pb && roleVeto(c.u.piece, c.v.piece)) continue;
    const v = variableOf(c, ops, board, opOf);
    if (!v) continue;
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
