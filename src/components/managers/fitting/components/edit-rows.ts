import { common_FittingChangeRequest } from 'api/proto-http/admin';
import { FittingFormData } from './schema';

// LANE D owns this file. Contract only — the stub below is replaced by the real join.

export type FormCallout = NonNullable<FittingFormData['callouts']>[number];

// One row of the Edits list: an edit (change request) and/or the mark with the same number.
export type EditRow = {
  number: number;
  // 0 = no change request yet (a legacy fit note that is only a callout).
  crId: number;
  note: string;
  target: string;
  status: 'open' | 'resolved';
  carriedFromId: number;
  // The mark drawn for this edit, with its index in form `callouts`; null = text-only edit.
  callout: { index: number; value: FormCallout } | null;
  // 0 when the edit has no mark.
  mediaId: number;
};

export function buildEditRows(
  _callouts: FormCallout[],
  _changeRequests: common_FittingChangeRequest[],
): EditRow[] {
  return [];
}

// Next free edit number across callouts and change requests.
export function nextEditNumber(
  callouts: FormCallout[],
  changeRequests: common_FittingChangeRequest[],
): number {
  let max = 0;
  for (const c of callouts) max = Math.max(max, c.number ?? 0);
  for (const cr of changeRequests) max = Math.max(max, cr.calloutNumber ?? 0);
  return max + 1;
}
