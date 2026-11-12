import type { StoredPose, StoredRow, StoredSeam } from 'lib/seams';

import type { OwedStepRemoval } from './card-owed';
import type { SeamChangeInput, SeamChangeResult } from './assembly-seams/seam-change';
import type { SeamChange, StepRef } from './assembly-seams/seam-change-plan';
import { reuseKeys, useSeamsStore } from './assembly-seams/seams-store';
import { heldSeamKeys } from './step-seams/step-removal-seams';

export type StepLinkRow = {
  historyKey?: string;
  operationNumber?: number;
  seamKeys?: readonly string[];
  poseKeys?: readonly string[];
};

export type StepRemovalRows = { seams: StoredSeam[]; poses: StoredPose[] };

export type StepRemovalSnapshot<TRow extends StepLinkRow> = {
  step: StepRef;
  row: TRow;
  rows: StepRemovalRows;
  operationNumber: number;
  candidateKeys: readonly string[];
};

export const SERVER_DID_NOT_ANSWER = 'the server did not answer';

const refusalOf = (error: unknown): string =>
  error instanceof Error ? error.message.replace(/^Error:\s*/, '') : SERVER_DID_NOT_ANSWER;

export const linkKeys = (row: StepLinkRow): string[] => [
  ...new Set([...(row.seamKeys ?? []), ...(row.poseKeys ?? [])].filter(Boolean)),
];

/** The confirmed seam and pose payloads linked by the step before its removal changes anything. */
export function linkedStepRows(
  row: StepLinkRow,
  stored: { seams: readonly StoredSeam[]; poses: readonly StoredPose[] },
): StepRemovalRows {
  const linked = new Set(linkKeys(row));
  return {
    seams: structuredClone(stored.seams.filter((seam) => linked.has(seam.seamKey))),
    poses: structuredClone(stored.poses.filter((pose) => linked.has(pose.seamKey))),
  };
}

/** Join row snapshots by key without sending the same row twice on a later undo. */
export function mergeStepRemovalRows(...groups: readonly StepRemovalRows[]): StepRemovalRows {
  const seams = new Map<string, StoredSeam>();
  const poses = new Map<string, StoredPose>();
  for (const group of groups) {
    for (const row of group.seams) seams.set(row.seamKey, structuredClone(row));
    for (const row of group.poses) poses.set(row.seamKey, structuredClone(row));
  }
  return { seams: [...seams.values()], poses: [...poses.values()] };
}

export type StepRemovalIo<TSnapshot> = {
  /** Older seam writes settle before the snapshot; false is the bounded wait's refusal. */
  settle: () => Promise<boolean>;
  snapshot: () => TSnapshot | null;
  /** One synchronous form edit: binding teardown first, then the step removal. */
  remove: (snapshot: TSnapshot) => void;
  /** The undo record is pushed before durable cleanup is recorded. */
  record: (snapshot: TSnapshot) => void;
  owe: (snapshot: TSnapshot) => void;
  refuse: (why: string) => void;
  unsettled: string;
};

/** Remove a step as a pure form edit. No seam request belongs to this phase. */
export async function runStepRemovalChange<TSnapshot>(
  io: StepRemovalIo<TSnapshot>,
): Promise<boolean> {
  if (!(await io.settle())) {
    io.refuse(io.unsettled);
    return false;
  }
  const snapshot = io.snapshot();
  if (!snapshot) return false;
  io.remove(snapshot);
  io.record(snapshot);
  io.owe(snapshot);
  return true;
}

/** Redo takes a fresh snapshot and repeats the same form-only removal. */
export function runStepRemovalRedoChange<TSnapshot>(
  io: StepRemovalIo<TSnapshot>,
): Promise<boolean> {
  return runStepRemovalChange(io);
}

type RemovalRestorePlan = {
  upsert: StoredRow[];
  keyMap: Map<string, string>;
};

