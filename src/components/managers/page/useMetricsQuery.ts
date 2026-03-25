import type { CompareMode } from 'api/proto-http/admin';

export type MetricsPeriod = '7d' | '30d' | '90d' | 'custom';

/** Converts a date range to ISO8601 duration (e.g. P7D, P14D) */
export function dateRangeToIso8601Duration(from: Date, to: Date): string {
  const days = Math.max(1, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  return `P${days}D`;
}

export const PERIOD_OPTIONS: Array<{ value: MetricsPeriod; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

export const COMPARE_MODE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: 'COMPARE_MODE_NONE', label: 'No comparison' },
  { value: 'COMPARE_MODE_PREVIOUS_PERIOD', label: 'Previous period' },
  { value: 'COMPARE_MODE_SAME_PERIOD_LAST_YEAR', label: 'Same period last year' },
];
