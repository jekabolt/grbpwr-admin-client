// N1 + A10: THE forward drive — one tick of it, shared by the wizard hook (use-import-session.ts,
// its effect) and the autopilot metric (scripts/pattern-import/autopilot-entry.ts), so the probe
// measures the coordinator the wizard runs (Codex #5).
//
// A tick: wait while anything runs; stop on an error, a notice, or a step that always stops
// (check, apply); a step with no question (no blocker, no offer) goes forward; a step that asks is
// offered to the resolver (the autopilot policy) once per QUESTION IDENTITY — (step, question,
// revision of the stage outputs): an answer that moved the run (a piece named, which then asks for
// its grain in the same words) is a new question, the same question over the same outputs is a
// loop and stops. At most `MAX_ANSWERS_PER_STEP` answers per step. An answer is taken only as the
// step's own answers (`answerProblem`) and only while nothing moved meanwhile (`live`); `proceed`
// goes on past an OFFER left as it is (never past a blocker).
import type { ImportSession, WizardEvent, WizardStep } from 'lib/pattern-import/types';
import { AUTO_STOPS, answerProblem, type AutoAnswer, type AutoResolver } from './auto-advance';

/** A step answered this many times without moving on is a stop. */
export const MAX_ANSWERS_PER_STEP = 12;

/** What a drive keeps between ticks (one per arm). */
export type DriveState = {
  /** Question identities already offered to the resolver. */
  asked: Set<string>;
  /** Answers taken per step. */
  perStep: Partial<Record<WizardStep, number>>;
  /** The stage outputs last seen, and their revision. */
  outputs: unknown[] | null;
  rev: number;
};

export const newDriveState = (): DriveState => ({
  asked: new Set(),
  perStep: {},
  outputs: null,
  rev: 0,
});

/** The revision of the stage outputs a question reads: a new object anywhere = a new revision. */
export function outputsRev(st: DriveState, s: ImportSession): number {
  const now = [s.clean, s.sheet, s.chains, s.sizes, s.pieces, s.semantics, s.fabrics, s.names];
  if (!st.outputs || now.some((x, k) => x !== st.outputs![k])) {
    st.outputs = now;
    st.rev++;
  }
  return st.rev;
}

/** A resolver answer, plus `proceed` (go on past an offer as it is) and a stop's reason. */
export type DriveAnswer<I> = AutoAnswer<I> & { proceed?: boolean; reason?: { reason: string } };

export type DriveCtx<I> = {
  session: ImportSession;
  inputs: I;
  blocker: string | null;
  offer: string | null;
  notice: string | null;
  /** Something is running (a stage, the namer, a write): the tick waits. */
  busy: boolean;
  resolve?: AutoResolver<I>;
  /**
   * AP-replay: offered every step that asks NOTHING, once per (step, outputs revision), before the
   * drive goes on — the answers a previous import of the same files gave without being asked (a
   * typed name, a fabric tick). null / no patch and no events = nothing to add, the drive goes on.
   * Its answer is taken under the same rules as the resolver's (the step's own answers only).
   */
  prefill?: AutoResolver<I>;
  /** The latest session and inputs (refs), read when the resolver is asked. */
  current: () => { session: ImportSession; inputs: I };
  /** One forward move of the wizard; true = the step moved. */
  forward: () => Promise<boolean>;
  /** The answer's inputs, applied at once (refs and state). */
  patch: (p: Partial<I>) => void | Promise<void>;
  /** One of the step's own events (no operator-action side effects). */
  dispatch: (ev: WizardEvent) => Promise<void>;
  /** Nothing moved since the question was asked (same drive, run, step, no operator action). */
  live: () => boolean;
  /** The run failed meanwhile (`session.error` after an event). */
  failed: () => boolean;
};

export type DriveStopWhy =
  | 'auto-stop'
  | 'error'
  | 'notice'
  | 'no-resolver'
  | 'asked-again'
  | 'cap'
  | 'resolver'
  | 'refused'
  | 'stale'
  | 'not-moved';

export type DriveTick =
  | { kind: 'wait' }
  | { kind: 'moved'; from: WizardStep }
  | { kind: 'answered'; step: WizardStep; question: string }
  | {
      kind: 'stopped';
      why: DriveStopWhy;
      step: WizardStep;
      question?: string;
      /** In words, for the footer ("autopilot stopped · …"). */
      reason?: string;
    };

/**
 * The audit-only part of an answer: the autopilot's assumption record (`autopilot`), nothing that
 * answers the step. null when there is none.
 */
export function auditOnly<I>(patch: Partial<I> | undefined): Partial<I> | null {
  const rec = (patch as { autopilot?: unknown } | undefined)?.autopilot;
  if (!Array.isArray(rec)) return null;
  return { autopilot: rec } as unknown as Partial<I>;
}

/**
 * A forward move that did not move: never a stop without words (archive: 20 files stopped on scale
 * as "not-moved" with an empty reason — the move had FAILED, "no pattern tiles — the pages were
 * read as cover / instructions only", and the session's error was lost). A move that failed is the
 * error stop with the session's words; one that neither failed nor moved says so, with the
 * question it answered, if any.
 */
