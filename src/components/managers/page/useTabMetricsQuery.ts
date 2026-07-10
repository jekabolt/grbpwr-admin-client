import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { CompareMode, GetMetricsResponse, MetricsSection } from 'api/proto-http/admin';
import type { MetricsPeriod } from './useMetricsQuery';
import { dateRangeToIso8601Duration } from './useMetricsQuery';

export type MetricsTabId = 'this-week' | 'revenue' | 'products' | 'customers' | 'traffic';

export const TAB_SECTIONS: Record<MetricsTabId, MetricsSection[]> = {
  'this-week': [
    'METRICS_SECTION_BUSINESS',
    'METRICS_SECTION_REVENUE_PARETO',
    'METRICS_SECTION_CAMPAIGN_ATTRIBUTION',
    // Only technical signal that's an ops (money) concern — surfaced as an alert on Overview.
    'METRICS_SECTION_PAYMENT_FAILURES',
  ],
  revenue: ['METRICS_SECTION_BUSINESS', 'METRICS_SECTION_FUNNEL'],
  products: [
    'METRICS_SECTION_BUSINESS',
    'METRICS_SECTION_REVENUE_PARETO',
    'METRICS_SECTION_PRODUCT_TREND',
    'METRICS_SECTION_ADD_TO_CART_RATE',
    'METRICS_SECTION_SIZE_ANALYTICS',
    'METRICS_SECTION_SIZE_RUN_EFFICIENCY',
    'METRICS_SECTION_INVENTORY_HEALTH',
    'METRICS_SECTION_SLOW_MOVERS',
    'METRICS_SECTION_DEAD_STOCK',
    'METRICS_SECTION_OOS_IMPACT',
    'METRICS_SECTION_NOTIFY_ME_INTENT',
    'METRICS_SECTION_SIZE_CONFIDENCE',
    // Cut (vanity micro-interaction telemetry, no operator decision): PRODUCT_ENGAGEMENT,
    // TIME_ON_PAGE, PRODUCT_ZOOM, IMAGE_SWIPES, SIZE_GUIDE_CLICKS, DETAILS_EXPANSION.
  ],
  // Collapsed to repeat-economics only. Cut (too low-n to be reliable at boutique volume):
  // COHORT_RETENTION, ORDER_SEQUENCE, SPENDING_CURVE, ENTRY_PRODUCTS, CATEGORY_LOYALTY.
  customers: ['METRICS_SECTION_BUSINESS'],
  traffic: ['METRICS_SECTION_BUSINESS', 'METRICS_SECTION_CAMPAIGN_ATTRIBUTION'],
  // 'technical' tab removed from the operator dashboard: Web Vitals / 404s / exceptions /
  // form errors / browser / session duration / user journeys are SRE metrics, wrong persona.
  // Payment failures (the one money-relevant signal) moved to the Overview alert above.
};

export const tabMetricsKeys = {
  all: ['tabMetrics'] as const,
  tabMetrics: (params: {
    tabId: MetricsTabId;
    period: string;
    endAt?: string;
    compareMode?: CompareMode;
  }) => [...tabMetricsKeys.all, params] as const,
};

export function useTabMetricsQuery(
  tabId: MetricsTabId,
  period: MetricsPeriod,
  options?: {
    compareMode?: CompareMode;
    customFrom?: Date;
    customTo?: Date;
    limit?: number;
  },
) {
  const isCustom = period === 'custom';
  const periodParam =
    isCustom && options?.customFrom && options?.customTo
      ? dateRangeToIso8601Duration(options.customFrom, options.customTo)
      : period;

  const sections = TAB_SECTIONS[tabId];

  return useQuery({
    queryKey: tabMetricsKeys.tabMetrics({
      tabId,
      period: periodParam,
      endAt: options?.customTo?.toISOString(),
      compareMode: options?.compareMode,
    }),
    queryFn: async (): Promise<GetMetricsResponse> => {
      const response = await adminService.GetMetrics({
        period: periodParam,
        endAt: options?.customTo?.toISOString(),
        compareMode: options?.compareMode,
        sections,
        limit: options?.limit,
        trendGranularity: undefined,
      });
      return response;
    },
    staleTime: 2 * 60 * 1000,
  });
}
