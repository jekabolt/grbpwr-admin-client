import { useMemo } from 'react';

/** One calendar month (UTC) of a date-ordered list. `month` is 1–12, as the backend sends it. */
export type ScrubMonth = { year: number; month: number; count: number };

export type MonthIndex = {
  /** Months as given (newest first), zero-count months included. */
  months: ScrubMonth[];
  /** Items across all months. */
  total: number;
  /** Offset of the month's first item in the DESC list, or null when the month has no items. */
  offsetOf: (year: number, month: number) => number | null;
  /** Month that holds the item at `offset`; clamped to the list, null when the list is empty. */
  monthAt: (offset: number) => { year: number; month: number } | null;
};

const key = (year: number, month: number) => year * 12 + (month - 1);

/**
 * Prefix sums over months ordered newest first: a month's first item sits after every item of
 * every newer month. Only correct when the list itself is ordered by the same date, DESC.
 */
export function buildMonthIndex(months: ScrubMonth[]): MonthIndex {
  const starts: number[] = [];
  const filled: ScrubMonth[] = [];
  const offsets = new Map<number, number>();
  let total = 0;
  for (const m of months) {
    const count = Math.max(0, Math.floor(m.count));
    if (count === 0) continue;
    offsets.set(key(m.year, m.month), total);
    starts.push(total);
    filled.push(m);
    total += count;
  }

  return {
    months,
    total,
    offsetOf: (year, month) => offsets.get(key(year, month)) ?? null,
    monthAt: (offset) => {
      if (filled.length === 0) return null;
      // Last start ≤ offset; below 0 lands on the newest month, past the end on the oldest.
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      const { year, month } = filled[lo];
      return { year, month };
    },
  };
}

/** Memoised `buildMonthIndex`: offset ↔ month for a list paged by offset, newest first. */
export function useMonthIndex(months: ScrubMonth[]): MonthIndex {
  return useMemo(() => buildMonthIndex(months), [months]);
}
