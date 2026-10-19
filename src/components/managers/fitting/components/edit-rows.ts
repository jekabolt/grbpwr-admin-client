import type { common_FittingChangeRequest } from 'api/proto-http/admin';
import type { FittingFormData } from './schema';

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

export type EditCategory = '' | 'pattern' | 'construction' | 'material' | 'grading' | 'other';

const categories = new Set<EditCategory>([
  '',
  'pattern',
  'construction',
  'material',
  'grading',
  'other',
]);

export function categoryOf(target: string): EditCategory {
  const normalized = target.trim().toLowerCase();
  return categories.has(normalized as EditCategory) ? (normalized as EditCategory) : 'other';
}

function positiveNumber(value?: number): number {
  return value != null && value > 0 ? value : 0;
}

function statusOf(cr: common_FittingChangeRequest): EditRow['status'] {
  if (cr.status === 'open' || cr.status === 'resolved') return cr.status;
  return cr.resolved ? 'resolved' : 'open';
}

function rowFromChangeRequest(
  cr: common_FittingChangeRequest,
  number: number,
  callout: EditRow['callout'],
): EditRow {
  return {
    number,
    crId: cr.id ?? 0,
    note: cr.note ?? '',
    target: cr.target ?? '',
    status: statusOf(cr),
    carriedFromId: cr.carriedFromId ?? 0,
    callout,
    mediaId: callout?.value.mediaId ?? 0,
  };
}

function rowFromLegacyCallout(callout: NonNullable<EditRow['callout']>, number: number): EditRow {
  return {
    number,
    crId: 0,
    note: callout.value.note ?? '',
    target: '',
    status: 'open',
    carriedFromId: 0,
    callout,
    mediaId: callout.value.mediaId ?? 0,
  };
}

export function buildEditRows(
  callouts: FormCallout[],
  changeRequests: common_FittingChangeRequest[],
): EditRow[] {
  const firstCalloutByNumber = new Map<number, NonNullable<EditRow['callout']>>();
  let maxPersistedNumber = 0;

  callouts.forEach((value, index) => {
    const number = positiveNumber(value.number);
    maxPersistedNumber = Math.max(maxPersistedNumber, number);
    if (number && !firstCalloutByNumber.has(number)) {
      firstCalloutByNumber.set(number, { index, value });
    }
  });
  for (const cr of changeRequests) {
    maxPersistedNumber = Math.max(maxPersistedNumber, positiveNumber(cr.calloutNumber));
  }

  const rows: EditRow[] = [];
  const numberedRequests = changeRequests.filter((cr) => positiveNumber(cr.calloutNumber));
  const unnumberedRequests = changeRequests
    .map((cr, index) => ({ cr, index }))
    .filter(({ cr }) => !positiveNumber(cr.calloutNumber))
    .sort((a, b) => (a.cr.id ?? 0) - (b.cr.id ?? 0) || a.index - b.index);

  for (const cr of numberedRequests) {
    const number = positiveNumber(cr.calloutNumber);
    rows.push(rowFromChangeRequest(cr, number, firstCalloutByNumber.get(number) ?? null));
  }

  let nextDisplayNumber = maxPersistedNumber + 1;
  for (const { cr } of unnumberedRequests) {
    rows.push(rowFromChangeRequest(cr, nextDisplayNumber, null));
    nextDisplayNumber += 1;
  }

  const requestNumbers = new Set(numberedRequests.map((cr) => positiveNumber(cr.calloutNumber)));
  for (const [number, callout] of firstCalloutByNumber) {
    if (!requestNumbers.has(number)) rows.push(rowFromLegacyCallout(callout, number));
  }

  callouts.forEach((value, index) => {
    if (positiveNumber(value.number)) return;
    rows.push(rowFromLegacyCallout({ index, value }, nextDisplayNumber));
    nextDisplayNumber += 1;
  });

  return rows.sort((a, b) => a.number - b.number);
}

// Next free edit number across callouts and change requests.
export function nextEditNumber(
  callouts: FormCallout[],
  changeRequests: common_FittingChangeRequest[],
): number {
  return buildEditRows(callouts, changeRequests).reduce(
    (next, row) => Math.max(next, row.number + 1),
    1,
  );
}
