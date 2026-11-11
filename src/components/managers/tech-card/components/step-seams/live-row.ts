import type { StoredSeam } from 'lib/seams';

import { sewsNothing, type FormOpLike } from './step-seams-model';

/**
 * A row that is still a decision: confirmed, and the server has not marked it stale since. Only a
 * live row lays pieces (step pictures, PDF, doll) or is copied by MIRROR; a stale or rejected one
 * stays listed in the picker, where it is fixed.
 */
export const liveRow = (row: Pick<StoredSeam, 'status' | 'stale'>): boolean =>
  row.status === 'confirmed' && !row.stale;

/**
 * Does this step lay pieces by this row? A live row, and not a join kept on a step that became a
 * press, fuse or button: such a step sews nothing, so its old join lays nothing (the picker still
 * lists it to be detached). A surface row is a part laid on its host and still lays there.
 */
export const laysRow = (
  op: FormOpLike | undefined,
  row: Pick<StoredSeam, 'status' | 'stale' | 'kind'>,
): boolean => liveRow(row) && (row.kind === 'surface' || !sewsNothing(op));
