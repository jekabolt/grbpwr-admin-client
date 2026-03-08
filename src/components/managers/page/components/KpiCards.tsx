import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, formatPercent, getMetricComparison, parseDecimal } from '../utils';

interface KpiCardsProps {
  metrics: BusinessMetrics | undefined;
  compareEnabled?: boolean;
}

type KpiItem = {
  key: keyof BusinessMetrics;
  label: string;
  format: (v: number) => string;
};

const KPI_GROUPS: Array<{ title: string; items: KpiItem[] }> = [
  {
    title: 'Revenue',
    items: [
      { key: 'revenue', label: 'Revenue', format: formatCurrency },
      { key: 'grossRevenue', label: 'Gross Revenue', format: formatCurrency },
      { key: 'avgOrderValue', label: 'Avg Order Value', format: formatCurrency },
      { key: 'totalRefunded', label: 'Total Refunded', format: formatCurrency },
      { key: 'totalDiscount', label: 'Total Discount', format: formatCurrency },
      { key: 'revenuePerSession', label: 'Revenue/Session', format: formatCurrency },
    ],
  },
  {
    title: 'Orders',
    items: [
      { key: 'ordersCount', label: 'Orders', format: formatNumber },
      { key: 'itemsPerOrder', label: 'Items/Order', format: formatNumber },
      { key: 'refundRate', label: 'Refund Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'promoUsageRate', label: 'Promo Usage', format: (v) => `${v.toFixed(1)}%` },
    ],
  },
  {
    title: 'Traffic',
    items: [
      { key: 'sessions', label: 'Sessions', format: formatNumber },
      { key: 'users', label: 'Users', format: formatNumber },
      { key: 'newUsers', label: 'New Users', format: formatNumber },
      { key: 'pageViews', label: 'Page Views', format: formatNumber },
      { key: 'bounceRate', label: 'Bounce Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'avgSessionDuration', label: 'Avg Session (s)', format: formatNumber },
      { key: 'pagesPerSession', label: 'Pages/Session', format: formatNumber },
    ],
  },
  {
    title: 'Conversion',
    items: [{ key: 'conversionRate', label: 'Conversion Rate', format: (v) => `${v.toFixed(1)}%` }],
  },
  {
    title: 'Customers',
    items: [
      { key: 'newSubscribers', label: 'New Subscribers', format: formatNumber },
      { key: 'repeatCustomersRate', label: 'Repeat Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'avgOrdersPerCustomer', label: 'Avg Orders/Customer', format: formatNumber },
      { key: 'avgDaysBetweenOrders', label: 'Avg Days Between Orders', format: formatNumber },
    ],
  },
];

function KpiCard({
  label,
  value,
  format,
  compareValue,
  changePct,
  lowerIsBetter,
  compareEnabled,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  compareValue?: number;
  changePct: number | null;
  lowerIsBetter?: boolean;
  compareEnabled: boolean;
}) {
  const hasCompare = compareEnabled && (compareValue !== undefined || changePct != null);
  return (
    <div className='border border-textInactiveColor p-4 flex flex-col gap-1 min-w-0'>
      <Text variant='uppercase' className='text-textColor text-[10px] truncate'>
        {label}
      </Text>
      <Text className='font-bold truncate'>{format(value)}</Text>
      {hasCompare && changePct != null && (
        <Text
          variant='uppercase'
          className={`text-[10px] ${
            changePct === 0
              ? 'text-textColor'
              : lowerIsBetter
                ? changePct < 0
                  ? 'text-green-600'
                  : 'text-error'
                : changePct > 0
                  ? 'text-green-600'
                  : 'text-error'
          }`}
        >
          {compareValue !== undefined
            ? `${format(value)} vs ${format(compareValue)} · ${formatPercent(changePct)}`
            : formatPercent(changePct)}
        </Text>
      )}
    </div>
  );
}

export const KpiCards: FC<KpiCardsProps> = ({ metrics, compareEnabled = false }) => {
  if (!metrics) return null;

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Key metrics
      </Text>
      {KPI_GROUPS.map(({ title, items }) => {
        const cards = items
          .map(({ key, label, format }) => {
            const m = metrics[key];
            if (!m || typeof m !== 'object' || !('value' in m)) return null;
            const { value, compareValue, changePct: backendChangePct, lowerIsBetter } =
              getMetricComparison(m as unknown as Record<string, unknown>);
            const hasCompareValue = compareValue !== undefined;
            const changePct = hasCompareValue
              ? compareValue === 0
                ? (value > 0 ? 100 : 0)
                : (backendChangePct ?? ((value - compareValue) / compareValue) * 100)
              : backendChangePct ?? null;
            return (
              <KpiCard
                key={key}
                label={label}
                value={value}
                format={format}
                compareValue={compareValue}
                changePct={changePct}
                lowerIsBetter={lowerIsBetter}
                compareEnabled={compareEnabled}
              />
            );
          })
          .filter(Boolean);
        if (cards.length === 0) return null;
        return (
          <div key={title} className='space-y-3'>
            <Text variant='uppercase' className='text-textInactiveColor text-xs font-semibold'>
              {title}
            </Text>
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7'>
              {cards}
            </div>
          </div>
        );
      })}
      {metrics.clvDistribution && (
        <div className='space-y-3'>
          <Text variant='uppercase' className='text-textInactiveColor text-xs font-semibold'>
            CLV distribution
          </Text>
          <div className='border border-textInactiveColor p-4'>
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
        </div>
      )}
    </div>
  );
};
