import { AcctPeriod, googletype_Decimal } from 'api/proto-http/admin';
import { ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { Loader } from 'ui/components/loader';
import Text from 'ui/components/text';

// Shared, dependency-free helpers for the Reports screen (Step 5). Kept local to reports/**
// because the READ-ONLY accounting/utils/format.ts covers money/dates but not the month-column
// labels, percentages, period presets and period-status badge this screen needs
// (04-screens-reports.md + 08-ux-guidelines.md §8.5). All amounts/totals still come from the
// backend — nothing here recomputes a reported figure (§8.6 principle #6); the only arithmetic is
// on *dates* (local calendar presets) and a <0.01 delta threshold for the recon "matched" label.

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

// A P&L month column arrives as the first-of-month date string 'YYYY-MM-01'; render it 'MAR 2026'.
// Split-based (not new Date) so a date-only string never shifts a month under a behind-UTC zone.
export function formatMonthLabel(monthStart?: string): string {
  if (!monthStart) return '—';
  const [y, m] = monthStart.split('-');
  const idx = Number(m) - 1;
  if (!y || Number.isNaN(idx) || idx < 0 || idx > 11) return monthStart;
  return `${MONTHS[idx]} ${y}`;
}

// P&L derived %-rows (gross/net margin) come as decimals like {value:'42.5'}; §4.2 wants one
// fractional digit + a trailing ' %'. Missing/non-finite → em dash (matches formatBase's "no data").
export function formatPercent(d?: googletype_Decimal): string {
  const raw = d?.value;
  if (raw == null || raw === '') return '—';
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)} %`;
}

export type DateRange = { from: string; to: string };

// Local-calendar YYYY-MM-DD (no UTC edge fuss — 04 sanctions the one-line compromise).
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Presets use an EXCLUSIVE upper bound (first day of the month AFTER the range) to match the
// backend's [from, to) reports (GetTrialBalance doc: "over [from, to) (to exclusive)"). So
// "this month" is [1st of this month, 1st of next month) — the whole current month, no last-day
// off-by-one. The date input then shows next month's 1st as `to`; that's the exclusive bound, not
// a data day.
export function presetThisMonth(now = new Date()): DateRange {
  return {
    from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
  };
}

export function presetLastMonth(now = new Date()): DateRange {
  return {
    from: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
  };
}

export function presetYTD(now = new Date()): DateRange {
  return {
    from: toISODate(new Date(now.getFullYear(), 0, 1)),
    to: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
  };
}

// Naked /accounting/reports (no ?from&to) lands on the current month; a shared link with dates
// keeps them. Same default the recon tab wants (§4.5 "дефолт текущий месяц").
export function defaultRange(): DateRange {
  return presetThisMonth();
}

export function defaultAsOf(now = new Date()): string {
  return toISODate(now);
}

type YMD = { y: number; m: number; d: number };

function parseYMD(s?: string): YMD | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m: m - 1, d };
}

function monthKey(y: number, m0: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
}

// Calendar months a [from, to) range touches, as 'YYYY-MM-01' keys. `to` is exclusive, so the last
// included day is to-1: a `to` of the 1st drops that month, a mid-month `to` keeps it.
export function monthsInRange(from: string, to: string): string[] {
  const f = parseYMD(from);
  const t = parseYMD(to);
  if (!f) return [];
  if (!t) return [monthKey(f.y, f.m)];
  const lastIncluded = new Date(t.y, t.m, t.d);
  lastIncluded.setDate(lastIncluded.getDate() - 1);
  const start = new Date(f.y, f.m, 1);
  if (lastIncluded.getTime() < start.getTime()) return [monthKey(f.y, f.m)];
  const out: string[] = [];
  const cur = new Date(f.y, f.m, 1);
  while (
    cur.getFullYear() < lastIncluded.getFullYear() ||
    (cur.getFullYear() === lastIncluded.getFullYear() && cur.getMonth() <= lastIncluded.getMonth())
  ) {
    out.push(monthKey(cur.getFullYear(), cur.getMonth()));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

// The single month an as-of Balance Sheet reports into.
export function monthsForAsOf(asOf: string): string[] {
  const p = parseYMD(asOf);
  return p ? [monthKey(p.y, p.m)] : [];
}

// Period badge: CLOSED only when EVERY month in the set has a closed period row; a missing row is
// an open month (§8.5). Compared on the 'YYYY-MM' prefix so a period stored as any day of the
// month still matches.
export function rangePeriodStatus(months: string[], periods: AcctPeriod[]): 'open' | 'closed' {
  if (months.length === 0) return 'open';
  const closed = new Set(
    periods.filter((p) => p.status === 'closed' && p.period).map((p) => p.period!.slice(0, 7)),
  );
  return months.every((m) => closed.has(m.slice(0, 7))) ? 'closed' : 'open';
}

type ReportStateProps = {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isEmpty?: boolean;
  emptyHint?: string;
  children: ReactNode;
};

// One place for the three async states every report shares (§8.7): a min-height Loader so the
// screen doesn't jump, an error card with a retry (refetch), and an explained empty state — never
// a bare "no data". Children render only on success, so a table's copy button never appears
// without rows behind it.
export function ReportState({
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyHint = 'no data in this period — check the date range',
  children,
}: ReportStateProps) {
  if (isLoading) {
    return (
      <div className='flex min-h-[200px] items-center justify-center'>
        <Loader />
      </div>
    );
  }
  if (isError) {
    return (
      <div className='flex min-h-[200px] flex-col items-center justify-center gap-3 border border-error p-4 text-center'>
        <Text className='text-error'>Failed to load — the request did not complete</Text>
        <Button variant='secondary' size='lg' onClick={onRetry}>
          retry
        </Button>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className='flex min-h-[200px] items-center justify-center border border-textInactiveColor p-4 text-center'>
        <Text variant='inactive' size='small'>
          {emptyHint}
        </Text>
      </div>
    );
  }
  return <>{children}</>;
}

// Caveats (P&L always ships pre-tax + shipping-cost notes; BS may add its own). No yellow in the
// brutalist kit, so this is a bordered muted block, each line flagged with a "!" — the
// CaveatBadge look (§4.2) without its red tooltip treatment.
export function CaveatsNote({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) return null;
  return (
    <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
      {caveats.map((c, i) => (
        <div key={i} className='flex items-start gap-2 text-labelColor'>
          <span aria-hidden className='font-bold leading-none'>
            !
          </span>
          <Text size='small' variant='label'>
            {c}
          </Text>
        </div>
      ))}
    </div>
  );
}