function notMoved<I>(c: DriveCtx<I>, step: WizardStep, question?: string): DriveTick {
  const err = c.current().session.error;
  if (c.failed() || err)
    return {
      kind: 'stopped',
      why: 'error',
      step,
      ...(question ? { question } : {}),
      reason: err || `the ${step} step failed`,
    };
  return {
    kind: 'stopped',
    why: 'not-moved',
    step,
    ...(question ? { question } : {}),
    reason: question
      ? `the answer to "${question}" was taken but the ${step} step did not move on`
      : `the ${step} step asks nothing and blocks nothing, yet did not move on`,
  };
}

/** One tick of the drive (see the header). The caller disarms on 'stopped'. */
export async function driveTick<I>(st: DriveState, c: DriveCtx<I>): Promise<DriveTick> {
  const s = c.session;
  const step = s.step;
  if (c.busy || s.busy) return { kind: 'wait' };
  if (s.error) return { kind: 'stopped', why: 'error', step, reason: s.error };
  if (c.notice) return { kind: 'stopped', why: 'notice', step, reason: c.notice };
  if (AUTO_STOPS.includes(step)) return { kind: 'stopped', why: 'auto-stop', step };
  const question = c.blocker ?? c.offer;
  if (!question) {
    // AP-replay: what the previous import answered unasked on this step, once per outputs revision
    const pre = c.prefill ? await prefillTick(st, c, step) : null;
    if (pre) return pre;
    const moved = await c.forward();
    return moved ? { kind: 'moved', from: step } : notMoved(c, step);
  }
  if (!c.resolve) return { kind: 'stopped', why: 'no-resolver', step, question };
  const key = `${step}|${question}|${outputsRev(st, s)}`;
  if (st.asked.has(key))
    return { kind: 'stopped', why: 'asked-again', step, question, reason: question };
  st.asked.add(key);
  const n = (st.perStep[step] = (st.perStep[step] ?? 0) + 1);
  if (n > MAX_ANSWERS_PER_STEP)
    return {
      kind: 'stopped',
      why: 'cap',
      step,
      question,
      reason: `more than ${MAX_ANSWERS_PER_STEP} answers on ${step}: ${question}`,
    };
  const now = c.current();
  const a = (await c.resolve({
    session: now.session,
    inputs: now.inputs,
    step,
    question,
  })) as DriveAnswer<I> | null;
  if (!c.live()) return { kind: 'stopped', why: 'stale', step, question };
  if (!a || a.stop) {
    // a stop still keeps what the autopilot assumed on the way (a size left out as not drawn):
    // only the audit record, never an answer — after the operator resumes, the manifest has it
    const audit = auditOnly(a?.patch);
    if (audit) await c.patch(audit);
    return {
      kind: 'stopped',
      why: 'resolver',
      step,
      question,
      reason: a?.reason?.reason ?? question,
    };
  }
  const problem = answerProblem(step, a);
  if (problem)
    return {
      kind: 'stopped',
      why: 'refused',
      step,
      question,
      reason: `the automatic answer was refused — ${problem}`,
    };
  if (a.proceed && c.blocker)
    return {
      kind: 'stopped',
      why: 'refused',
      step,
      question,
      reason: `the automatic answer was refused — "go on" past a question that blocks: ${question}`,
    };
  if (a.patch) await c.patch(a.patch);
  for (const ev of a.events ?? []) {
    if (!c.live()) return { kind: 'stopped', why: 'stale', step, question };
    await c.dispatch(ev);
    if (c.failed()) break;
  }
  if (a.proceed && c.live() && !c.failed()) {
    const moved = await c.forward();
    if (!moved) return notMoved(c, step, question);
  }
  return { kind: 'answered', step, question };
}

/** The prefill's question (a step that asks nothing): what the tick reports it answered. */
export const PREFILL_QUESTION = '(prefill)';

/**
 * AP-replay: one prefill offer on a step that asks nothing — null = nothing taken (the drive goes
 * on). An answer goes through the same refusal rules as a resolver answer; a refused one stops.
 */
async function prefillTick<I>(
  st: DriveState,
  c: DriveCtx<I>,
  step: WizardStep,
): Promise<DriveTick | null> {
  // once per outputs revision — and again after each answer taken (an inputs-only answer leaves
  // the revision as it was, and what it made possible is offered next)
  const key = `${step}|${PREFILL_QUESTION}|${outputsRev(st, c.session)}|${st.perStep[step] ?? 0}`;
  if (st.asked.has(key)) return null;
  st.asked.add(key);
  const now = c.current();
  const a = (await c.prefill!({
    session: now.session,
    inputs: now.inputs,
    step,
    question: PREFILL_QUESTION,
  })) as DriveAnswer<I> | null;
  if (!c.live()) return { kind: 'stopped', why: 'stale', step };
  if (!a || a.stop || (!a.patch && !a.events?.length)) return null;
  const n = (st.perStep[step] = (st.perStep[step] ?? 0) + 1);
  if (n > MAX_ANSWERS_PER_STEP)
    return {
      kind: 'stopped',
      why: 'cap',
      step,
      reason: `more than ${MAX_ANSWERS_PER_STEP} answers on ${step}`,
    };
  const problem = answerProblem(step, a);
  if (problem)
    return {
      kind: 'stopped',
      why: 'refused',
      step,
      question: PREFILL_QUESTION,
      reason: `the replayed answer was refused — ${problem}`,
    };
  if (a.patch) await c.patch(a.patch);
  for (const ev of a.events ?? []) {
    if (!c.live()) return { kind: 'stopped', why: 'stale', step };
    await c.dispatch(ev);
    if (c.failed()) break;
  }
  return { kind: 'answered', step, question: PREFILL_QUESTION };
}
