import type { StoredSeam } from 'lib/seams';

/**
 * A row that is still a decision: confirmed, and the server has not marked it stale since. Only a
 * live row lays pieces (step pictures, PDF, doll) or is copied by MIRROR; a stale or rejected one
 * stays listed in the picker, where it is fixed.
 */
export const liveRow = (row: Pick<StoredSeam, 'status' | 'stale'>): boolean =>
  row.status === 'confirmed' && !row.stale;
