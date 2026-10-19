// OPERATION-DRIVEN GLOBAL SEAM ASSIGNMENT — entry (05-ASSIGNMENT-DESIGN.md, phases 1–2).
//
//   assignSeams(pool, input)  the pool of geometry/match.ts assigned per operation of the
//                             technologist's order by an exact search under hard constraints →
//                             the same SeamGraph the greedy returns, plus `assignment` in words
//   assignmentMode()          VITE_SEAM_ASSIGNMENT = greedy | shadow | global (default greedy)
//
// Flag semantics: greedy = the engine as shipped; shadow = the greedy's graph is used, the global
// solver's rides along on `graph.shadow` for comparison (yarn seams:score scores both); global =
// the solver's graph is the one drawn.

import {
  edgeIdsOf,
  isTubePair,
  toCandidate,
  type CandidatePool,
  type PoolCand,
} from '../geometry/match';
import type {
  SeamAssignmentInput,
  SeamAssignmentSummary,
  SeamCandidate,
  SeamGraph,
} from '../types';
import { liningByName } from '../names';
import { graphOf, sameAs } from './adapt';
import { operationOf, variableOf, variablesOf } from './candidates';
import { compositeSeams } from './composites';
import { roleOf } from './costs';
import { MARGIN_BUDGET, NODE_BUDGET, type Variable } from './model';
import { buildOperations, surfacePieces } from './operations';
import { partialCandidates, withRange } from './partials';
import { Board, solveCard } from './solve';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * VITE_SEAM_ASSIGNMENT. Default `global` since 12.10 (yarn seams:score on the 14-card corpus with
 * the cards' orders: doll precision 85 → 87 %, recall 43 → 44 %, no garment card worse by > 2 pp,
 * p95 191 ms). The solver is measured WITH an order: a card whose steps are not written yet reads
 * no better than the greedy without one (doll 86 / 41), so the callers hand the solver nothing when
 * there are no joins (`inputFor`) and the greedy runs as before. `greedy` switches it off.
 */
export function assignmentMode(): SeamAssignmentInput['mode'] {
  // import.meta.env exists under Vite; a node bundle (the probes) reads the process env.
  const env =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
    (typeof process !== 'undefined' ? process.env : undefined);
  const v = env?.VITE_SEAM_ASSIGNMENT;
  return v === 'greedy' || v === 'shadow' ? v : 'global';
}

/**
 * The assignment input a caller hands readSeamGraph / the doll for a card: undefined (the greedy)
 * when the flag says so or when the card has no order to assign by — `global` is measured only
 * with the technologist's steps (`shadow` compares on every card).
 */
export function inputFor(
  joins: SeamAssignmentInput['joins'],
  hardware?: SeamAssignmentInput['hardware'],
): SeamAssignmentInput | undefined {
  const mode = assignmentMode();
  if (mode === 'greedy') return undefined;
  if (mode === 'global' && !joins?.length) return undefined;
  return { mode, joins: joins ?? [], ...(hardware?.length ? { hardware } : {}) };
}

