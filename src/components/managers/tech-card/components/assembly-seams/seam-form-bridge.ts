// THE SEAM WRITE'S DOOR INTO THE OPEN FORM (C7). A seam gesture writes rows AND step links in one
// transaction under the card's lock_version; the form's body write carries the same links and the
// same version. So the two take turns: the card page (index.tsx) registers this bridge for its card,
// and a seam write
//
//   flush   — saves the form first: a step is addressed by the operationNumber the server gave it, and
//             a version claimed over unsaved work would be written over by the next body save. A form
//             that cannot save because it does not validate says so (`invalid`): a user's seam gesture
//             may go on past it (C9) — the steps it names are stored ones, `adopt` puts the committed
//             links into the form's baseline AND values, so the body save that follows the fix claims
//             the new version and carries those links;
//   hold    — keeps the autosave from starting a body write while the seam request flies (a write
//             already on the wire is waited out), and refuses while the conflict decision is open;
//   version — the lock_version the next write must claim;
//   adopt   — takes the committed change: the new version into the page's base, each step's links into
//             the form's values AND baseline — not an edit, so not dirty. An edit made meanwhile stays
//             dirty and goes out next, on the new version: nothing is lost, nothing 409s;
//   reread  — reads the card once more after lock_version_moved.
//
// No bridge (a page without autosave: create, print, stands) → nothing is written.

import type { common_TechCard, common_TechCardSeam, OperationSeamKeys } from 'api/proto-http/admin';
import type { UseFormReturn } from 'react-hook-form';
import type { TechCardFormData } from '../schema';
import type { CardBase } from '../useTechCardAutosave';
import {
  flushAllowsRun,
  flushRefusalSentence,
  type FlushResult,
} from '../design/autosave-contract';
import {
  mergeStepKeys,
  patchCardLinks,
  patchSentBody,
  sameKeys,
  type StepKeys,
  type StepRef,
} from './seam-change-plan';

export type SeamAdoption = {
  /** The version the request claimed. */
  expected: number;
  lockVersion: number;
  links: readonly OperationSeamKeys[];
  seams: readonly common_TechCardSeam[];
};

export type SeamFormBridge = {
  /** `invalid`: refused only because the form does not validate (nothing else stood in the way). */
  flush: (reason: string) => Promise<{ ok: true } | { ok: false; why: string; invalid?: true }>;
  hold: (o?: SeamDoorOpts) => Promise<{ release: () => void; refused?: string }>;
  version: () => number;
  /** The step's stored number; 0 when the form has no such step or it was never saved. */
  operationNumber: (step: StepRef) => number;
  adopt: (a: SeamAdoption) => void;
  reread: (
    o?: SeamDoorOpts,
  ) => Promise<{ ok: true; card: common_TechCard } | { ok: false; why: string }>;
};

/**
 * `pastInvalidForm`: the gesture goes on past a form that does not validate (C9). The form's steps
 * are then judged by its BASELINE (the numbers the card gave them), not by its values: a step deleted
 * or moved in the unsaved form keeps the other steps addressable — each still carries the number the
 * card holds for it. The touched step itself must still be in the form with a stored number.
 */
export type SeamDoorOpts = { pastInvalidForm?: boolean };

export type SeamFlushAnswer = Awaited<ReturnType<SeamFormBridge['flush']>>;

/** The autosave's flush as the door says it: `invalid` marks the one refusal a gesture may pass (C9). */
export function seamFlushAnswer(
  r0: FlushResult,
  errorsCount?: number,
  refusal?: string,
  /** The body write on the wire when the flush began failed: its queued pass may say `invalid` over
   * that failure, and a gesture never goes on past a failed save. */
  savedFailed?: boolean,
): SeamFlushAnswer {
  const r = r0 === 'invalid' && savedFailed ? 'error' : r0;
  if (flushAllowsRun(r)) return { ok: true };
  const why = flushRefusalSentence(r, errorsCount, refusal);
  return r === 'invalid' ? { ok: false, why, invalid: true } : { ok: false, why };
}

const bridges = new Map<number, SeamFormBridge>();

