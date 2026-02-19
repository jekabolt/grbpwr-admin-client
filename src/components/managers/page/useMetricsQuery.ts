import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { CompareMode } from 'api/proto-http/admin';

export type MetricsPeriod = '7d' | '30d' | '90d' | 'custom';

/** Converts a date range to ISO8601 duration (e.g. P7D, P14D) */
export function dateRangeToIso8601Duration(from: Date, to: Date): string {
  const days = Math.max(1, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  return `P${days}D`;
}

export const metricsKeys = {
  all: ['metrics'] as const,
  metrics: (params: {
    period: string;
    endAt?: string;
    compareMode?: CompareMode;
  }) => [...metricsKeys.all, params] as const,
};

export function useMetricsQuery(
  period: MetricsPeriod,
  options?: {
    endAt?: Date;
    customFrom?: Date;
    customTo?: Date;
    compareMode?: CompareMode;
  },
) {
  const isCustom = period === 'custom';
  const periodParam = isCustom && options?.customFrom && options?.customTo
    ? dateRangeToIso8601Duration(options.customFrom, options.customTo)
    : period;
  const endAtStr = isCustom && options?.customTo
    ? options.customTo.toISOString()
    : options?.endAt?.toISOString();

  return useQuery({
    queryKey: metricsKeys.metrics({
      period: periodParam,
      endAt: endAtStr,
      compareMode: options?.compareMode,
    }),
    queryFn: async () => {
      const response = await adminService.GetBusinessMetrics({
        period: periodParam,
        endAt: endAtStr,
        compareMode: options?.compareMode ?? 'COMPARE_MODE_NONE',
      });
      return response.metrics;
    },
    enabled: !isCustom || !!(options?.customFrom && options?.customTo),
    staleTime: 2 * 60 * 1000,
  });
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
