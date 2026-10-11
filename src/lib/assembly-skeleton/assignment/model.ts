// OPERATION-DRIVEN GLOBAL SEAM ASSIGNMENT — the model (05-ASSIGNMENT-DESIGN.md).
//
// The greedy (geometry/match.ts greedyAssign) takes seams best first, one edge at a time, and
// patches what that gets wrong (one side of a symmetric piece, the ply sandwich, the trouser legs).
// Here the same candidate pool is assigned PER OPERATION of the technologist's order: each
// operation says which pieces are sewn together (its inputs), the solver chooses the set of
// candidate seams between distinct inputs that joins them with the most evidence, under hard
// constraints no single seam can see (an edge is sewn once, left never meets right, a handed
// piece sits on one side of a symmetric one). Nothing here reads a piece name for evidence; names
// only veto pairs that never meet (two sleeves) and tell a pocket from a panel.

import type { EdgeId, SeamAssignmentSummary, SeamCandidate } from '../types';
import type { PoolCand } from '../geometry/match';

/** One operation of the order as the solver sees it: its inputs as sets of shell piece keys. */
export type Operation = {
  /** `op:<i>` for the order's operations; `op:whole` (no order); `op:residual` (pieces left out). */
  id: string;
  label: string;
  index: number;
  /** Shell piece keys per input (pieces the order sews into this operation, by unit). */
  inputs: string[][];
  kind: 'order' | 'whole' | 'residual';
  /**
   * The order says these inputs ARE joined: the objective pays `slack` for every input left apart,
   * so a sub-accept seam that joins them is taken. 0 for the whole-card / residual operations and
   * for operations that lay a surface piece (a pocket) on a panel — those are not edge seams.
   */
  slack: number;
};

/** A candidate seam as a decision variable of one operation. */
export type Variable = {
  /** The pool candidate's identity (edge ids sorted). */
  id: string;
  cand: PoolCand;
  /** Edge ids of each run. */
  ea: EdgeId[];
  eb: EdgeId[];
  /** Piece keys of each run. */
  pa: string;
  pb: string;
  /** Integer benefit of taking it (costs.ts): > 0 above the accept line, < 0 below. */
  benefit: number;
  /** A seam between identical twins (plies): it does not use its edge up for a single-layer piece. */
  ply: boolean;
  /** A piece onto itself (a tube seam): joins no two inputs. */
  self: boolean;
  /** Mirror twins meeting on their centre line: parity-neutral (they are opposite sides by anchor). */
  mirror: boolean;
  /** Index of the operation this variable belongs to, and the input indices of its pieces there. */
  op: number;
  ia: number;
  ib: number;
  /** Filled by the board (static facts of the variable): the edges each side occupies (ply mates
   * included) and the parity links taking it asks for. */
  occA: EdgeId[];
  occB: EdgeId[];
  links: [string, string, number][];
};

/** The joint solve, read per operation. */
export type OpSolution = {
  op: Operation;
  chosen: Variable[];
  /** Components among the operation's inputs after its seams (1 = all joined). */
  components: number;
  words: string[];
};

/** The joint solve over every operation of the card. */
export type Solution = {
  chosen: Variable[];
  /** Σ benefit − Σ_op slack · (components − 1). */
  objective: number;
  nodes: number;
  /** The search finished within its node budget. */
  exact: boolean;
  ms: number;
  /** Per chosen variable: how much the objective drops when it is forbidden and the card re-solved. */
  margin: Map<Variable, number>;
  perOp: OpSolution[];
};

export type AssignmentResult = {
  chosen: SeamCandidate[];
  rejected: SeamCandidate[];
  components: string[][];
  warnings: string[];
  summary: SeamAssignmentSummary;
};

/**
 * Objective units: the slack paid per input of an operation left apart. Comparable to the evidence
 * of one seam (a notch band is 100 · 0.45 · 0.3 ≈ 14), never dominating it: the order says these
 * pieces are joined, but a wrong edge pair is worse than an operation left to the composite pass
 * and the doll's own proposals (12.10 corpus: card 49's yoke took the back's side-seam edges when
 * joining was worth 300).
 */
export const SLACK = 20;
/** Margin (objective units) at which an assigned seam is called sure / likely; below = ambiguous. */
export const MARGIN_SURE = 15;
export const MARGIN_LIKELY = 5;
/** Default exact-search node budget for the card, and per margin re-solve. */
export const NODE_BUDGET = 60_000;
export const MARGIN_NODE_BUDGET = 4_000;
/** Default time budget for one card (ms); past it, remaining operations take the greedy incumbent. */
export const MS_BUDGET = 600;
