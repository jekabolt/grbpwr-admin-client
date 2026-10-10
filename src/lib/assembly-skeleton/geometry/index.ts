// Lane A — the seam graph: PieceDTO[] + card facts → which edges are sewn to which.
//
// buildSeamGraph = A1 segmentPiece → A2 twins → A3 matchSeams. Reading the result:
//   chosen   — seams (kind 'edge'); an id `P#3+4` is a chain of two neighbouring edges
//              (edgeIdsOf splits it);
//   rejected — closures (kind 'closure-not-seam': equal straight centre edges that are a zip /
//              button front, never a seam) first, then candidates not taken, best first;
//   components — pieces joined by chosen seams (closures do not join).
// A4 (composite second pass over lane B's units) plugs in through runsOf / scoreRuns.

import type { SeamGraph, SkeletonFacts } from '../types';
import { ALL_RULES, matchSeams, type MatchRules } from './match';
import { segmentPiece } from './segment';
import { twins } from './twins';

export function buildSeamGraph(facts: SkeletonFacts, rules: MatchRules = ALL_RULES): SeamGraph {
  return matchSeams(twins(facts.pieces.map(segmentPiece)), facts, rules);
}

export {
  ALL_RULES,
  PROBE_RULES,
  edgeIdsOf,
  matchSeams,
  runsOf,
  scoreRuns,
  type MatchRules,
  type Run,
  type ScoreParts,
} from './match';
export { drillPoints, seamLoopOf, seamPieceOf, segmentPiece } from './segment';
export { handOf, handStem, shapeRelation, twinKind, twins, unprovenCopies } from './twins';
export { boundaryRuns, compositeSeams, type CompositeOptions } from './composite';
