import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { CompareMode, GetMetricsResponse, MetricsSection } from 'api/proto-http/admin';
import type { MetricsPeriod } from './useMetricsQuery';
import { dateRangeToIso8601Duration } from './useMetricsQuery';

export const fullMetricsKeys = {
  all: ['fullMetrics'] as const,
  fullMetrics: (params: {
    period: string;
    endAt?: string;
    compareMode?: CompareMode;
    sections: MetricsSection[];
  }) => [...fullMetricsKeys.all, params] as const,
};

const ALL_SECTIONS: MetricsSection[] = [
  'METRICS_SECTION_BUSINESS',
  'METRICS_SECTION_FUNNEL',
  'METRICS_SECTION_OOS_IMPACT',
  'METRICS_SECTION_PAYMENT_FAILURES',
  'METRICS_SECTION_WEB_VITALS',
  'METRICS_SECTION_USER_JOURNEYS',
  'METRICS_SECTION_SESSION_DURATION',
  'METRICS_SECTION_DEVICE_FUNNEL',
  'METRICS_SECTION_PRODUCT_ENGAGEMENT',
  'METRICS_SECTION_FORM_ERRORS',
  'METRICS_SECTION_EXCEPTIONS',
  'METRICS_SECTION_NOT_FOUND',
  'METRICS_SECTION_HERO_FUNNEL',
  'METRICS_SECTION_SIZE_CONFIDENCE',
  'METRICS_SECTION_PAYMENT_RECOVERY',
  'METRICS_SECTION_CHECKOUT_TIMINGS',
  'METRICS_SECTION_COHORT_RETENTION',
  'METRICS_SECTION_ORDER_SEQUENCE',
  'METRICS_SECTION_ENTRY_PRODUCTS',
  'METRICS_SECTION_REVENUE_PARETO',
  'METRICS_SECTION_SPENDING_CURVE',
  'METRICS_SECTION_CATEGORY_LOYALTY',
  'METRICS_SECTION_INVENTORY_HEALTH',
  'METRICS_SECTION_SIZE_RUN_EFFICIENCY',
  'METRICS_SECTION_SLOW_MOVERS',
  'METRICS_SECTION_RETURN_ANALYSIS',
  'METRICS_SECTION_SIZE_ANALYTICS',
  'METRICS_SECTION_DEAD_STOCK',
  'METRICS_SECTION_PRODUCT_TREND',
  'METRICS_SECTION_SCROLL_DEPTH',
  'METRICS_SECTION_ADD_TO_CART_RATE',
  'METRICS_SECTION_BROWSER_BREAKDOWN',
  'METRICS_SECTION_NEWSLETTER',
  'METRICS_SECTION_ABANDONED_CART',
  'METRICS_SECTION_CAMPAIGN_ATTRIBUTION',
];

export function useFullMetricsQuery(
  period: MetricsPeriod,
  options?: {
    compareMode?: CompareMode;
    customFrom?: Date;
    customTo?: Date;
    sections?: MetricsSection[];
    limit?: number;
  },
) {
  const isCustom = period === 'custom';
  const periodParam = isCustom && options?.customFrom && options?.customTo
    ? dateRangeToIso8601Duration(options.customFrom, options.customTo)
    : period;

  const sections = options?.sections || ALL_SECTIONS;

  return useQuery({
    queryKey: fullMetricsKeys.fullMetrics({
      period: periodParam,
      endAt: options?.customTo?.toISOString(),
      compareMode: options?.compareMode,
      sections,
    }),
    queryFn: async (): Promise<GetMetricsResponse> => {
      const response = await adminService.GetMetrics({
        period: periodParam,
        endAt: options?.customTo?.toISOString(),
        compareMode: options?.compareMode,
        sections,
        limit: options?.limit,
      });
      return response;
    },
    staleTime: 2 * 60 * 1000,
  });
}
