// Lane A — the seam graph: PieceDTO[] + card facts → which edges are sewn to which.
//
// buildSeamGraph = A1 segmentPiece → A2 twins → A3 matchSeams. Reading the result:
//   chosen   — seams (kind 'edge'); an id `P#3+4` is a chain of two neighbouring edges
//              (edgeIdsOf splits it);
//   rejected — closures (kind 'closure-not-seam': equal straight centre edges that are a zip /
//              button front, never a seam) first, then candidates not taken, best first;
//   components — pieces joined by chosen seams (closures do not join).
// A4 (composite second pass over lane B's units) plugs in through runsOf / scoreRuns.

import { assignSeams } from '../assignment';
import type { SeamAssignmentInput, SeamDecisionsInput, SeamGraph, SkeletonFacts } from '../types';
import { ALL_RULES, candidatePool, greedyAssign, type MatchRules } from './match';
import { segmentPiece } from './segment';
import { twins } from './twins';

/**
 * A1 → A2 → A3. `assign` picks who assigns the pool's candidates to edges: the greedy (absent, or
 * mode 'greedy'), the operation-driven global solver over the technologist's order ('global'), or
 * the greedy with the solver's reading riding along on `graph.shadow` ('shadow').
 */
export function buildSeamGraph(
  facts: SkeletonFacts,
  rules: MatchRules = ALL_RULES,
  decisions?: SeamDecisionsInput,
  assign?: SeamAssignmentInput,
): SeamGraph {
  const pool = candidatePool(twins(facts.pieces.map(segmentPiece)), facts, rules, decisions);
  if (assign?.mode === 'global') return assignSeams(pool, assign);
  const graph = greedyAssign(pool);
  if (assign?.mode === 'shadow') {
    const g = assignSeams(pool, assign);
    return { ...graph, shadow: { chosen: g.chosen, assignment: g.assignment! } };
  }
  return graph;
}

export {
  ALL_RULES,
  PROBE_RULES,
  candidatePool,
  edgeIdsOf,
  greedyAssign,
  matchSeams,
  runsOf,
  scoreRuns,
  type CandidatePool,
  type MatchRules,
  type PoolCand,
  type Run,
  type ScoreParts,
} from './match';
export { drillPoints, seamLoopOf, seamPieceOf, segmentPiece } from './segment';
export { handOf, handStem, shapeRelation, twinKind, twins, unprovenCopies } from './twins';
export {
  boundaryRuns,
  compositeSeams,
  gluedRuns,
  type CompositeOptions,
  type GluedRun,
} from './composite';
export { crotchPair, legPanels, sameLeg, type LegPanel } from './legs';
export { orderUnits, type OrderJoin, type UnitsResult } from './units';
