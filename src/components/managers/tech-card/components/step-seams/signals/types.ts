// SEAM SIGNALS, SHARED SHAPES: what a signal sees of a candidate pair and of its step. A signal
// never names an edge or a length — geometry does that (step-seams-model); a signal only nudges
// the geometric score of a pair the model already built (lower score = better pair).

import type { EdgeId, PieceGeom } from 'lib/assembly-skeleton/types';
import type { SeamHints } from 'lib/seam-hints';

/** One side of a candidate pair, as the model scored it. */
export type SignalSide = {
  pieces: readonly string[];
  ids: readonly EdgeId[];
  lenMm: number;
  turnDeg: number;
};

/** The step the pair is proposed for (form op fields, both enum and short spellings). */
export type SignalOp = {
  zone?: string;
  work?: string;
  operationType?: string;
  operationNumber?: number;
  /** Runtime carrier used by the model's existing `{ op, geoms }` signal call. */
  hints?: SeamHints;
};

/**
 * What every term may read. Lanes add their own optional input here (learned priors, the card's
 * AI hints); absent means the term is silent and the guess behaves as before.
 */
export type SignalCtx = {
  op: SignalOp | undefined;
  geoms: ReadonlyMap<string, PieceGeom>;
  hints?: SeamHints;
};

/** One signal's say on a pair: `delta` is added to the score (negative = the pair fits better). */
export type SeamSignal = { term: string; delta: number; reason: string };

export type SignalFn = (a: SignalSide, b: SignalSide, ctx: SignalCtx) => SeamSignal | null;
