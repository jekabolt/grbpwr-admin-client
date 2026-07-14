import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { CompareMode, GetMetricsResponse, MetricsSection } from 'api/proto-http/admin';
import type { MetricsPeriod } from './useMetricsQuery';
import { dateRangeToIso8601Duration } from './useMetricsQuery';

export type MetricsTabId = 'this-week' | 'revenue' | 'products' | 'growth';

export const TAB_SECTIONS: Record<MetricsTabId, MetricsSection[]> = {
  'this-week': [
    'METRICS_SECTION_BUSINESS',
    'METRICS_SECTION_CAMPAIGN_ATTRIBUTION',
    // Only technical signal that's an ops (money) concern — surfaced as an alert on Overview.
    'METRICS_SECTION_PAYMENT_FAILURES',
    // analytics-v2: month revenue forecast strip (calendar-month anchored, ignores the picker).
    'METRICS_SECTION_FORECAST',
  ],
  revenue: [
    'METRICS_SECTION_BUSINESS',
    'METRICS_SECTION_FUNNEL',
    // analytics-v2: fulfilment lead-time pipeline + on-time rate inside Shipping & Delivery.
    'METRICS_SECTION_DELIVERY',
    // analytics-v2: full P&L + unit economics (costing-gated by the server).
    'METRICS_SECTION_PROFITABILITY',
    // analytics-v2: order-value distribution (basket-size histogram).
    'METRICS_SECTION_ORDER_VALUE_BANDS',
  ],
  products: [
    'METRICS_SECTION_BUSINESS',
    'METRICS_SECTION_SIZE_ANALYTICS',
    'METRICS_SECTION_SIZE_RUN_EFFICIENCY',
    'METRICS_SECTION_INVENTORY_HEALTH',
    'METRICS_SECTION_SLOW_MOVERS',
    'METRICS_SECTION_DEAD_STOCK',
    'METRICS_SECTION_OOS_IMPACT',
    'METRICS_SECTION_NOTIFY_ME_INTENT',
    // Costing-gated economics reports (backend omits them without costing:read).
    'METRICS_SECTION_MARGIN_BY_STYLE',
    'METRICS_SECTION_COGS_STRUCTURE',
    'METRICS_SECTION_INVENTORY_VALUATION',
    // Cut (vanity micro-interaction telemetry, no operator decision): PRODUCT_ENGAGEMENT,
    // TIME_ON_PAGE, PRODUCT_ZOOM, IMAGE_SWIPES, SIZE_GUIDE_CLICKS, DETAILS_EXPANSION.
    // Cut (thin/misleading at boutique catalog size): REVENUE_PARETO (trivially steep 80/20),
    // PRODUCT_TREND (extreme swings on tiny prior revenue), ADD_TO_CART_RATE (per-SKU GA4 noise),
    // SIZE_CONFIDENCE (guide-view/selection ratio explodes on a few events).
  ],
  // Growth folds the old Customers (repeat economics + cross-sell, from BUSINESS) and Traffic
  // (campaigns + channel mix + DB geo). Cut as too low-n at boutique volume: COHORT_RETENTION,
  // ORDER_SEQUENCE, SPENDING_CURVE, ENTRY_PRODUCTS, CATEGORY_LOYALTY.
  growth: [
    'METRICS_SECTION_BUSINESS',
    'METRICS_SECTION_CAMPAIGN_ATTRIBUTION',
    // analytics-v2: per-country economics / logistics / demand matrix.
    'METRICS_SECTION_GEOGRAPHY',
  ],
  // 'technical' tab removed from the operator dashboard: Web Vitals / 404s / exceptions /
  // form errors / browser / session duration / user journeys are SRE metrics, wrong persona.
  // Payment failures (the one money-relevant signal) moved to the Overview alert.
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
