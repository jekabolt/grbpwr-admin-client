// A10 · AUTOPILOT DRIVER — one tick = one answer (or one "next") through the wizard's own API.
//
// The wizard (next lane) calls `autopilotTick` after every render while autopilot is on; the e2e
// probe (scripts/pattern-import/autopilot-entry.ts) calls it in a loop over the same hook, so the
// metric measures exactly what the wizard will run. A tick never answers on stale state: it
// applies ONE action and returns — the caller re-renders and ticks again, and the policy decides
// again on the new outputs (a fixpoint, or a stop).
import type { AutopilotRecord, WizardStep } from 'lib/pattern-import/types';
import type { CardContext } from '../client';
import type { ImportSessionApi } from '../use-import-session';
import { decide, type AutopilotAction, type AutopilotDecision, type AutopilotStop } from './policy';
import { assumptionKey, type Assumption } from './types';

export type AutopilotRun = {
  /** Every answer given so far, one per question (`assumptionKey`), in the order first given. */
  assumptions: Map<string, Assumption>;
  /** Loop guard: how often the same (step, blocker, action) came back. */
  seen: Map<string, number>;
  ticks: number;
  /** Set once the run stopped or reached the apply step. */
  done: null | { ok: true } | { ok: false; stop: AutopilotStop };
};

export const newAutopilotRun = (): AutopilotRun => ({
  assumptions: new Map(),
  seen: new Map(),
  ticks: 0,
  done: null,
});

export type TickResult =
  | { kind: 'acted'; action: AutopilotAction['kind'] | 'apply' }
  | { kind: 'advanced'; from: WizardStep }
  | { kind: 'wait' }
  | { kind: 'done' }
  | { kind: 'stop'; stop: AutopilotStop };

/** The same question asked this many times without the run moving is a stop, not a loop. */
const MAX_REPEAT = 4;

/**
 * The record the manifest carries: piece answers of pieces no longer written are left out (a piece
 * set aside keeps its "not a piece" answer).
 */
export function autopilotRecord(
  run: AutopilotRun,
  exported?: ReadonlySet<number>,
): AutopilotRecord {
  const keep = (a: Assumption) =>
    a.seed == null ||
    !exported ||
    exported.has(a.seed) ||
    a.kind === 'not-a-piece' ||
    a.kind === 'dropped-piece';
  return {
    v: 1,
    assumptions: [...run.assumptions.values()].filter(keep).map(({ seed: _s, ...a }) => a),
  };
}

export type TickOpts = {
  /** The policy (a probe may wrap it to inject a wrong answer and check the metric sees it). */
  decide?: (snap: Parameters<typeof decide>[0]) => AutopilotDecision;
};

export async function autopilotTick(
  api: ImportSessionApi,
  card: CardContext,
  run: AutopilotRun,
  opts: TickOpts = {},
): Promise<TickResult> {
  if (run.done) return run.done.ok ? { kind: 'done' } : { kind: 'stop', stop: run.done.stop };
  const s = api.session;
  if (s.busy) return { kind: 'wait' };
  run.ticks++;
  const halt = (stop: AutopilotStop): TickResult => {
    run.done = { ok: false, stop };
    return { kind: 'stop', stop };
  };
  if (s.error) return halt({ step: s.step, reason: s.error });
  if (s.step === 'apply') {
    if (api.apply.phase === 'idle' && !card.downloadOnly) {
      await api.dispatch({ type: 'apply' });
      return { kind: 'acted', action: 'apply' };
    }
    if (api.apply.phase === 'running') return { kind: 'wait' };
    if (api.apply.phase === 'done' && !api.apply.result.ok)
      return halt({ step: 'apply', reason: `the card refused: ${api.apply.result.message}` });
    run.done = { ok: true };
    return { kind: 'done' };
  }
  const d = (opts.decide ?? decide)({
    session: s,
    inputs: api.inputs,
    card,
    baseSeeds: api.baseSeeds,
    answersNow: api.answersNow,
    presegmented: !!api.extracted.presegmented,
    blocker: api.blocker,
  });
  for (const a of d.assumptions) {
    const k = assumptionKey(a);
    run.assumptions.delete(k);
    run.assumptions.set(k, a);
  }
  if (d.stop) return halt(d.stop);
  const act = d.actions[0];
  const key = `${s.step}|${api.blocker ?? ''}|${act ? JSON.stringify(act).slice(0, 400) : 'next'}`;
  const n = (run.seen.get(key) ?? 0) + 1;
  run.seen.set(key, n);
  if (n > MAX_REPEAT)
    return halt({
      step: s.step,
      reason: `no progress: ${api.blocker ?? `"${act?.kind ?? 'next'}" did not move the run`}`,
    });
  if (act) {
    await execute(api, act);
    return { kind: 'acted', action: act.kind };
  }
  if (api.blocker) return halt({ step: s.step, reason: `unanswered: ${api.blocker}` });
  if (s.step === 'fabrics') {
    const exported = new Set((s.semantics?.pieces ?? []).map((p) => p.seed));
    await api.dispatch({ type: 'write', autopilot: autopilotRecord(run, exported) });
  } else await api.next();
  return { kind: 'advanced', from: s.step };
}

/** One action through the wizard's own API — the same calls its controls make. */
async function execute(api: ImportSessionApi, a: AutopilotAction): Promise<void> {
  switch (a.kind) {
    case 'inputs':
      api.patchInputs(a.patch);
      return;
    case 'drawn-sizes':
      await api.setDrawnSizes(a.n);
      return;
    case 'size-map':
      await api.dispatch({ type: 'size-map', entries: a.entries });
      return;
    case 'variant':
      await api.dispatch({ type: 'variant', variant: a.variant });
      return;
    case 'piece-edits':
      if (api.session.step !== 'pieces') await api.dispatch({ type: 'back', to: 'pieces' });
      await api.dispatch({ type: 'piece-edits', edits: a.edits });
      return;
    case 'semantics':
      await api.dispatch({
        type: 'semantics',
        input: api.semanticsInput({ ...api.inputs, ...a.patch }),
      });
      return;
    case 'confirm-shown':
      api.confirmShown();
      return;
    case 'edit-name':
      await api.editName(a.seed, { code: a.code, mods: a.mods, displayName: a.displayName });
      return;
    case 'fabrics':
      await api.dispatch({ type: 'fabrics', assignment: a.assignment });
      return;
  }
}
