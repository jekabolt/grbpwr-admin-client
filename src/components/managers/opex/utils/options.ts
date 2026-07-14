import { decimalToInput } from 'utils/decimal';
import { OpexLine } from 'api/proto-http/admin';

// Suggested OPEX categories (free text — the backend groups by whatever string is sent).
// Mirrors the canonical taxonomy documented on OpexLineInsert.category in the proto, so
// dashboard bucketing on those strings files UI-created lines into the right bucket.
export const opexCategoryOptions = [
  'salaries',
  'rent',
  'software',
  'marketing_other',
  'production_content',
  'taxes',
  'bank_fees',
  'professional_services',
  'logistics_office',
  'other',
];

export const opexCategoryLabel = (c?: string) => (c || 'other').replace(/_/g, ' ');

// Months are YYYY-MM in the UI. new Date() is available in the app runtime (only workflow scripts
// forbid it). Local date parts, not toISOString(): the user's "this month" is their wall-clock
// month, and UTC flips it around midnight on the 1st in non-UTC timezones.
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  // The Date is UTC midnight of the 1st; format in UTC too, or UTC-negative zones
  // render the previous month's name over this month's data.
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

// A recurring-materialised line is read-only here (owned by the worker); manual lines are editable.
export const isRecurringLine = (l: OpexLine) => !!l.recurringId;

// Sum a set of lines' base amounts, flagging any line the backend left uncosted (no FX rate).
export function sumBase(lines: OpexLine[]): { total: number; uncosted: number } {
  let total = 0;
  let uncosted = 0;
  for (const l of lines) {
    if (l.costed === false || !l.amountBase?.value) uncosted += 1;
    total += Number(decimalToInput(l.amountBase)) || 0;
  }
  return { total, uncosted };
}