/** Missing rows for the single undo upsert; shared rows already on the card are only relinked. */
export function stepRemovalRestorePlan(
  saved: StepRemovalRows,
  now: { seams: readonly StoredSeam[]; poses: readonly StoredPose[] },
): RemovalRestorePlan {
  const upsert: StoredRow[] = [];
  const keyMap = new Map<string, string>();
  const seams = [...now.seams];
  const seamKeys = new Set(seams.map((row) => row.seamKey));
  for (const savedRow of saved.seams) {
    const row = reuseKeys([savedRow], seams)[0];
    keyMap.set(savedRow.seamKey, row.seamKey);
    if (seamKeys.has(row.seamKey)) continue;
    const cloned = structuredClone(row);
    upsert.push(cloned);
    seams.push(cloned);
    seamKeys.add(cloned.seamKey);
  }
  const poseKeys = new Set(now.poses.map((row) => row.seamKey));
  for (const savedRow of saved.poses) {
    keyMap.set(savedRow.seamKey, savedRow.seamKey);
    if (!poseKeys.has(savedRow.seamKey)) upsert.push(structuredClone(savedRow));
  }
  return { upsert, keyMap };
}

/** Map every link restored by the body, including pose keys. */
export function mapStepRemovalRow<TRow extends StepLinkRow>(
  row: TRow,
  keyMap: ReadonlyMap<string, string>,
): TRow {
  const map = (keys: readonly string[] | undefined) =>
    keys ? [...new Set(keys.map((key) => keyMap.get(key) ?? key))] : keys;
  return {
    ...structuredClone(row),
    ...(row.seamKeys ? { seamKeys: map(row.seamKeys) } : {}),
    ...(row.poseKeys ? { poseKeys: map(row.poseKeys) } : {}),
  } as TRow;
}

export type StepRemovalUndoIo<TRow extends StepLinkRow, TInserted> = {
  /** Frozen, sequence and missing-piece validation runs before any wait or write. */
  validate: () => string | null;
  /** Waits for a cleanup already in the seam queue, then for every older seam write. */
  settle: () => Promise<boolean>;
  rows: () => { seams: readonly StoredSeam[]; poses: readonly StoredPose[] };
  change: (input: SeamChangeInput) => Promise<SeamChangeResult>;
  restore: (row: TRow, keyMap: ReadonlyMap<string, string>) => TInserted;
  clearOwed: () => void;
  finishHistory: () => void;
  select: (inserted: TInserted) => void;
  refuse: (why: string) => void;
  unsettled: string;
};

/**
 * Before cleanup, every row is still present and undo is a form edit. After cleanup, all missing
 * rows are restored in one change; only its success is allowed to touch the form or history.
 */
export async function runStepRemovalUndoChange<TRow extends StepLinkRow, TInserted>(
  snapshot: StepRemovalSnapshot<TRow>,
  io: StepRemovalUndoIo<TRow, TInserted>,
): Promise<boolean> {
  const refused = io.validate();
  if (refused) {
    io.refuse(refused);
    return false;
  }
  if (!(await io.settle())) {
    io.refuse(io.unsettled);
    return false;
  }
  const refusedAfterWait = io.validate();
  if (refusedAfterWait) {
    io.refuse(refusedAfterWait);
    return false;
  }

  const plan = stepRemovalRestorePlan(snapshot.rows, io.rows());
  const keyMap = new Map(plan.keyMap);
  if (plan.upsert.length) {
    let changed: SeamChangeResult;
    try {
      changed = await io.change({ upsert: plan.upsert });
    } catch (error) {
      io.refuse(refusalOf(error));
      return false;
    }
    if (!changed.ok) {
      io.refuse(changed.why);
      return false;
    }
    for (const [savedKey, plannedKey] of plan.keyMap) {
      keyMap.set(savedKey, changed.keyMap.get(plannedKey) ?? plannedKey);
    }
  }

  // C5: restored rows may remain unlinked until the next body save. No cleanup debt may survive
  // into that window, including when the form is invalid or the page reloads.
  io.clearOwed();
  const inserted = io.restore(mapStepRemovalRow(snapshot.row, keyMap), keyMap);
  io.finishHistory();
  io.select(inserted);
  return true;
}

type CleanupOperation = Pick<StepLinkRow, 'operationNumber' | 'seamKeys' | 'poseKeys'>;

