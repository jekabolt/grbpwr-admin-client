import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, formatPercent, getMetricComparison, parseDecimal } from '../utils';

interface KpiCardsProps {
  metrics: BusinessMetrics | undefined;
  compareEnabled?: boolean;
}

const KPI_CONFIG: Array<{
  key: keyof BusinessMetrics;
  label: string;
  format: (v: number) => string;
}> = [
  { key: 'revenue', label: 'Revenue', format: formatCurrency },
  { key: 'ordersCount', label: 'Orders', format: formatNumber },
  { key: 'avgOrderValue', label: 'Avg Order Value', format: formatCurrency },
  { key: 'itemsPerOrder', label: 'Items/Order', format: formatNumber },
  { key: 'refundRate', label: 'Refund Rate', format: (v) => `${v.toFixed(1)}%` },
  { key: 'promoUsageRate', label: 'Promo Usage', format: (v) => `${v.toFixed(1)}%` },
  { key: 'grossRevenue', label: 'Gross Revenue', format: formatCurrency },
  { key: 'totalRefunded', label: 'Total Refunded', format: formatCurrency },
  { key: 'totalDiscount', label: 'Total Discount', format: formatCurrency },
  { key: 'newSubscribers', label: 'New Subscribers', format: formatNumber },
  { key: 'repeatCustomersRate', label: 'Repeat Rate', format: (v) => `${v.toFixed(1)}%` },
  { key: 'avgOrdersPerCustomer', label: 'Avg Orders/Customer', format: formatNumber },
  { key: 'avgDaysBetweenOrders', label: 'Avg Days Between Orders', format: formatNumber },
  // GA4 Traffic & Engagement
  { key: 'sessions', label: 'Sessions', format: formatNumber },
  { key: 'users', label: 'Users', format: formatNumber },
  { key: 'newUsers', label: 'New Users', format: formatNumber },
  { key: 'pageViews', label: 'Page Views', format: formatNumber },
  { key: 'bounceRate', label: 'Bounce Rate', format: (v) => `${v.toFixed(1)}%` },
  { key: 'avgSessionDuration', label: 'Avg Session (s)', format: formatNumber },
  { key: 'pagesPerSession', label: 'Pages/Session', format: formatNumber },
  { key: 'conversionRate', label: 'Conversion Rate', format: (v) => `${v.toFixed(1)}%` },
  { key: 'revenuePerSession', label: 'Revenue/Session', format: formatCurrency },
];

export const KpiCards: FC<KpiCardsProps> = ({ metrics, compareEnabled = false }) => {
  if (!metrics) return null;

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Key metrics
      </Text>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7'>
        {KPI_CONFIG.map(({ key, label, format }) => {
          const m = metrics[key];
          if (!m || typeof m !== 'object' || !('value' in m)) return null;
          const { value, compareValue, changePct: backendChangePct } = getMetricComparison(
            m as unknown as Record<string, unknown>,
          );
          const hasCompareValue = compareValue !== undefined;
          const changePct = hasCompareValue
            ? compareValue === 0
              ? (value > 0 ? 100 : 0)
              : (backendChangePct ?? ((value - compareValue) / compareValue) * 100)
            : backendChangePct ?? null;
          const hasCompare =
            compareEnabled && (hasCompareValue || (backendChangePct != null && changePct != null));
          return (
            <div
              key={key}
              className='border border-textInactiveColor p-4 flex flex-col gap-1 min-w-0'
            >
              <Text variant='uppercase' className='text-textColor text-[10px] truncate'>
                {label}
              </Text>
              <Text className='font-bold truncate'>{format(value)}</Text>
              {hasCompare && changePct != null && (
                <Text
                  variant='uppercase'
                  className={`text-[10px] ${
                    changePct > 0 ? 'text-green-600' : changePct < 0 ? 'text-error' : 'text-textColor'
                  }`}
                >
                  {hasCompareValue
                    ? `${format(value)} vs ${format(compareValue!)} · ${formatPercent(changePct)}`
                    : formatPercent(changePct)}
                </Text>
              )}
            </div>
          );
        })}
      </div>
      {metrics.clvDistribution && (
        <div className='border border-textInactiveColor p-4'>
          <Text variant='uppercase' className='font-bold mb-3 block'>
            CLV distribution
          </Text>
          <div className='grid grid-cols-3 gap-4'>
            <div>
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                mean
              </Text>
              <Text className='font-bold'>
                {formatCurrency(parseDecimal(metrics.clvDistribution.mean))}
              </Text>
            </div>
            <div>
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                median
              </Text>
              <Text className='font-bold'>
                {formatCurrency(parseDecimal(metrics.clvDistribution.median))}
              </Text>
            </div>
            <div>
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                p90
              </Text>
              <Text className='font-bold'>
                {formatCurrency(parseDecimal(metrics.clvDistribution.p90))}
              </Text>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
