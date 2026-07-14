import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { GetChannelRoasSettledResponse } from 'api/proto-http/admin';
import { dateRangeToIso8601Duration, type MetricsPeriod } from './useMetricsQuery';

// Per-channel ROAS/CAC on SETTLED (real, banked) revenue — distinct from GA4 purchase revenue.
// Period grammar matches GetMetrics. Fetched on demand (growth tab active).
export function useChannelRoasQuery(
  period: MetricsPeriod,
  options?: { enabled?: boolean; customFrom?: Date; customTo?: Date },
) {
  const isCustom = period === 'custom';
  const periodParam =
    isCustom && options?.customFrom && options?.customTo
      ? dateRangeToIso8601Duration(options.customFrom, options.customTo)
      : period;

  return useQuery({
    queryKey: ['channelRoasSettled', periodParam, options?.customTo?.toISOString()],
    queryFn: async (): Promise<GetChannelRoasSettledResponse> =>
      adminService.GetChannelRoasSettled({
        period: periodParam,
        endAt: options?.customTo?.toISOString(),
      }),
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });
}
