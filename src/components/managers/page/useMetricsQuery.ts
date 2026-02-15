import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { MetricsGranularity } from 'api/proto-http/admin';
import { subDays } from 'date-fns';

export function getGranularityForDays(days: number): 'METRICS_GRANULARITY_DAY' | 'METRICS_GRANULARITY_WEEK' | 'METRICS_GRANULARITY_MONTH' {
  if (days <= 7) return 'METRICS_GRANULARITY_DAY';
  if (days <= 90) return 'METRICS_GRANULARITY_WEEK';
  return 'METRICS_GRANULARITY_MONTH';
}

export const metricsKeys = {
  all: ['metrics'] as const,
  metrics: (params: {
    periodFrom: string;
    periodTo: string;
    comparePeriodFrom?: string;
    comparePeriodTo?: string;
    granularity?: MetricsGranularity;
  }) => [...metricsKeys.all, params] as const,
};

export function useMetricsQuery(
  periodFrom: Date,
  periodTo: Date,
  options?: {
    comparePeriodFrom?: Date;
    comparePeriodTo?: Date;
    granularity?: MetricsGranularity;
  },
) {
  const periodFromStr = periodFrom.toISOString();
  const periodToStr = periodTo.toISOString();
  const comparePeriodFromStr = options?.comparePeriodFrom?.toISOString();
  const comparePeriodToStr = options?.comparePeriodTo?.toISOString();

  return useQuery({
    queryKey: metricsKeys.metrics({
      periodFrom: periodFromStr,
      periodTo: periodToStr,
      comparePeriodFrom: comparePeriodFromStr,
      comparePeriodTo: comparePeriodToStr,
      granularity: options?.granularity,
    }),
    queryFn: async () => {
      const response = await adminService.GetBusinessMetrics({
        periodFrom: periodFromStr,
        periodTo: periodToStr,
        comparePeriodFrom: comparePeriodFromStr,
        comparePeriodTo: comparePeriodToStr,
        granularity: options?.granularity ?? 'METRICS_GRANULARITY_DAY',
      });
      return response.metrics;
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function getDefaultDateRange(days = 7) {
  const to = new Date();
  const from = subDays(to, days);
  return { from, to };
}

export function getDefaultCompareRange(periodFrom: Date, periodTo: Date) {
  const days = Math.ceil((periodTo.getTime() - periodFrom.getTime()) / (24 * 60 * 60 * 1000));
  const compareTo = new Date(periodFrom);
  compareTo.setMilliseconds(-1);
  const compareFrom = subDays(compareTo, days);
  return { from: compareFrom, to: compareTo };
}

export function getPresetRange(days: number) {
  const to = new Date();
  const from = subDays(to, days);
  const compareTo = new Date(from);
  compareTo.setMilliseconds(-1);
  const compareFrom = subDays(compareTo, days);
  return { from, to, compareFrom, compareTo };
}

export const PRESETS = [
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
] as const;