/** The stored step is still present when its old number still carries one of its cleanup rows. */
export function savedRemovalStillPresent(
  entry: OwedStepRemoval,
  operations: readonly CleanupOperation[],
): boolean {
  if (!entry.candidateKeys.length) return false;
  const candidates = new Set(entry.candidateKeys);
  const operation = operations.find((row) => row.operationNumber === entry.operationNumber);
  return !!operation && linkKeys(operation).some((key) => candidates.has(key));
}

type CleanupStrip = { seamKey?: string };

/** Candidate rows that exist and that nothing in the saved body holds (`heldSeamKeys`). */
export function stepRemovalCleanupKeys(
  entry: OwedStepRemoval,
  operations: readonly CleanupOperation[],
  rows: StepRemovalRows,
  cutStrips: readonly CleanupStrip[],
): string[] {
  const held = heldSeamKeys({ operations, cutStrips });
  const stored = new Set([...rows.seams, ...rows.poses].map((row) => row.seamKey));
  return [...new Set(entry.candidateKeys)].filter((key) => stored.has(key) && !held.has(key));
}

const cleanupRetryable = (why: string): boolean => {
  const value = why.toLowerCase();
  return (
    value.includes('lock_version_moved') ||
    value.includes('server did not answer') ||
    value.includes('failed to fetch') ||
    value.includes('network') ||
    value.includes('still saving') ||
    value.includes('fix ') ||
    value.includes('kept changing')
  );
};

export type StepRemovalCleanupIo = {
  active: () => boolean;
  operations: () => readonly CleanupOperation[];
  /** The saved body's cut strips: a strip measured from a candidate holds it like a step link. */
  cutStrips: () => readonly CleanupStrip[];
  rows: () => StepRemovalRows;
  change: (input: SeamChangeInput) => Promise<SeamChangeResult>;
  clear: () => void;
};

/**
 * The only step-removal phase that deletes rows. The functional change is rebuilt after the body
 * flush inside the seam queue and again after lock_version_moved, so its unlink guard is always the
 * saved operation list at send time. The unresolved removed-step link is a local no-request guard
 * when a later saved body linked every candidate while this cleanup waited in the queue.
 */
export async function runStepRemovalCleanup(
  entry: OwedStepRemoval,
  io: StepRemovalCleanupIo,
): Promise<boolean> {
  if (!io.active()) return true;
  let lastKeys = stepRemovalCleanupKeys(entry, io.operations(), io.rows(), io.cutStrips());
  // Every candidate is already linked again or gone: nothing to delete, nothing to queue.
  if (!lastKeys.length || !entry.candidateKeys.length) {
    io.clear();
    return true;
  }
  let builds = 0;
  const build = (): SeamChange => {
    builds += 1;
    lastKeys = stepRemovalCleanupKeys(entry, io.operations(), io.rows(), io.cutStrips());
    return lastKeys.length
      ? { delete: lastKeys }
      : { link: [{ step: { historyKey: entry.historyKey }, seamKey: entry.candidateKeys[0] }] };
  };
  let changed: SeamChangeResult;
  try {
    changed = await io.change(build);
  } catch {
    return false;
  }
  // The first build supplies optimistic state. Only a later build proves that the body flush ran
  // and that its saved links leave no row to delete.
  if (changed.ok || (builds > 1 && !lastKeys.length)) {
    io.clear();
    return true;
  }
  // A transient queue, validation or network refusal retries after the next successful body save.
  // A server contradiction is stable for this debt and is dropped silently instead of spinning.
  if (!cleanupRetryable(changed.why)) io.clear();
  return false;
}

/**
 * A cleanup refusal is silent: `runSeamChange` marks the refused rows with errors even for a quiet
 * caller, so this debt's errors are lifted once its pending state settled.
 */
export function quietCleanupChange(
  candidateKeys: readonly string[],
  write: (input: SeamChangeInput) => Promise<SeamChangeResult>,
): (input: SeamChangeInput) => Promise<SeamChangeResult> {
  return async (input) => {
    const result = await write(input);
    if (!result.ok) {
      const state = useSeamsStore.getState();
      const errors = { ...state.errors };
      for (const key of candidateKeys) delete errors[key];
      useSeamsStore.setState({ errors });
    }
    return result;
  };
}
