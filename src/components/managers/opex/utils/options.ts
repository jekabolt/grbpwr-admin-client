import { CostingFxRate, OpexLine } from 'api/proto-http/admin';
import { currencySymbols, EXPENSE_CURRENCIES } from 'constants/constants';
import { decimalToInput } from 'utils/decimal';

// Suggested OPEX categories. This is a CLOSED set: the backend (dto.ConvertPbOpexLinesToEntity /
// ConvertPbOpexRecurringToEntity) validates every category against entity.ValidOpexCategories and
// rejects anything else with InvalidArgument — so the UI must offer a fixed select, never free text.
// marketing spend is deliberately absent: it lives in channel_spend and is subtracted separately.
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

// {value,label} form for a <select>.
export const opexCategorySelectOptions = opexCategoryOptions.map((c) => ({
  value: c,
  label: opexCategoryLabel(c),
}));

// OPEX books COSTS, so its currency picker uses the shared EXPENSE currency list (every selling fiat
// currency plus the accounting-only USDT). This was previously a hand-maintained local list that
// drifted from the shared constants; deriving it keeps OPEX, employees and every other expense
// surface on one source of truth. Kept as {value,label} for the <select>.
export const opexCurrencyOptions = EXPENSE_CURRENCIES.map((c) => ({
  value: c.value,
  label: c.label,
}));

export const opexCurrencySymbol = (code?: string) =>
  (code && currencySymbols[code.toUpperCase()]) || code || '';

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

// Short month label ("Jul 2026") for compact chips/cards.
export function monthLabelShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

// A recurring-materialised line is read-only here (owned by the worker); manual lines are editable.
export const isRecurringLine = (l: OpexLine) => !!l.recurringId;

// A line is "uncosted" when the backend could not fold it to base (no FX rate for its currency that
// month): amountBase is null / costed=false. Such a line is excluded from the operating result.
export const isUncostedLine = (l: OpexLine) => l.costed === false || !l.amountBase?.value;

// Sum a set of lines' base amounts, flagging any line the backend left uncosted (no FX rate).
export function sumBase(lines: OpexLine[]): { total: number; uncosted: number } {
  let total = 0;
  let uncosted = 0;
  for (const l of lines) {
    if (isUncostedLine(l)) uncosted += 1;
    total += Number(decimalToInput(l.amountBase)) || 0;
  }
  return { total, uncosted };
}

export type OpexCategorySummary = {
  category: string;
  total: number;
  count: number;
  uncosted: number;
};

export type OpexSummary = {
  total: number;
  uncosted: number;
  count: number;
  oneOffTotal: number;
  oneOffCount: number;
  recurringTotal: number;
  recurringCount: number;
  byCategory: OpexCategorySummary[];
};

// Aggregate a month's lines into the numbers the summary card needs: overall base total, the split
// between worker-booked recurring lines and hand-entered one-offs, per-category subtotals (sorted
// biggest first), and how many lines the backend left uncosted.
export function summarizeLines(lines: OpexLine[]): OpexSummary {
  const cats = new Map<string, OpexCategorySummary>();
  let total = 0;
  let uncosted = 0;
  let oneOffTotal = 0;
  let oneOffCount = 0;
  let recurringTotal = 0;
  let recurringCount = 0;

  for (const l of lines) {
    const base = Number(decimalToInput(l.amountBase)) || 0;
    const isUncosted = isUncostedLine(l);
    total += base;
    if (isUncosted) uncosted += 1;

    if (isRecurringLine(l)) {
      recurringTotal += base;
      recurringCount += 1;
    } else {
      oneOffTotal += base;
      oneOffCount += 1;
    }

    const key = l.category || 'other';
    const c = cats.get(key) ?? { category: key, total: 0, count: 0, uncosted: 0 };
    c.total += base;
    c.count += 1;
    if (isUncosted) c.uncosted += 1;
    cats.set(key, c);
  }

  const byCategory = [...cats.values()].sort(
    (a, b) => b.total - a.total || a.category.localeCompare(b.category),
  );
  return {
    total,
    uncosted,
    count: lines.length,
    oneOffTotal,
    oneOffCount,
    recurringTotal,
    recurringCount,
    byCategory,
  };
}

// Money formatting with thousands separators and 2 decimals, e.g. 12_345.6 -> "12,345.60".
export function formatMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

// latestRateToBase picks the manual costing FX rate for `currency` effective today (latest
// valid_from on or before now), mirroring the server's rateAsOf. Returns null when no rate exists —
// the caller can then warn that an OPEX line in that currency will be booked uncosted. `base` (and
// an empty currency) map to 1:1.
export function latestRateToBase(
  rates: CostingFxRate[],
  currency: string,
  base: string,
): number | null {
  const cur = (currency || '').toUpperCase();
  const b = (base || '').toUpperCase();
  if (!cur || cur === b) return 1;
  const now = Date.now();
  let best: { at: number; rate: number } | null = null;
  for (const r of rates) {
    if ((r.currency || '').toUpperCase() !== cur) continue;
    const at = r.validFrom ? new Date(r.validFrom).getTime() : 0;
    if (Number.isFinite(at) && at <= now && (!best || at > best.at)) {
      const rate = Number(r.rateToBase?.value);
      if (Number.isFinite(rate)) best = { at, rate };
    }
  }
  return best ? best.rate : null;
}
