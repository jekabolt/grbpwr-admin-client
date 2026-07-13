import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { GetDashboardResponse } from 'api/proto-http/admin';
import { dateRangeToIso8601Duration, type MetricsPeriod } from './useMetricsQuery';

// GetDashboard is a separate server-computed rollup from GetMetrics; we use it only for the
// figures the metrics tabs don't carry — operating_result / opex / marketing_spend and the
// GA4-vs-DB revenue coverage. Period grammar matches GetMetrics.
export function useDashboardQuery(
  period: MetricsPeriod,
  options?: { enabled?: boolean; customFrom?: Date; customTo?: Date },
) {
  const isCustom = period === 'custom';
  const periodParam =
    isCustom && options?.customFrom && options?.customTo
      ? dateRangeToIso8601Duration(options.customFrom, options.customTo)
      : period;

  return useQuery({
    queryKey: ['dashboard', periodParam, options?.customTo?.toISOString()],
    queryFn: async (): Promise<GetDashboardResponse> =>
      adminService.GetDashboard({
        period: periodParam,
        endAt: options?.customTo?.toISOString(),
        limit: undefined,
      }),
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });
}
