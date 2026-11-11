import { Employee, EmployeeInsert, OpexRecurring } from 'api/proto-http/admin';
import {
  currentMonth,
  formatMoney,
  latestRateToBase,
} from 'components/managers/opex/utils/options';
import { decimalToInput } from 'utils/decimal';

/**
 * The data rules of the employee registry, unchanged from the card-grid screen (empList v2 /
 * empKpi v1 / empAnomaly v1 / empSalary v3): `default_monthly_cost` is only a template pre-fill hint,
 * the OpexRecurring journal stays the single source of truth for booked cost, and «left» is an
 * `employment_end` in the past.
 */

// Column limits mirror the backend (dto.ConvertPbEmployeeToEntity / g25-09): an over-long value must
// be a clean client-side error, not a backend InvalidArgument surfaced as a failed save.
export const MAX_NAME = 191;
export const MAX_ROLE = 64;
export const MAX_NOTE = 255;

export const day = (v?: string) => (v ? v.slice(0, 10) : '');
export const toMonth = (v?: string) => (v ? v.slice(0, 7) : '');
export const monthFirst = (v?: string) => {
  const m = toMonth(v);
  return m ? `${m}-01` : '';
};

/** Value + currency CODE (the design's money rule: never a symbol). */
export const money = (n: number, code?: string) =>
  `${formatMoney(n)} ${(code || '').toUpperCase()}`.trim();

/** YYYY-MM-DD from local wall-clock parts; such strings compare lexicographically as dates. */
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function todayISO(): string {
  return isoOf(new Date());
}

/** A YYYY-MM-DD as a local date (for the wheel picker); undefined when empty or broken. */
export function dateOf(iso?: string): Date | undefined {
  const d = day(iso);
  if (!d) return undefined;
  const [y, m, dd] = d.split('-').map(Number);
  if (!y || !m || !dd) return undefined;
  return new Date(y, m - 1, dd);
}

/** Whole months between two YYYY-MM-DD dates, floored (a partial final month doesn't round up). */
export function monthsBetween(startISO: string, endISO: string): number {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  if (!sy || !ey) return 0;
  let months = (ey - sy) * 12 + (em - sm);
  if (ed < sd) months -= 1;
  return months;
}

/** Months of tenure from employment start to end-or-today; null when no start on file. */
export function tenureMonths(start?: string, end?: string): number | null {
  const s = day(start);
  if (!s) return null;
  return Math.max(0, monthsBetween(s, day(end) || todayISO()));
}

/** «2y 3m», «2y», «3m», «<1m»; empty when no start on file. */
export function tenureLabel(start?: string, end?: string): string {
  const months = tenureMonths(start, end);
  if (months == null) return '';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y > 0 && m > 0) return `${y}y ${m}m`;
  if (y > 0) return `${y}y`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

/** «Jan 15, 2026»; UTC formatting so a negative-offset timezone can't render the previous day. */
export function fmtDate(iso?: string): string {
  const d = day(iso);
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number);
  if (!y || !m || !dd) return d;
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** An employee whose employment_end is in the past has left, even if not archived. */
export const hasLeft = (e?: EmployeeInsert) => {
  const end = day(e?.employmentEnd);
  return !!end && end < todayISO();
};

/**
 * Is a salary template booking a line in the current month? (active_from ≤ now ≤ active_to|open) —
 * mirrors recurring-tab's own activeThisMonth so the «booked / month» figure here matches OPEX.
 */
export function activeThisMonth(r: OpexRecurring): boolean {
  const from = toMonth(r.recurring?.activeFrom);
  const to = toMonth(r.recurring?.activeTo);
  const now = currentMonth();
  if (!from || from > now) return false;
  if (to && to < now) return false;
  return true;
}

/**
 * What OPEX says about a person's salary, from the (non-archived) recurring templates linked to
 * their id. `activeTemplates` book cost this month (the real figure); `linkedButInactive` are linked
 * but future-dated or ended; `uncosted` counts active templates whose currency has no FX rate today.
 */
export type SalaryInfo = {
  activeTemplates: OpexRecurring[];
  linkedButInactive: OpexRecurring[];
  bookedBase: number;
  uncosted: number;
};

export type FxRates = Parameters<typeof latestRateToBase>[0];

