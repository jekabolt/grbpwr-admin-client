// SEAM SIGNALS (unit-seams D): everything that is not geometry — the step's zone, the pieces'
// cloth, their names — as small bounded nudges on the model's geometric score. Geometry alone
// names edges and millimetres; a signal reorders the pairs it built and never creates one.
// Each term lives in signals/; this file is the registry and the caps.

import { clothSignal } from './signals/cloth';
import type { SeamSignal, SignalCtx, SignalFn, SignalSide } from './signals/types';
import { zoneSignal } from './signals/zone';

export type { SeamSignal, SignalCtx, SignalOp, SignalSide } from './signals/types';
export { isLayerCloth } from './signals/cloth';

/** One term never moves a pair by more than this. */
export const MAX_DELTA = 0.08;
/** All bonuses together never lift a pair by more than this — weak agreeing hints cannot outvote
 *  a real length mismatch. */
export const MIN_SUM = -0.12;

const REGISTRY: readonly SignalFn[] = [zoneSignal, clothSignal];

export function signalsOf(
  a: SignalSide,
  b: SignalSide,
  ctx: SignalCtx,
): { delta: number; signals: SeamSignal[] } {
  const signals: SeamSignal[] = [];
  for (const fn of REGISTRY) {
    const s = fn(a, b, ctx);
    if (!s || !s.delta) continue;
    signals.push({ ...s, delta: Math.max(-MAX_DELTA, Math.min(MAX_DELTA, s.delta)) });
  }
  const minus = signals.reduce((t, s) => t + Math.min(0, s.delta), 0);
  const plus = signals.reduce((t, s) => t + Math.max(0, s.delta), 0);
  return { delta: Math.max(MIN_SUM, minus) + plus, signals };
}

/**
 * The model's scored pairs with every signal added to `score` (lower = better), best first. The
 * original fields stay; `signals` says what moved each pair.
 */
export function withSignals<T extends { score: number; a: SignalSide; b: SignalSide }>(
  scored: readonly T[],
  ctx: SignalCtx,
): (T & { signals: SeamSignal[] })[] {
  return scored
    .map((c) => {
      const { delta, signals } = signalsOf(c.a, c.b, ctx);
      return { ...c, score: c.score + delta, signals };
    })
    .sort((x, y) => x.score - y.score);
}