/** The card page's bridge for `cardId`; the returned function takes it away (only this one). */
export function registerSeamFormBridge(cardId: number, bridge: SeamFormBridge): () => void {
  bridges.set(cardId, bridge);
  return () => {
    if (bridges.get(cardId) === bridge) bridges.delete(cardId);
  };
}

export const seamFormBridge = (cardId: number): SeamFormBridge | undefined => bridges.get(cardId);

const queues = new Map<number, Promise<void>>();

/**
 * One seam write of a card at a time, in the order asked: each claims the version the one before it
 * left, so two quick gestures never race each other into lock_version_moved.
 */
export function serializeSeamWrite<T>(cardId: number, task: () => Promise<T>): Promise<T> {
  const before = queues.get(cardId) ?? Promise.resolve();
  const run = before.then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(cardId, tail);
  void tail.then(() => {
    if (queues.get(cardId) === tail) queues.delete(cardId);
  });
  return run;
}

type StepRow = {
  historyKey?: string;
  operationNumber?: number;
  seamKeys?: string[];
  poseKeys?: string[];
};

type FormLike = Pick<UseFormReturn<TechCardFormData>, 'getValues' | 'setValue' | 'control'>;

const keysOf = (row: StepRow | undefined): StepKeys => ({
  seamKeys: row?.seamKeys ?? [],
  poseKeys: row?.poseKeys ?? [],
});

function uniqueNumbers(rows: readonly StepRow[]): Map<number, number> {
  const at = new Map<number, number>();
  const twice = new Set<number>();
  rows.forEach((row, i) => {
    const n = row.operationNumber ?? 0;
    if (!n) return;
    if (at.has(n)) twice.add(n);
    at.set(n, i);
  });
  for (const n of twice) at.delete(n);
  return at;
}

/**
 * The server's step links into the form (C7, invariant 2). Each step the server numbered gets its
 * keys in the BASELINE (what the card holds now) and in the VALUES; a step the operator changed
 * meanwhile keeps that change on top (mergeStepKeys). `setValue` then judges each field against the
 * new baseline: a link the server wrote is clean, an edit of the operator stays dirty. The caller
 * runs this inside a server reconciliation (no undo entry). Returns how many rows it touched.
 */
export function adoptStepLinks(form: FormLike, byNo: ReadonlyMap<number, StepKeys>): number {
  const baseline = form.control._defaultValues as Partial<TechCardFormData>;
  const baseOps = (baseline.operations ?? []) as StepRow[];
  const values = (form.getValues('operations') ?? []) as StepRow[];
  const baseAt = uniqueNumbers(baseOps);
  const valueAt = uniqueNumbers(values);
  const nextBase = baseOps.slice();
  let baseMoved = false;
  const writes: { i: number; before: StepKeys; after: StepKeys }[] = [];
  for (const [n, after] of byNo) {
    const j = baseAt.get(n);
    const baseRow = j === undefined ? undefined : baseOps[j];
    // The value row: the baseline row's own (by identity), else the one row holding the number.
    let i = baseRow?.historyKey
      ? values.findIndex((row) => row.historyKey === baseRow.historyKey)
      : -1;
    if (i < 0) i = valueAt.get(n) ?? -1;
    if (j !== undefined && baseRow) {
      const before = keysOf(baseRow);
      if (
        !sameKeys(before.seamKeys, after.seamKeys) ||
        !sameKeys(before.poseKeys, after.poseKeys)
      ) {
        nextBase[j] = { ...baseRow, seamKeys: [...after.seamKeys], poseKeys: [...after.poseKeys] };
        baseMoved = true;
      }
      if (i >= 0) writes.push({ i, before, after });
    } else if (i >= 0) {
      // No baseline row (unusual): the values take the server's keys; a body write repeats them.
      writes.push({ i, before: keysOf(values[i]), after });
    }
  }
  if (baseMoved) (baseline as Record<string, unknown>).operations = nextBase;
  let touched = 0;
  for (const { i, before, after } of writes) {
    const cur = keysOf(values[i]);
    const seamKeys = mergeStepKeys(cur.seamKeys, before.seamKeys, after.seamKeys);
    const poseKeys = mergeStepKeys(cur.poseKeys, before.poseKeys, after.poseKeys);
    const movedBase =
      !sameKeys(before.seamKeys, after.seamKeys) || !sameKeys(before.poseKeys, after.poseKeys);
    const movedValue = !sameKeys(cur.seamKeys, seamKeys) || !sameKeys(cur.poseKeys, poseKeys);
    if (!movedBase && !movedValue) continue;
    // Written even when the value stays: the field is judged again against its new baseline.
    form.setValue(`operations.${i}.seamKeys`, seamKeys, { shouldDirty: true });
    form.setValue(`operations.${i}.poseKeys`, poseKeys, { shouldDirty: true });
    touched += 1;
  }
  return touched;
}

