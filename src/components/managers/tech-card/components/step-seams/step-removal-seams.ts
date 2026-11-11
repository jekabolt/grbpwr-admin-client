import type { StoredPose, StoredRow, StoredSeam } from 'lib/seams';

import { reuseKeys } from '../assembly-seams/seams-store';

/** A step's links to the card's seam table, as the form holds them. */
export type StepSeamLinks = {
  seamKeys?: readonly string[];
  poseKeys?: readonly string[];
};

/** The seam rows and pose rows a step removal deletes, and its undo brings back. */
export type RemovalSeams = { seams: StoredSeam[]; poses: StoredPose[] };

export type RemovalCard = {
  operations: readonly StepSeamLinks[];
  /** A cut strip names the seam it is cut for: that seam is shared, it stays. */
  cutStrips?: readonly { seamKey?: string }[];
  seams: readonly StoredSeam[];
  poses: readonly StoredPose[];
};

const keysOf = (links: StepSeamLinks | undefined) => [
  ...(links?.seamKeys ?? []),
  ...(links?.poseKeys ?? []),
];

/**
 * C8 («Удалять»): the seams and poses that only the step at `index` links. A row that another step
 * links, or that a cut strip is cut for, is shared and stays. `own` is the step's links as its undo
 * record keeps them (after the binding teardown, `bindingUndoLinks`): rows the teardown already
 * deletes are not named twice. Rows not in the store (unknown keys) are not named at all.
 */
export function seamsOnlyOfStep(
  card: RemovalCard,
  index: number,
  own: StepSeamLinks | undefined = card.operations[index],
): RemovalSeams {
  const mine = new Set(keysOf(own).filter(Boolean));
  if (!mine.size) return { seams: [], poses: [] };
  const shared = new Set<string>();
  card.operations.forEach((op, i) => {
    if (i !== index) for (const key of keysOf(op)) shared.add(key);
  });
  for (const strip of card.cutStrips ?? []) {
    const key = strip.seamKey?.trim();
    if (key) shared.add(key);
  }
  const only = (key: string) => mine.has(key) && !shared.has(key);
  return {
    seams: card.seams.filter((row) => only(row.seamKey)),
    poses: card.poses.filter((row) => only(row.seamKey)),
  };
}

/** Rows for one delete call (`SeamWrites.remove` takes seams and poses together). */
export const removalRows = (r: RemovalSeams): StoredRow[] => [...r.seams, ...r.poses];

/**
 * The keys an undo of the removal may count as on the card: what is there now, plus the rows it
 * writes back itself. Feed this to `removeUndoRefusal`, or every undo refuses «seam deleted».
 */
export function restorableSeamKeys(onCard: ReadonlySet<string>, saved: RemovalSeams): Set<string> {
  return new Set([...onCard, ...removalRows(saved).map((row) => row.seamKey)]);
}

/**
 * True while any seam or pose write is in flight. An optimistic row is not on the server yet: it
 * could stand in for a row the undo must write and then fail. The undo waits («still saving») and
 * plans against the confirmed lists only (`server`, `poses`), never `rowsOf` / `posesOf`.
 */
export function seamWritesInFlight(s: {
  pending: Readonly<Record<string, unknown>>;
  posePending: Readonly<Record<string, unknown>>;
}): boolean {
  return Object.keys(s.pending).length > 0 || Object.keys(s.posePending).length > 0;
}

export type SeamRestorePlan = {
  /** Seam rows to write back, already on the keys `upsert` would put them (`reuseKeys`). */
  seams: StoredSeam[];
  /** Pose rows to write back; a pose keeps its own key. */
  poses: StoredPose[];
  /** The saved seam rows: their keys are resolved again after the write (`restoredKeyMap`). */
  saved: StoredSeam[];
};

/**
 * What an undo writes back before it puts the step back. A row still on the card is not written. A
 * row whose pair is on the card under another key — stored again meanwhile, or a second saved row of
 * the same pair — is not written either: the step links that key (`restoredKeyMap`).
 */
export function seamRestorePlan(
  saved: RemovalSeams,
  now: { seams: readonly StoredSeam[]; poses: readonly StoredPose[] },
): SeamRestorePlan {
  const have: StoredSeam[] = [...now.seams];
  const keys = new Set(have.map((row) => row.seamKey));
  const seams: StoredSeam[] = [];
  for (const row of saved.seams) {
    if (keys.has(row.seamKey)) continue;
    const landed = reuseKeys([row], have)[0];
    if (keys.has(landed.seamKey)) continue;
    const out = structuredClone(landed);
    seams.push(out);
    have.push(out);
    keys.add(out.seamKey);
  }
  const poseKeysNow = new Set(now.poses.map((row) => row.seamKey));
  const poses = saved.poses
    .filter((row) => !poseKeysNow.has(row.seamKey))
    .map((row) => structuredClone(row));
  return { seams, poses, saved: structuredClone(saved.seams) };
}

/**
 * Saved key → the key its pair lives under on the card NOW, read after the write (`upsert` reads the
 * server list again and may land a row on a pair stored meanwhile). `null`: a saved row is on the
 * card under no key, so the step cannot come back whole.
 */
export function restoredKeyMap(
  saved: readonly StoredSeam[],
  seamsNow: readonly StoredSeam[],
): Record<string, string> | null {
  const keys = new Set(seamsNow.map((row) => row.seamKey));
  const map: Record<string, string> = {};
  for (const row of saved) {
    if (keys.has(row.seamKey)) continue;
    const landed = reuseKeys([row], seamsNow)[0].seamKey;
    if (!keys.has(landed)) return null;
    map[row.seamKey] = landed;
  }
  return map;
}

/** The step row as it comes back: its seam links follow `keyMap`, each key once. */
export function relinkRestoredStep<T extends StepSeamLinks>(
  row: T,
  keyMap: Readonly<Record<string, string>>,
): T {
  if (!Object.keys(keyMap).length || !row.seamKeys) return row;
  return { ...row, seamKeys: [...new Set(row.seamKeys.map((key) => keyMap[key] ?? key))] };
}

export type SeamRestoreIo = {
  upsert: (rows: StoredSeam[]) => Promise<boolean>;
  upsertPoses: (rows: StoredPose[]) => Promise<boolean>;
  /** The card's CONFIRMED seam rows after the writes (`useSeamsStore.getState().server`). */
  seamsNow: () => readonly StoredSeam[];
  /** Put the step back (its links through `keyMap`); runs only after every row is written. */
  restoreStep: (keyMap: Readonly<Record<string, string>>) => void;
};

/**
 * Rows before links: the server refuses a step that names a key it does not hold (`unknown_seam`),
 * so the step goes back only after the rows are written, its links read from the card after that.
 * False: a write was refused or a row is not on the card, and the step was not put back (rows
 * written before the refusal stay on the card unlinked, as before C8).
 */
export async function runSeamRestore(plan: SeamRestorePlan, io: SeamRestoreIo): Promise<boolean> {
  if (plan.seams.length && !(await io.upsert(plan.seams))) return false;
  if (plan.poses.length && !(await io.upsertPoses(plan.poses))) return false;
  const keyMap = restoredKeyMap(plan.saved, io.seamsNow());
  if (!keyMap) return false;
  io.restoreStep(keyMap);
  return true;
}
