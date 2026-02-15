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
];

export const KpiCards: FC<KpiCardsProps> = ({ metrics, compareEnabled = false }) => {
  if (!metrics) return null;

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold text-lg'>
        Key metrics
      </Text>
      <div className='grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-5'>
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
              className='border border-textInactiveColor p-5 flex flex-col gap-2 min-w-0'
            >
              <Text variant='uppercase' className='text-textColor text-xs truncate'>
                {label}
              </Text>
              <Text className='font-bold text-xl truncate'>{format(value)}</Text>
              {hasCompare && changePct != null && (
                <Text
                  variant='uppercase'
                  className={`text-xs ${
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
          <Text variant='uppercase' className='font-bold text-lg mb-3 block'>
            CLV distribution
          </Text>
          <div className='grid grid-cols-3 gap-4'>
            <div>
              <Text variant='uppercase' className='text-textInactiveColor text-xs'>
                mean
              </Text>
              <Text className='font-bold text-lg'>
                {formatCurrency(parseDecimal(metrics.clvDistribution.mean))}
              </Text>
            </div>
            <div>
              <Text variant='uppercase' className='text-textInactiveColor text-xs'>
                median
              </Text>
              <Text className='font-bold text-lg'>
                {formatCurrency(parseDecimal(metrics.clvDistribution.median))}
              </Text>
            </div>
            <div>
              <Text variant='uppercase' className='text-textInactiveColor text-xs'>
                p90
              </Text>
              <Text className='font-bold text-lg'>
                {formatCurrency(parseDecimal(metrics.clvDistribution.p90))}
              </Text>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
