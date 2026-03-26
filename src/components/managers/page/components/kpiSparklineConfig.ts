import type { BusinessMetrics, TimeSeriesPoint } from 'api/proto-http/admin';

export type SparklineValueFormat = 'currency' | 'number';

/** Maps KPI metric keys to daily series on BusinessMetrics (compare optional). */
export const KPI_SPARKLINE_SERIES: Partial<
  Record<
    keyof BusinessMetrics,
    {
      dataKey: keyof BusinessMetrics;
      compareDataKey: keyof BusinessMetrics;
      valueFormat: SparklineValueFormat;
    }
  >
> = {
  revenue: {
    dataKey: 'revenueByDay',
    compareDataKey: 'revenueByDayCompare',
    valueFormat: 'currency',
  },
  ordersCount: {
    dataKey: 'ordersByDay',
    compareDataKey: 'ordersByDayCompare',
    valueFormat: 'number',
  },
  avgOrderValue: {
    dataKey: 'avgOrderValueByDay',
    compareDataKey: 'avgOrderValueByDayCompare',
    valueFormat: 'currency',
  },
  grossRevenue: {
    dataKey: 'grossRevenueByDay',
    compareDataKey: 'grossRevenueByDayCompare',
    valueFormat: 'currency',
  },
  conversionRate: {
    dataKey: 'conversionRateByDay',
    compareDataKey: 'conversionRateByDayCompare',
    valueFormat: 'number',
  },
  sessions: {
    dataKey: 'sessionsByDay',
    compareDataKey: 'sessionsByDayCompare',
    valueFormat: 'number',
  },
  users: {
    dataKey: 'usersByDay',
    compareDataKey: 'usersByDayCompare',
    valueFormat: 'number',
  },
  pageViews: {
    dataKey: 'pageViewsByDay',
    compareDataKey: 'pageViewsByDayCompare',
    valueFormat: 'number',
  },
  newSubscribers: {
    dataKey: 'subscribersByDay',
    compareDataKey: 'subscribersByDayCompare',
    valueFormat: 'number',
  },
};

export function getSparklineSeriesForMetric(
  metrics: BusinessMetrics,
  metricKey: keyof BusinessMetrics,
): { data: TimeSeriesPoint[] | undefined; compareData: TimeSeriesPoint[] | undefined; valueFormat: SparklineValueFormat } | null {
  const cfg = KPI_SPARKLINE_SERIES[metricKey];
  if (!cfg) return null;
  const data = metrics[cfg.dataKey] as TimeSeriesPoint[] | undefined;
  const compareData = metrics[cfg.compareDataKey] as TimeSeriesPoint[] | undefined;
  if (!data?.length) return null;
  return { data, compareData, valueFormat: cfg.valueFormat };
}
