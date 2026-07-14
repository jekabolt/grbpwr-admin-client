import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { CompareMode, GetDashboardResponse } from 'api/proto-http/admin';
import { dateRangeToIso8601Duration, type MetricsPeriod } from './useMetricsQuery';

// GetDashboard is a separate server-computed rollup from GetMetrics; we use it only for the
// figures the metrics tabs don't carry — operating_result / opex / marketing_spend and the
// GA4-vs-DB revenue coverage. Period grammar matches GetMetrics. With compareMode set it also
// returns `compare` (DashboardComparison): prior-period revenue/orders/margin/contribution/
// operating-result + their change %, so the operating result can show a period-over-period delta.
export function useDashboardQuery(
  period: MetricsPeriod,
  options?: {
    enabled?: boolean;
    customFrom?: Date;
    customTo?: Date;
    // GetDashboard supports only the compare_mode preset (no arbitrary compare_period baseline —
    // that field is GetMetrics-only). A real mode makes the response carry `compare`.
    compareMode?: CompareMode;
  },
) {
  const isCustom = period === 'custom';
  const periodParam =
    isCustom && options?.customFrom && options?.customTo
      ? dateRangeToIso8601Duration(options.customFrom, options.customTo)
      : period;

  return useQuery({
    queryKey: [
      'dashboard',
      periodParam,
      options?.customTo?.toISOString(),
      options?.compareMode,
    ],
    queryFn: async (): Promise<GetDashboardResponse> =>
      adminService.GetDashboard({
        period: periodParam,
        endAt: options?.customTo?.toISOString(),
        limit: undefined,
        compareMode: options?.compareMode,
      }),
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });
}