/** The form step's stored number: by identity, 0 when the step is gone or was never saved. */
export function stepNumberOf(form: Pick<FormLike, 'getValues'>, step: StepRef): number {
  const ops = (form.getValues('operations') ?? []) as StepRow[];
  const row = ops.find((op) => op.historyKey === step.historyKey);
  return row?.operationNumber ?? 0;
}

/**
 * The card the page stands on after a committed seam change (index.tsx `base`): the new version, and
 * the card (or the body it sent, with no card read back) carrying the committed links and rows — so a
 * read at that version is «the same card», and a later read is judged against the links as they are.
 * Null: the page no longer stands on the version the request claimed; the caller reads before it
 * builds on anything.
 */
export function baseAfterSeamChange(base: CardBase, a: SeamAdoption): CardBase | null {
  if (base.version !== a.expected) return null;
  if (base.card) return { version: a.lockVersion, card: patchCardLinks(base.card, a) };
  if (base.sent)
    return {
      version: a.lockVersion,
      card: null,
      sent: { body: patchSentBody(base.sent.body, a.links, a.seams), echo: base.sent.echo },
    };
  return { version: a.lockVersion, card: null };
}

/**
 * Do the form's steps carry the numbers the card holds, in its order? A step is addressed by the
 * number the last body save gave it; when that save's card was never read back, the form may still
 * hold the numbers from before it. Steps not stored yet (0) are left out: they cannot be addressed.
 */
export function stepNumbersAgree(
  formOps: readonly { operationNumber?: number }[],
  card: common_TechCard,
): boolean {
  const ours = formOps.map((op) => op.operationNumber ?? 0).filter((n) => n > 0);
  const theirs = (card.techCard?.operations ?? [])
    .map((op) => op.operationNumber ?? 0)
    .filter((n) => n > 0);
  return ours.length === theirs.length && ours.every((n, i) => n === theirs[i]);
}

/**
 * The door's step check (index.tsx `hold` / `reread`). Strict: the form's VALUES carry the card's
 * numbers in its order. Past a form that does not validate (C9): its BASELINE does — what the last
 * save or read left — so a step deleted, moved or added in the unsaved form does not refuse a gesture
 * on another step; one whose numbers are older than the card (a save never read back) still does.
 */
export function seamStepsAgreeOf(
  form: Pick<FormLike, 'getValues' | 'control'>,
  card: common_TechCard,
  o?: SeamDoorOpts,
): boolean {
  const values = (form.getValues('operations') ?? []) as StepRow[];
  if (!o?.pastInvalidForm) return stepNumbersAgree(values, card);
  const baseOps = ((form.control._defaultValues as Partial<TechCardFormData>).operations ??
    []) as StepRow[];
  if (!stepNumbersAgree(baseOps, card)) return false;
  // Each live step still carries the number its baseline row (the card) gives it: a save that landed
  // while the steps were moved back leaves the baseline renumbered and the live numbers old — then a
  // live number names ANOTHER server step, and the gesture is refused (Codex, C9).
  const baseNo = new Map(baseOps.map((r) => [r.historyKey, r.operationNumber ?? 0]));
  return values.every((r) => {
    const n = r.operationNumber ?? 0;
    if (!n) return true;
    return r.historyKey !== undefined && baseNo.get(r.historyKey) === n;
  });
}
