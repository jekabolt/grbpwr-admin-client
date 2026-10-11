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

import { edgeIdsOf, type CandidatePool, type PoolCand } from '../geometry/match';
import type {
  SeamAssignmentInput,
  SeamAssignmentSummary,
  SeamCandidate,
  SeamGraph,
} from '../types';
import { graphOf, sameAs } from './adapt';
import { variablesOf } from './candidates';
import { MS_BUDGET, NODE_BUDGET } from './model';
import { buildOperations, surfacePieces } from './operations';
import { Board, solveCard } from './solve';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function assignmentMode(): SeamAssignmentInput['mode'] {
  // import.meta.env exists under Vite; a node bundle (the probes) reads the process env.
  const env =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
    (typeof process !== 'undefined' ? process.env : undefined);
  const v = env?.VITE_SEAM_ASSIGNMENT;
  return v === 'global' || v === 'shadow' ? v : 'greedy';
}

export function assignSeams(P: CandidatePool, input: SeamAssignmentInput): SeamGraph {
  const t0 = now();
  const warnings = [...P.warnings];
  const conflicts: string[] = [];
  const nodeBudget = input.nodeBudget ?? NODE_BUDGET;
  const msBudget = input.msBudget ?? MS_BUDGET;

  // Operations.
  const skip = new Set<string>();
  for (const h of input.hardware ?? []) for (const k of h.pieces) skip.add(k);
  for (const p of P.facts.pieces) if (p.cloth === 'interfacing') skip.add(p.pieceKey);
  const surface = surfacePieces(P.pieces);
  const { ops, words } = buildOperations(P.pieces, input.joins, skip, surface);
  warnings.push(...words);
  const board = new Board(P, ops);

  // Stored decisions first: a confirmed seam never competes, a stored closure blocks its edges.
  const decisions = P.decisions;
  const idsOf = (c: SeamCandidate, s: 'a' | 'b') =>
    s === 'a' ? c.aParts ?? edgeIdsOf(c.a) : c.bParts ?? edgeIdsOf(c.b);
  const forcedIn = (decisions?.forced ?? []).filter((c) => c.kind !== 'surface');
  const decidedClosures = decisions?.closures ?? [];
  const forcedSame = new Set<PoolCand>();
  const forced: SeamCandidate[] = [];
  for (const c of [...forcedIn, ...decidedClosures]) {
    const A = idsOf(c, 'a');
    const B = idsOf(c, 'b');
    const taken = [...A, ...B].filter((e) => (board.uses.get(e) ?? []).length);
    if (taken.length)
      conflicts.push(
        `${c.kind === 'closure-not-seam' ? 'stored closure' : 'confirmed seam'} ${c.a} ↔ ${c.b}: ${taken.join(', ')} already sewn by another stored decision — both kept, one of them cannot close`,
      );
    board.occupy(A, B);
    board.occupy(B, A);
    if (c.kind === 'closure-not-seam') continue;
    const same = sameAs(P, c);
    if (same) forcedSame.add(same);
    forced.push(
      same && !c.aParts && !c.bParts
        ? { ...c, evidence: { ...same.evidence, rule: c.evidence.rule } }
        : c,
    );
  }
  for (const c of decidedClosures)
    warnings.push(`${c.a} ↔ ${c.b} is a closure, not a seam (${c.evidence.rule ?? 'stored'})`);

  // The engine's closures take their edges out of play before any operation.
  const engineClosures: PoolCand[] = [];
  for (const c of P.all) {
    if (c.kind !== 'closure-not-seam' || c.dropped) continue;
    const ea = c.u.edges.map((e) => e.id);
    const eb = c.v.edges.map((e) => e.id);
    if ([...ea, ...eb].some((e) => (board.uses.get(e) ?? []).length)) continue;
    board.occupy(ea, eb);
    board.occupy(eb, ea);
    engineClosures.push(c);
    warnings.push(`${c.u.id} ↔ ${c.v.id} is a closure, not a seam (${c.evidence.rule})`);
  }

  const vars = variablesOf(P, ops, board, forcedSame, skip, surface);
  // ASSIGN_DEBUG=<edge id substring> (node probes): every pool candidate touching it, and its fate.
  const dbg = typeof process !== 'undefined' ? process.env?.ASSIGN_DEBUG : undefined;
  if (dbg) {
    const byId = new Map(vars.map((v) => [v.id, v]));
    const nm = (id: string) => {
      const at = id.lastIndexOf('#');
      const g = P.pieces.find((p) => p.pieceKey === id.slice(0, at));
      return `${g?.name ?? id.slice(0, at)}${id.slice(at)}`;
    };
    for (const c of P.all) {
      if (!nm(c.u.id).includes(dbg) && !nm(c.v.id).includes(dbg)) continue;
      const v = byId.get([c.u.id, c.v.id].sort().join('~'));
      warnings.push(
        `debug ${nm(c.u.id)} ↔ ${nm(c.v.id)} score ${c.score.toFixed(3)} kind ${c.kind}${c.dropped ? ` DROPPED: ${c.dropped}` : ''}${v ? ` → variable op ${v.op} benefit ${v.benefit} free ${board.free(v)} feasible ${board.feasible(v)}` : ' → no variable'}`,
      );
    }
  }
  const sol = solveCard(vars, ops, board, nodeBudget, () => now() - t0 < msBudget, now);
  for (const s of sol.perOp) warnings.push(...s.words);

  const summary: SeamAssignmentSummary = {
    operations: sol.perOp.map((s) => ({
      id: s.op.id,
      label: s.op.label,
      inputs: s.op.inputs.length,
      seams: s.chosen.length,
      connected: s.components === 1,
      exact: sol.exact,
      nodes: sol.nodes,
      ms: Math.round(sol.ms * 10) / 10,
    })),
    unconnected: sol.perOp.filter((s) => s.op.slack > 0 && s.components > 1).map((s) => s.op.label),
    conflicts,
    words: [
      ...words,
      `${vars.length} candidate seams over ${ops.length} operations · ${sol.nodes} nodes${sol.exact ? '' : ' (budget hit — the best found stands)'} · ${Math.round(sol.ms)} ms`,
      ...sol.perOp.flatMap((s) => s.words),
    ],
    ms: Math.round((now() - t0) * 10) / 10,
  };
  warnings.push(...conflicts);
  return graphOf(P, sol, forced, forcedSame, engineClosures, warnings, summary);
}

export type { SeamAssignmentInput };
