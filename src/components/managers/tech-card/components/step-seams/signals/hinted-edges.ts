// WHAT THE PICKER LIGHTS UP (SPEC-F §5a.3). The card's joins map names, per step, the pieces of each
// side and one coarse edge word. Inside a step nothing runs: the picker only marks the edges the
// word fits, the owner clicks them or picks their own. Pure; the same edge words as the signal, so
// an undecidable word lights nothing rather than inventing an edge.

import type { EdgeId, PieceGeom } from 'lib/assembly-skeleton/types';
import type { EffectiveJoinHint, SeamHints } from 'lib/seam-hints';

import { edgeWordVote } from './edge-words';

export type HintedSide = {
  /** Piece keys the row names for this side. */
  pieces: readonly string[];
  /** Edge / inner-line ids of those pieces the edge word fits (empty: the word abstained). */
  edges: ReadonlySet<string>;
  word: string;
};

export type HintedEdges = {
  a: HintedSide;
  b: HintedSide;
  /** 'ai' — the model's row as is; anything else — the owner's word on it. */
  state: EffectiveJoinHint['state'];
};

function sideOf(
  side: EffectiveJoinHint['a'],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerOf: ((piece: string) => readonly string[]) | undefined,
): HintedSide {
  const edges = new Set<string>();
  const vote = (piece: string, id: EdgeId | string, lenMm: number, turnDeg: number) => {
    const one = { pieces: [piece], ids: [id as EdgeId], lenMm, turnDeg };
    if (edgeWordVote(side.edge, one, geoms) === true) edges.add(id);
  };
  for (const piece of side.pieces) {
    for (const edge of geoms.get(piece)?.edges ?? [])
      vote(piece, edge.id, edge.lenMm, edge.turnDeg);
    // Slits and other inner lines: the picker's own ids (`innerId(piece, k)`), when it has any.
    for (const id of innerOf?.(piece) ?? []) vote(piece, id, 0, 0);
  }
  return { pieces: side.pieces, edges, word: side.edge };
}

/**
 * The live join row of this step as edges to mark, or null (no row, the row is off, no hints).
 * `hints` is the card's merged map BY PIECE KEY (`seamHints.forGuess` / `guessHints`).
 */
export function hintedEdgesFor(
  op: { operationNumber?: number } | undefined,
  hints: SeamHints | null | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerOf?: (piece: string) => readonly string[],
): HintedEdges | null {
  const number = op?.operationNumber;
  if (number == null || !hints) return null;
  const row = hints.joins.find((join) => join.op === number);
  if (!row || row.state === 'off') return null;
  return {
    a: sideOf(row.a, geoms, innerOf),
    b: sideOf(row.b, geoms, innerOf),
    state: row.state,
  };
}
