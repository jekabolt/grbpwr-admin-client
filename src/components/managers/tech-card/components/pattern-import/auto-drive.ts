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
    const moved = await c.forward();
    return moved ? { kind: 'moved', from: step } : { kind: 'stopped', why: 'not-moved', step };
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
  if (!a || a.stop)
    return {
      kind: 'stopped',
      why: 'resolver',
      step,
      question,
      reason: a?.reason?.reason ?? question,
    };
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
    if (!moved) return { kind: 'stopped', why: 'not-moved', step, question };
  }
  return { kind: 'answered', step, question };
}
