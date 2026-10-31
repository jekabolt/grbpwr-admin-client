// One cached card-level joins map is one bounded signal. It can only reorder candidate pairs the
// geometry model already built; absent/off hints are silent and edge words may abstain.

import type { EffectiveJoinHint, SeamHints } from 'lib/seam-hints';

import { edgeWordVote } from './edge-words';
import type { SignalCtx, SignalFn, SignalSide } from './types';
import { zoneAllows } from './zone';

export const AI_MATCH = -0.05;
export const AI_MISMATCH = 0.03;

const sameSet = (left: readonly string[], right: readonly string[]) => {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((piece) => b.has(piece));
};

const hintsOf = (ctx: SignalCtx): SeamHints | undefined => ctx.hints ?? ctx.op?.hints;

function orientationOf(
  row: EffectiveJoinHint,
  a: SignalSide,
  b: SignalSide,
): readonly [EffectiveJoinHint['a'], EffectiveJoinHint['b']] | null {
  if (sameSet(a.pieces, row.a.pieces) && sameSet(b.pieces, row.b.pieces)) return [row.a, row.b];
  if (sameSet(a.pieces, row.b.pieces) && sameSet(b.pieces, row.a.pieces)) return [row.b, row.a];
  return null;
}

export const aiSignal: SignalFn = (a, b, ctx) => {
  const operationNumber = ctx.op?.operationNumber;
  if (operationNumber == null) return null;
  // Same silence as the prior term: a pair the step's zone rules out gets no say from a hint.
  if (zoneAllows(a, b, ctx.op, ctx.geoms) === false) return null;
  const row = hintsOf(ctx)?.joins.find((hint) => hint.op === operationNumber);
  if (!row || row.state === 'off') return null;

  const oriented = orientationOf(row, a, b);
  if (!oriented)
    return {
      term: 'ai',
      delta: AI_MISMATCH,
      reason: `op ${operationNumber}: different pieces`,
    };

  const av = edgeWordVote(oriented[0].edge, a, ctx.geoms);
  const bv = edgeWordVote(oriented[1].edge, b, ctx.geoms);
  if (av === false || bv === false)
    return {
      term: 'ai',
      delta: AI_MISMATCH,
      reason: `op ${operationNumber}: different edge`,
    };

  return {
    term: 'ai',
    delta: AI_MATCH,
    reason: `op ${operationNumber}: ${oriented[0].edge}↔${oriented[1].edge}`,
  };
};