export function salaryMap(
  recurring: OpexRecurring[],
  fxRates: FxRates,
  base: string,
): Map<number, SalaryInfo> {
  const linked = new Map<number, OpexRecurring[]>();
  for (const t of recurring) {
    const eid = t.recurring?.employeeId;
    if (t.archived || !eid) continue;
    const list = linked.get(eid) ?? [];
    list.push(t);
    linked.set(eid, list);
  }
  const map = new Map<number, SalaryInfo>();
  for (const [eid, templates] of linked) {
    const info: SalaryInfo = {
      activeTemplates: [],
      linkedButInactive: [],
      bookedBase: 0,
      uncosted: 0,
    };
    for (const t of templates) {
      if (!activeThisMonth(t)) {
        info.linkedButInactive.push(t);
        continue;
      }
      info.activeTemplates.push(t);
      const amount = Number(decimalToInput(t.recurring?.amount)) || 0;
      const rate = latestRateToBase(fxRates, t.recurring?.currency || '', base);
      if (rate == null) info.uncosted += 1;
      else info.bookedBase += amount * rate;
    }
    map.set(eid, info);
  }
  return map;
}

/**
 * THE MONTHLY COST A TILE SHOWS. Booked (the salary templates booking this month, in base) when
 * there is one; otherwise the default monthly cost as typed (a pre-fill hint, never a booked cost).
 * `base` is the figure folded into base for sorting (null when it cannot be costed).
 */
export type CostView = {
  kind: 'booked' | 'default' | 'none';
  amount: number;
  currency: string;
  base: number | null;
};

export function costOf(
  e: EmployeeInsert | undefined,
  salary: SalaryInfo | undefined,
  base: string,
  fxRates: FxRates,
): CostView {
  if (salary && salary.activeTemplates.length > 0)
    return { kind: 'booked', amount: salary.bookedBase, currency: base, base: salary.bookedBase };
  const str = decimalToInput(e?.defaultMonthlyCost);
  if (!str) return { kind: 'none', amount: 0, currency: base, base: null };
  const amount = Number(str) || 0;
  const currency = (e?.defaultCurrency || base).toUpperCase();
  const rate = latestRateToBase(fxRates, currency, base);
  return { kind: 'default', amount, currency, base: rate == null ? null : amount * rate };
}

/** A salary problem of one person, as one red word on the tile (empAnomaly v1). */
export function anomalyOf(e: EmployeeInsert | undefined, salary?: SalaryInfo): string | null {
  const left = hasLeft(e);
  const booked = (salary?.activeTemplates.length ?? 0) > 0;
  if (left && booked) return 'Still Booking';
  if (booked && (salary?.uncosted ?? 0) > 0) return 'Uncosted';
  if (!left && !booked)
    return (salary?.linkedButInactive.length ?? 0) > 0 ? 'Salary Inactive' : 'No Salary';
  return null;
}

export type EmployeeStatus = 'current' | 'left' | 'archived';

export const statusOf = (r: Employee): EmployeeStatus =>
  r.archived ? 'archived' : hasLeft(r.employee) ? 'left' : 'current';

/** The form of one person (create and edit share it). */
export type Draft = {
  fullName: string;
  role: string;
  employmentStart: string;
  employmentEnd: string;
  defaultCurrency: string;
  defaultMonthlyCost: string;
  note: string;
};

export const emptyDraft = (base: string): Draft => ({
  fullName: '',
  role: '',
  employmentStart: '',
  employmentEnd: '',
  defaultCurrency: base,
  defaultMonthlyCost: '',
  note: '',
});

export const draftOf = (e: EmployeeInsert | undefined, base: string): Draft =>
  e
    ? {
        fullName: e.fullName ?? '',
        role: e.role ?? '',
        employmentStart: day(e.employmentStart),
        employmentEnd: day(e.employmentEnd),
        defaultCurrency: e.defaultCurrency || base,
        defaultMonthlyCost: decimalToInput(e.defaultMonthlyCost),
        note: e.note ?? '',
      }
    : emptyDraft(base);

export const sameDraft = (a: Draft, b: Draft) =>
  (Object.keys(a) as (keyof Draft)[]).every((k) => a[k].trim() === b[k].trim());

/** The owner's sentence for a blocked leave — the same words as the Models and Tasks screens. */
export const UNSAVED_MESSAGE = 'You have unsaved changes, what to do?';
