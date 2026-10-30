// HOW SURE THE GUESS IS (unit-seams D): three outcomes for a step's best pair — confident, a
// marked guess, or nothing worth showing (the picker waits for a hand pick). Read from the
// ranking, not from the score alone: the gap to the runner-up and how many independent signals
// agree. Thresholds are global, never per card.

import type { SeamSignal } from './signals/types';

export type Outcome = 'confident' | 'guess' | 'manual';

/** `confident` stays off until the labelled probe (line G) shows wrong-and-confident ≤ 2 %. */
export const CONFIDENT_ON = false;
/** Best score at or under this, with a clear lead or two agreeing signals, is confident. */
export const T_CONF = -0.05;
/** Lead over the runner-up that counts as clear. */
export const M_CONF = 0.04;
/** Above this the best pair is no seam worth showing: hand pick. */
export const T_GUESS = 0.12;

type Ranked = { score: number; signals?: readonly SeamSignal[] };

export function outcomeOf(
  best: Ranked | undefined,
  second?: Ranked,
): { outcome: Outcome; margin: number; support: number } {
  if (!best) return { outcome: 'manual', margin: 0, support: 0 };
  const margin = second ? second.score - best.score : Infinity;
  const support = supportOf(best);
  if (best.score > T_GUESS) return { outcome: 'manual', margin, support };
  const sure = best.score <= T_CONF && (margin >= M_CONF || support >= 2);
  return { outcome: CONFIDENT_ON && sure ? 'confident' : 'guess', margin, support };
}

/** Terms that are hints, not evidence: each counts once at most, and only when geometry alone
 *  already holds the pair as a guess (an AI word never lifts a pair geometry rejects). */
const HINTS: ReadonlySet<string> = new Set(['ai', 'prior']);

function supportOf(best: Ranked): number {
  const signals = best.signals ?? [];
  const hintDelta = signals.filter((s) => HINTS.has(s.term)).reduce((t, s) => t + s.delta, 0);
  const geometryHolds = best.score - hintDelta <= T_GUESS;
  const terms = new Set<string>();
  for (const s of signals) {
    if (s.delta >= 0) continue;
    if (HINTS.has(s.term) && !geometryHolds) continue;
    terms.add(s.term);
  }
  return terms.size;
}
