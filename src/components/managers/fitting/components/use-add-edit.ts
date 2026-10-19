import { PendingMark } from './workspace';

// LANE C owns this file. Contract only: adds one edit — takes the next number, turns the mark
// (if any) into a form callout with that number and saves it, then AddFittingChangeRequest with
// calloutNumber = number. Used by the composer and by draft ✓ / «add all».
export type AddEditInput = { note: string; target?: string; mark?: PendingMark | null };

export function useAddEdit(): (input: AddEditInput) => Promise<void> {
  return async () => {};
}
