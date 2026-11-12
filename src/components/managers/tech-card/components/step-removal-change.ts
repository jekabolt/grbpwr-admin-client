import type { StoredPose, StoredSeam } from 'lib/seams';

import type { SeamChangeInput, SeamChangeResult } from './assembly-seams/seam-change';
import type { SeamChange, StepRef } from './assembly-seams/seam-change-plan';

export type StepLinkRow = {
  historyKey?: string;
  seamKeys?: readonly string[];
  poseKeys?: readonly string[];
};

export type StepRemovalRows = { seams: StoredSeam[]; poses: StoredPose[] };

export type StepRemovalSnapshot<TRow extends StepLinkRow> = {
  step: StepRef;
  row: TRow;
  rows: StepRemovalRows;
  /**
   * Rows the removal deletes outright in the same change (a binding step's strip seams). They are
   * not on `row` and never come back with an undo.
   */
  alsoDelete?: readonly string[];
};

export const SERVER_DID_NOT_ANSWER = 'the server did not answer';

const refusalOf = (error: unknown): string =>
  error instanceof Error ? error.message.replace(/^Error:\s*/, '') : SERVER_DID_NOT_ANSWER;

const linkKeys = (row: StepLinkRow): string[] => [
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

/** Only rows the server deleted with the last detach belong to the undo record. */
export function deletedStepRows(
  rows: StepRemovalRows,
  deletedKeys: readonly string[],
): StepRemovalRows {
  const deleted = new Set(deletedKeys);
  return {
    seams: rows.seams.filter((row) => deleted.has(row.seamKey)),
    poses: rows.poses.filter((row) => deleted.has(row.seamKey)),
  };
}

/** Rebuilt after the flush so every StepRef is resolved from the saved form. */
export function detachStepChange(
  step: StepRef,
  row: StepLinkRow,
  alsoDelete: readonly string[] = [],
): SeamChange {
  const deleted = new Set(alsoDelete);
  return {
    ...(deleted.size ? { delete: [...deleted] } : {}),
    // A row deleted in this change is not detached as well: one row, one verb.
    detach: linkKeys(row)
      .filter((seamKey) => !deleted.has(seamKey))
      .map((seamKey) => ({ step, seamKey })),
  };
}

/** Rebuilt after the provisional step is flushed and receives its operation number. */
export function restoreStepChange(
  step: StepRef,
  row: StepLinkRow,
  rows: StepRemovalRows,
): SeamChange {
  return {
    upsert: [...rows.seams, ...rows.poses],
    link: linkKeys(row).map((seamKey) => ({ step, seamKey })),
  };
}

export type StepRemovalIo<
  TRow extends StepLinkRow,
  TSnapshot extends StepRemovalSnapshot<TRow> = StepRemovalSnapshot<TRow>,
> = {
  /** Older seam writes settle before the snapshot; false is the bounded wait's refusal. */
  settle: () => Promise<boolean>;
  snapshot: () => TSnapshot | null;
  change: (input: SeamChangeInput) => Promise<SeamChangeResult>;
  remove: (snapshot: TSnapshot) => void;
  record: (snapshot: TSnapshot, deleted: StepRemovalRows) => void;
  refuse: (why: string) => void;
  unsettled: string;
};

/** Remove a step only after its one detach change commits. */
export async function runStepRemovalChange<
  TRow extends StepLinkRow,
  TSnapshot extends StepRemovalSnapshot<TRow>,
>(io: StepRemovalIo<TRow, TSnapshot>): Promise<boolean> {
  if (!(await io.settle())) {
    io.refuse(io.unsettled);
    return false;
  }
  const snapshot = io.snapshot();
  if (!snapshot) return false;
  let changed: SeamChangeResult;
  try {
    changed = await io.change(() =>
      detachStepChange(snapshot.step, snapshot.row, snapshot.alsoDelete),
    );
  } catch (error) {
    io.refuse(refusalOf(error));
    return false;
  }
  if (!changed.ok) {
    io.refuse(changed.why);
    return false;
  }
  const deleted = deletedStepRows(snapshot.rows, changed.deletedKeys);
  io.remove(snapshot);
  io.record(snapshot, deleted);
  return true;
}

/** Redo takes a fresh snapshot and performs the same server-authoritative removal. */
export function runStepRemovalRedoChange<
  TRow extends StepLinkRow,
  TSnapshot extends StepRemovalSnapshot<TRow>,
>(io: StepRemovalIo<TRow, TSnapshot>): Promise<boolean> {
  return runStepRemovalChange(io);
}

export type StepRemovalUndoIo<TRow extends StepLinkRow, TInserted> = {
  validate: () => string | null;
  insert: (row: TRow) => TInserted;
  change: (input: SeamChangeInput) => Promise<SeamChangeResult>;
  remove: (inserted: TInserted) => void;
  finishHistory: () => void;
  select: (inserted: TInserted) => void;
  refuse: (why: string) => void;
};

/** Restore the linkless step first, then restore all of its rows and links in one change. */
export async function runStepRemovalUndoChange<TRow extends StepLinkRow, TInserted>(
  snapshot: StepRemovalSnapshot<TRow>,
  io: StepRemovalUndoIo<TRow, TInserted>,
): Promise<boolean> {
  const refused = io.validate();
  if (refused) {
    io.refuse(refused);
    return false;
  }
  const provisional = {
    ...structuredClone(snapshot.row),
    seamKeys: [],
    poseKeys: [],
  } as TRow;
  const inserted = io.insert(provisional);
  const compensate = () => {
    // Known limit: the flush may already have saved the provisional step. Removing it here is a
    // compensating form edit; the next autosave removes that stored provisional step.
    io.remove(inserted);
  };
  let changed: SeamChangeResult;
  try {
    changed = await io.change(() => restoreStepChange(snapshot.step, snapshot.row, snapshot.rows));
  } catch (error) {
    compensate();
    io.refuse(refusalOf(error));
    return false;
  }
  if (!changed.ok) {
    compensate();
    io.refuse(changed.why);
    return false;
  }
  io.finishHistory();
  io.select(inserted);
  return true;
}
