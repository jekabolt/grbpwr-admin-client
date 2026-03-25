import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import {
  formatAvgDaysBetweenOrders,
  formatCurrency,
  formatNumber,
  formatPercent,
  getMetricComparison,
  isAvgDaysBetweenOrdersNearZeroDisplay,
  parseDecimal,
} from '../utils';

interface KpiCardsProps {
  metrics: BusinessMetrics | undefined;
  compareEnabled?: boolean;
}

type KpiItem = {
  key: keyof BusinessMetrics;
  label: string;
  format: (v: number) => string;
  /** Native tooltip on the metric label (clarifies what the backend counts). */
  tooltip?: string;
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
      { key: 'productSaleDiscount', label: 'Sale Discount', format: formatCurrency },
      { key: 'promoCodeDiscount', label: 'Promo Discount', format: formatCurrency },
      { key: 'revenuePerSession', label: 'Revenue/Session', format: formatCurrency },
    ],
  },
  {
    title: 'Orders',
    items: [
      { key: 'ordersCount', label: 'Orders', format: formatNumber },
      { key: 'itemsPerOrder', label: 'Items/Order', format: (v) => formatNumber(v, 1) },
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
      { key: 'bounceRate', label: 'Session Bounce Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'avgSessionDuration', label: 'Avg Session (s)', format: formatNumber },
      { key: 'pagesPerSession', label: 'Pages/Session', format: (v) => formatNumber(v, 1) },
    ],
  },
  {
    title: 'Conversion',
    items: [{ key: 'conversionRate', label: 'Conversion Rate', format: (v) => `${v.toFixed(1)}%` }],
  },
  {
    title: 'Customers',
    items: [
      {
        key: 'newSubscribers',
        label: 'New Email Opt-ins',
        format: formatNumber,
        tooltip:
          'New marketing email list sign-ups (subscriber records), not checkout orders or first-time buyers. Compare Orders and the New customers by day chart for purchase activity.',
      },
      { key: 'repeatCustomersRate', label: 'Repeat Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'avgOrdersPerCustomer', label: 'Avg Orders/Customer', format: (v) => formatNumber(v, 1) },
<<<<<<< HEAD
      {
        key: 'avgDaysBetweenOrders',
        label: 'Avg Days Between Orders',
        format: formatAvgDaysBetweenOrders,
      },
=======
      { key: 'avgDaysBetweenOrders', label: 'Avg Days Between Orders', format: (v) => formatNumber(v, 1) },
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964
    ],
  },
  {
    title: 'Email Delivery',
    items: [
      { key: 'emailsSent', label: 'Sent', format: formatNumber },
      { key: 'emailsDelivered', label: 'Delivered', format: formatNumber },
      { key: 'emailDeliveryRate', label: 'Delivery Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'emailOpenRate', label: 'Open Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'emailClickRate', label: 'Click Rate', format: (v) => `${v.toFixed(1)}%` },
<<<<<<< HEAD
      { key: 'emailBounceRate', label: 'Email Hard Bounce Rate', format: (v) => `${v.toFixed(1)}%` },
=======
      { key: 'emailBounceRate', label: 'Bounce Rate', format: (v) => `${v.toFixed(1)}%` },
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964
    ],
  },
];

function KpiCard({
  label,
  labelTooltip,
  value,
  format,
  compareValue,
  changePct,
  changeLabel,
  lowerIsBetter,
  compareEnabled,
  changeAbsolute,
  caveat,
}: {
  label: string;
  labelTooltip?: string;
  value: number;
  format: (v: number) => string;
  compareValue?: number;
  changePct: number | null;
  /** Shown instead of a % when baseline is 0 (undefined relative change). */
  changeLabel?: string | null;
  lowerIsBetter?: boolean;
  compareEnabled: boolean;
  changeAbsolute?: number;
  caveat?: string;
}) {
  const hasCompare =
    compareEnabled && (compareValue !== undefined || changePct != null || changeLabel != null);
  let changeToneClass = 'text-textColor';
  if (changeLabel == null && changePct != null) {
    if (changePct === 0) {
      changeToneClass = 'text-textColor';
    } else if (lowerIsBetter) {
      changeToneClass = changePct < 0 ? 'text-green-600' : 'text-error';
    } else {
      changeToneClass = changePct > 0 ? 'text-green-600' : 'text-error';
    }
  }
  const changeSuffix =
    changeLabel != null ? changeLabel : changePct != null ? formatPercent(changePct) : '';
<<<<<<< HEAD
  const compareLine =
    compareValue !== undefined
      ? changeSuffix !== ''
        ? `${format(value)} vs ${format(compareValue)} · ${changeSuffix}`
        : `${format(value)} vs ${format(compareValue)}`
      : changeSuffix;
=======
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964
  return (
    <div className='border border-textInactiveColor p-4 flex flex-col gap-1 min-w-0'>
      <Text
        variant='uppercase'
        component='span'
        className={
          labelTooltip
            ? 'text-textColor text-[10px] truncate cursor-help border-b border-dotted border-textInactiveColor/60'
            : 'text-textColor text-[10px] truncate'
        }
        title={labelTooltip}
      >
        {label}
      </Text>
<<<<<<< HEAD
      <Text className='font-bold truncate' title={caveat}>
        {format(value)}
      </Text>
      {hasCompare && compareLine !== '' && (
        <Text variant='uppercase' className={`text-[10px] ${changeToneClass}`}>
          {compareLine}
        </Text>
      )}
      {caveat && (
        <Text className='text-textInactiveColor text-[9px] italic truncate' title={caveat}>
          {caveat}
=======
      <Text className='font-bold truncate'>{format(value)}</Text>
      {hasCompare && changeSuffix !== '' && (
        <Text variant='uppercase' className={`text-[10px] ${changeToneClass}`}>
          {compareValue !== undefined
            ? `${format(value)} vs ${format(compareValue)} · ${changeSuffix}`
            : changeSuffix}
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964
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
          .map(({ key, label, format, tooltip }) => {
            const m = metrics[key];
            if (!m || typeof m !== 'object' || !('value' in m)) return null;
            const { value, compareValue, changePct: backendChangePct, lowerIsBetter, changeAbsolute, caveat } =
              getMetricComparison(m as unknown as Record<string, unknown>);
            const hasCompareValue = compareValue !== undefined;
            let changePct: number | null = null;
            let changeLabel: string | null = null;
            if (hasCompareValue) {
              if (compareValue === 0) {
                if (value === 0) {
                  changePct = 0;
                } else if (value > 0) {
                  changeLabel = 'new';
                } else {
                  changeLabel = 'N/A';
                }
              } else {
                changePct =
                  backendChangePct ?? ((value - compareValue) / compareValue) * 100;
              }
            } else {
              changePct = backendChangePct ?? null;
            }
<<<<<<< HEAD
            // Same-day / sub-day avg gap vs a longer prior period: −100% reads like a bug, not "faster repeat".
            if (
              key === 'avgDaysBetweenOrders' &&
              isAvgDaysBetweenOrdersNearZeroDisplay(value) &&
              compareValue !== undefined &&
              compareValue > 0
            ) {
              changePct = null;
              changeLabel = null;
            }
=======
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964
            return (
              <KpiCard
                key={key}
                label={label}
                labelTooltip={tooltip}
                value={value}
                format={format}
                compareValue={compareValue}
                changePct={changePct}
                changeLabel={changeLabel}
                lowerIsBetter={lowerIsBetter}
                compareEnabled={compareEnabled}
                changeAbsolute={changeAbsolute}
                caveat={caveat}
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
            {(() => {
              const sampleSize = metrics.clvDistribution.sampleSize ?? 0;
              const showWarning = sampleSize < 5;
              const hideStats = sampleSize < 3;

              if (hideStats) {
                return (
                  <div className='flex flex-col gap-2'>
                    <Text className='text-warning text-sm'>
                      Insufficient data for distribution analysis (n={sampleSize})
                    </Text>
                    <Text className='text-textInactiveColor text-xs'>
                      At least 3 samples required for meaningful statistics
                    </Text>
                  </div>
                );
              }

              return (
                <>
                  {showWarning && (
                    <div className='mb-3 p-2 border border-warning bg-warning/10'>
                      <Text className='text-warning text-xs'>
                        Insufficient data for distribution analysis (n={sampleSize})
                      </Text>
                    </div>
                  )}
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
                  <div className='mt-3 pt-3 border-t border-textInactiveColor'>
                    <Text className='text-textInactiveColor text-[10px]'>
                      Sample size: {formatNumber(sampleSize)}
                    </Text>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