export function assignSeams(P: CandidatePool, input: SeamAssignmentInput): SeamGraph {
  const t0 = now();
  const warnings = [...P.warnings];
  const conflicts: string[] = [];
  const nodeBudget = input.nodeBudget ?? NODE_BUDGET;
  const marginBudget = input.marginBudget ?? MARGIN_BUDGET;

  // Operations.
  const skip = new Set<string>();
  for (const h of input.hardware ?? []) for (const k of h.pieces) skip.add(k);
  for (const p of P.facts.pieces) if (p.cloth === 'interfacing') skip.add(p.pieceKey);
  const surface = surfacePieces(P.pieces);
  const lining = new Set(
    P.facts.pieces
      .filter((p) => p.cloth === 'lining' || (!p.cloth && liningByName(p.name)))
      .map((p) => p.pieceKey),
  );
  // Pieces the drawing reads as a tube (a self pair along two equal lengthwise edges — a sleeve's
  // underarm), for inputs whose names read no role.
  const tubeLike = new Set<string>();
  for (const c of P.all)
    if (c.evidence.self && c.kind === 'edge' && isTubePair(c.u, c.v))
      tubeLike.add(c.u.piece.pieceKey);
  const { ops, words } = buildOperations(P.pieces, input.joins, skip, surface, lining, tubeLike);
  warnings.push(...words);
  const board = new Board(P, ops);

  // Stored decisions first: a confirmed seam never competes, a stored closure blocks its edges. A
  // confirmed seam the pool scored too is a FIXED variable: it joins its operation's inputs, sets
  // the parity and the ply mates like any seam (never searched over); one the pool did not score (a
  // stored composite / partial) occupies its edges only.
  const decisions = P.decisions;
  const idsOf = (c: SeamCandidate, s: 'a' | 'b') =>
    s === 'a' ? c.aParts ?? edgeIdsOf(c.a) : c.bParts ?? edgeIdsOf(c.b);
  const forcedIn = (decisions?.forced ?? []).filter((c) => c.kind !== 'surface');
  const decidedClosures = decisions?.closures ?? [];
  const forcedSame = new Set<PoolCand>();
  const forced: SeamCandidate[] = [];
  const fixed: Variable[] = [];
  const opOf = operationOf(ops);
  for (const c of [...forcedIn, ...decidedClosures]) {
    const A = idsOf(c, 'a');
    const B = idsOf(c, 'b');
    const same = c.kind === 'closure-not-seam' ? undefined : sameAs(P, c);
    const v = same ? variableOf(same, ops, board, opOf) : null;
    const taken = [...A, ...B].filter((e) => (board.uses.get(e) ?? []).length);
    if (taken.length || (v && !board.feasible(v)))
      conflicts.push(
        `${c.kind === 'closure-not-seam' ? 'stored closure' : 'confirmed seam'} ${c.a} ↔ ${c.b}: ${
          taken.length
            ? `${taken.join(', ')} already sewn by another stored decision`
            : "contradicts another stored decision (left against right, or the piece's other side)"
        } — both kept, one of them cannot close`,
      );
    if (v) {
      board.apply(v);
      fixed.push(v);
    } else {
      board.occupy(A, B);
      board.occupy(B, A);
    }
    if (c.kind === 'closure-not-seam') continue;
    if (same) forcedSame.add(same);
    forced.push(
      same && !c.aParts && !c.bParts
        ? { ...c, evidence: { ...same.evidence, rule: c.evidence.rule } }
        : c,
    );
  }
  for (const c of decidedClosures)
    warnings.push(`${c.a} ↔ ${c.b} is a closure, not a seam (${c.evidence.rule ?? 'stored'})`);

  // The engine's closures take their edges out of play before any operation — ONE per piece pair:
  // two mirror plackets offer a closure between each of their long edges, and the second would
  // take the edge the placket is sewn to the front by (12.10 corpus, card 6).
  const engineClosures: PoolCand[] = [];
  const closedPairs = new Set<string>();
  for (const c of P.all) {
    if (c.kind !== 'closure-not-seam' || c.dropped) continue;
    const ea = c.u.edges.map((e) => e.id);
    const eb = c.v.edges.map((e) => e.id);
    if ([...ea, ...eb].some((e) => (board.uses.get(e) ?? []).length)) continue;
    const pair = [c.u.piece.pieceKey, c.v.piece.pieceKey].sort().join('\u0000');
    if (closedPairs.has(pair)) continue;
    // Two separate placket pieces: the front opening is their OVERLAP, not an edge of either — each
    // placket is sewn to its front by one long edge, the other is its fold / finished edge. An edge
    // closure between them would take a sewing edge out of play (card 6: PLCK_L / PLCK_R).
    if (roleOf(c.u.piece) === 'placket' && roleOf(c.v.piece) === 'placket') continue;
    closedPairs.add(pair);
    board.occupy(ea, eb);
    board.occupy(eb, ea);
    engineClosures.push(c);
    warnings.push(`${c.u.id} ↔ ${c.v.id} is a closure, not a seam (${c.evidence.rule})`);
  }

  // Partial seams the pair pool cannot see (a short edge onto part of a long one), where the order
  // sews two pieces no acceptable pair joins.
  const partials = partialCandidates(P, ops, new Set([...skip, ...surface]));
  const vars = variablesOf(P, ops, board, forcedSame, skip, partials, surface, lining);
  const sol = solveCard(vars, ops, board, nodeBudget, marginBudget, fixed, now);
  // ASSIGN_DEBUG=<edge name substring> (node probes): every pool candidate touching it, its fate
  // and the board's answer after the solve.
  const dbg = typeof process !== 'undefined' ? process.env?.ASSIGN_DEBUG : undefined;
  if (dbg) {
    const byId = new Map(vars.map((v) => [v.id, v]));
    const chosenSet = new Set(sol.chosen);
    const nm = (id: string) => {
      const at = id.lastIndexOf('#');
      const g = P.pieces.find((p) => p.pieceKey === id.slice(0, at));
      return `${g?.name ?? id.slice(0, at)}${id.slice(at)}`;
    };
    for (const c of [...P.all, ...partials]) {
      if (!nm(c.u.id).includes(dbg) && !nm(c.v.id).includes(dbg)) continue;
      const v = byId.get([c.u.id, c.v.id].sort().join('~'));
      warnings.push(
        `debug ${nm(c.u.id)} ↔ ${nm(c.v.id)} score ${c.score.toFixed(3)} kind ${c.kind}${c.dropped ? ` DROPPED: ${c.dropped}` : ''}${v ? ` → variable op ${v.op} benefit ${v.benefit} ${chosenSet.has(v) ? 'CHOSEN' : `not chosen (now free ${board.free(v)} feasible ${board.feasible(v)})`}` : ' → no variable'}`,
      );
    }
  }
  // Phase 3: composite seams for the operations the pairs left apart (and tubes onto the body),
  // from each input's glued boundary — in the order's sequence, onto the same board.
  const composites = compositeSeams(
    P,
    ops,
    sol.perOp,
    [
      ...forced,
      ...decidedClosures,
      ...sol.chosen.map((v) => withRange(toCandidate(v.cand), v.cand)),
      ...engineClosures.map((c) => toCandidate(c)),
    ],
    board,
    new Set([...skip, ...surface]),
    lining,
  );
  warnings.push(...composites.words);
  const closedByComposite = new Set(
    composites.seams.map((c) => c.operationId).filter((id) => id && composites.joinedOps.has(id)),
  );
  for (const s of sol.perOp) if (!closedByComposite.has(s.op.id)) warnings.push(...s.words);

  const summary: SeamAssignmentSummary = {
    operations: sol.perOp.map((s) => ({
      id: s.op.id,
      label: s.op.label,
      inputs: s.op.inputs.length,
      seams: s.chosen.length + composites.seams.filter((c) => c.operationId === s.op.id).length,
      connected: s.components === 1 || closedByComposite.has(s.op.id),
      exact: sol.exact,
      nodes: sol.nodes,
      ms: Math.round(sol.ms * 10) / 10,
    })),
    unconnected: sol.perOp
      .filter((s) => s.op.slack > 0 && s.components > 1 && !closedByComposite.has(s.op.id))
      .map((s) => s.op.label),
    conflicts,
    words: [
      ...words,
      `${vars.length} candidate seams (${partials.length} partial) over ${ops.length} operations · ${sol.nodes} nodes${sol.exact ? '' : ' (budget hit — the best found stands)'} · ${Math.round(sol.ms)} ms · ${composites.seams.length} composite`,
      ...composites.words,
      ...sol.perOp.flatMap((s) => (closedByComposite.has(s.op.id) ? [] : s.words)),
    ],
    ms: Math.round((now() - t0) * 10) / 10,
  };
  warnings.push(...conflicts);
  return graphOf(
    P,
    sol,
    forced,
    forcedSame,
    engineClosures,
    warnings,
    summary,
    (e) => board.plyMateOf(e),
    composites.seams,
  );
}

export type { SeamAssignmentInput };
