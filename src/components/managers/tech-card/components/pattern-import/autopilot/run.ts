// A10 · AUTOPILOT DRIVE for the probe — N1's forward drive (auto-advance.ts, `api.advance`) run
// tick by tick over the same hook API, with the policy as its resolver:
//   · a step with no question (no blocker, no offer) → the step's "next";
//   · a step that asks → `autopilotAnswer` once per (step, question): the patch, then the events,
//     in order; the step is checked again — the same question back, or no answer, is a stop;
//   · check: a gate block is a stop; a green gate goes on to apply (the wiring lane's "apply by
//     itself", owner A10) — the card's apply is the probe's stub.
// The wizard does not use this file: it calls `api.advance({ resolve: autopilotResolver(card) })`.
// The metric measures the same policy through the same answers.
import type { WizardStep } from 'lib/pattern-import/types';
import type { CardContext } from '../client';
import type { ImportSessionApi } from '../use-import-session';
import {
  autopilotAnswer,
  type AutopilotAnswer,
  type AutopilotSnapshot,
  type AutopilotStop,
} from './policy';
import type { Assumption } from './types';

/** A step answered this many times without moving on is a stop. */
const MAX_ANSWERS_PER_STEP = 12;

/** A number that changes whenever a stage output the questions read is a new object. */
function outputsRev(run: AutopilotRun, s: ImportSessionApi['session']): number {
  const now = [s.clean, s.sheet, s.chains, s.sizes, s.pieces, s.semantics, s.fabrics, s.names];
  if (!run.outputs || now.some((x, k) => x !== run.outputs![k])) {
    run.outputs = now;
    run.rev++;
  }
  return run.rev;
}

export type AutopilotRun = {
  /** The stage outputs last seen, and their revision (`outputsRev`). */
  outputs: unknown[] | null;
  rev: number;
  /** Answers given per step. */
  perStep: Partial<Record<WizardStep, number>>;
  /** (step, question) pairs already offered to the policy (N1: once each). */
  asked: Set<string>;
  ticks: number;
  /** Set once the run stopped or reached the apply step. */
  done: null | { ok: true } | { ok: false; stop: AutopilotStop };
  /** Every answer given, in order (also merged into `Inputs.autopilot`). */
  log: Assumption[];
};

export const newAutopilotRun = (): AutopilotRun => ({
  outputs: null,
  rev: 0,
  perStep: {},
  asked: new Set(),
  ticks: 0,
  done: null,
  log: [],
});

export type TickResult =
  | { kind: 'answered'; question: string }
  | { kind: 'advanced'; from: WizardStep }
  | { kind: 'wait' }
  | { kind: 'done' }
  | { kind: 'stop'; stop: AutopilotStop };

export type TickOpts = {
  /** The policy (a probe may wrap it to inject a wrong answer and check the metric sees it). */
  answer?: (snap: AutopilotSnapshot) => AutopilotAnswer;
  /** What the step offers without blocking (N1 `stepOffer`); absent = blockers only. */
  offer?: (api: ImportSessionApi) => string | null;
  /** Lets the hook re-render between the patch and the events (N1 sets its ref directly). */
  settle?: () => Promise<void>;
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
      return { kind: 'answered', question: 'apply' };
    }
    if (api.apply.phase === 'running') return { kind: 'wait' };
    if (api.apply.phase === 'done' && !api.apply.result.ok)
      return halt({ step: 'apply', reason: `the card refused: ${api.apply.result.message}` });
    run.done = { ok: true };
    return { kind: 'done' };
  }
  if (s.step === 'check') {
    const failing = Object.entries(s.gate).flatMap(([scope, g]) =>
      g.checks
        .filter((c) => !c.ok && c.severity === 'block')
        .map((c) => `${scope.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()} ${c.id}`),
    );
    // a gate block is never answered: the export would be known wrong
    if (failing.length)
      return halt({ step: 'check', reason: `the gate blocks: ${failing.join(', ')}` });
    await api.next();
    return { kind: 'advanced', from: 'check' };
  }
  const question = api.blocker ?? opts.offer?.(api) ?? null;
  if (!question) {
    await api.next();
    return { kind: 'advanced', from: s.step };
  }
  // N1 offers a question once; here once per question AND stage outputs: an answer that moved the
  // run (a details answer names a piece, which then asks for its grain in the same words) is a new
  // question, the same question over the same outputs is a loop → stop. (N1 keys by the question
  // alone today: the coordinator is asked to key by the outputs too.)
  const rev = outputsRev(run, s);
  const key = `${s.step}|${question}|${rev}`;
  if (run.asked.has(key)) return halt({ step: s.step, reason: `asked again: ${question}` });
  run.asked.add(key);
  const perStep = (run.perStep[s.step] = (run.perStep[s.step] ?? 0) + 1);
  if (perStep > MAX_ANSWERS_PER_STEP)
    return halt({ step: s.step, reason: `more than ${MAX_ANSWERS_PER_STEP} answers: ${question}` });
  const a = (opts.answer ?? autopilotAnswer)({
    session: s,
    inputs: api.inputs,
    card,
    step: s.step,
    question,
    baseSeeds: api.baseSeeds,
    presegmented: !!api.extracted.presegmented,
  });
  run.log.push(...a.assumptions);
  if (a.stop) return halt(a.reason ?? { step: s.step, reason: `no answer for: ${question}` });
  if (a.patch) {
    api.patchInputs(a.patch);
    await opts.settle?.();
  }
  for (const ev of a.events ?? []) {
    await api.dispatch(ev);
    await opts.settle?.();
    if (api.session.error) break;
  }
  if (a.proceed) await api.next();
  return { kind: 'answered', question };
}
