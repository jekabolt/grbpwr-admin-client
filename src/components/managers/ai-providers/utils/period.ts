// The spend report's period, as calendar days (YYYY-MM-DD, inclusive) in the org timezone the
// server counts its days in. The presets are computed HERE (proto: GetAiSpendReportRequest); the
// server only checks from ≤ to and a span of at most 366 days, so the same checks run first here
// and a wrong custom range is said on screen instead of costing a round trip.

export type Preset = 'this-month' | 'last-month' | 'last-7' | 'custom';

export type DayRange = { from: string; to: string };

export const MAX_SPAN_DAYS = 366;

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Today's calendar day in `tz` — not the browser's: at 00:30 in Warsaw a browser in New York is
// still on yesterday, and "this month" would end a day early.
export function todayIn(tz: string, now = new Date()): string {
  const day = (zone: string | undefined) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  try {
    return day(tz || undefined);
  } catch {
    // An unknown zone name from the server: the browser's own day beats no day at all.
    return day(undefined);
  }
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real calendar day or null ("2026-02-30" is not one).
export function parseDay(s: string): Date | null {
  const m = DAY.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s ? d : null;
}

const fmtDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  if (!d) return day;
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDay(d);
}

export function presetRange(preset: Exclude<Preset, 'custom'>, today: string): DayRange {
  const t = parseDay(today) ?? new Date();
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  switch (preset) {
    case 'last-month':
      return {
        from: fmtDay(new Date(Date.UTC(y, m - 1, 1))),
        // Day 0 of this month is the last day of the previous one.
        to: fmtDay(new Date(Date.UTC(y, m, 0))),
      };
    case 'last-7':
      return { from: addDays(today, -6), to: today };
    default:
      return { from: fmtDay(new Date(Date.UTC(y, m, 1))), to: today };
  }
}

export function spanDays(range: DayRange): number {
  const a = parseDay(range.from);
  const b = parseDay(range.to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

// What is wrong with a custom range, in the screen's words; null when the server would take it.
export function rangeProblem(range: DayRange): string | null {
  if (!parseDay(range.from) || !parseDay(range.to)) return 'pick the first and the last day';
  if (range.from > range.to) return 'the first day is after the last one';
  if (spanDays(range) > MAX_SPAN_DAYS) return `at most ${MAX_SPAN_DAYS} days at a time`;
  return null;
}

// Three letters, spelled here: `Intl` writes September as "Sept" in en-GB and "Sep" in en-US.
export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "1 sep – 27 sep 2026", "27 dec 2025 – 2 jan 2026". Lowercase, like every label here.
export function periodLabel(range: DayRange): string {
  const a = parseDay(range.from);
  const b = parseDay(range.to);
  if (!a || !b) return '—';
  const f = (d: Date, withYear: boolean) =>
    `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  return range.from === range.to ? f(a, true) : `${f(a, !sameYear)} – ${f(b, true)}`;
}
