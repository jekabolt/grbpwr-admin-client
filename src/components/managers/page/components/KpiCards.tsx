import type { BusinessMetrics, TimeSeriesPoint } from 'api/proto-http/admin';
import { type FC, type ReactNode } from 'react';
import Text from 'ui/components/text';
import {
  formatAvgDaysBetweenOrders,
  formatCurrency,
  formatNumber,
  formatPercent,
  getMetricComparison,
  isAvgDaysBetweenOrdersNearZeroDisplay,
  parseDecimal,
  periodMomentumFromValues,
} from '../utils';
import { getSparklineSeriesForMetric } from './kpiSparklineConfig';
import { MetricSparkline } from './MetricSparkline';

export type KpiGroupId = 'revenue' | 'orders' | 'traffic' | 'conversion' | 'customers' | 'email';

export type KpiLayout = 'default' | 'overview';

interface KpiCardsProps {
  metrics: BusinessMetrics | undefined;
  compareEnabled?: boolean;
  /** When set, only these groups render (e.g. Traffic tab: traffic + conversion + email). */
  visibleGroupIds?: KpiGroupId[];
  /** Overview: featured headline row + revenue breakdown grouping; other tabs ignore featured layout. */
  layout?: KpiLayout;
  /** Overview only: tuck refund/discount detail cards behind an expandable section. */
  collapseOverviewRevenueDetails?: boolean;
}

type KpiTier = 'featured' | 'standard' | 'detail';

type KpiItem = {
  key: keyof BusinessMetrics;
  label: string;
  format: (v: number) => string;
  tooltip?: string;
  lowerIsBetterOverride?: boolean;
  tier?: KpiTier;
};

const OVERVIEW_FEATURED_KEYS: (keyof BusinessMetrics)[] = [
  'revenue',
  'ordersCount',
  'avgOrderValue',
  'conversionRate',
];

const KPI_GROUPS: Array<{ id: KpiGroupId; title: string; items: KpiItem[] }> = [
  {
    id: 'revenue',
    title: 'Revenue',
    items: [
      { key: 'revenue', label: 'Revenue', format: formatCurrency, tier: 'featured' },
      { key: 'grossRevenue', label: 'Gross Revenue', format: formatCurrency },
      { key: 'avgOrderValue', label: 'Avg Order Value', format: formatCurrency, tier: 'featured' },
      { key: 'totalRefunded', label: 'Total Refunded', format: formatCurrency, tier: 'detail' },
      { key: 'totalDiscount', label: 'Total Discount', format: formatCurrency, tier: 'detail' },
      { key: 'productSaleDiscount', label: 'Sale Discount', format: formatCurrency, tier: 'detail' },
      { key: 'promoCodeDiscount', label: 'Promo Discount', format: formatCurrency, tier: 'detail' },
      {
        key: 'revenuePerSession',
        label: 'Revenue Per Visitor',
        format: formatCurrency,
        tooltip:
          'Total revenue divided by GA4 sessions in this period (revenue per visit). Not unique visitors if one person had multiple sessions.',
      },
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    items: [
      { key: 'ordersCount', label: 'Orders', format: formatNumber, tier: 'featured' },
      { key: 'itemsPerOrder', label: 'Units Per Order', format: (v) => formatNumber(v, 1) },
      { key: 'refundRate', label: 'Refund Rate', format: (v) => `${v.toFixed(1)}%` },
      {
        key: 'promoUsageRate',
        label: 'Promo Usage',
        format: (v) => `${v.toFixed(1)}%`,
        tooltip:
          'Share of orders that had a promo code applied (orders with promo_id). 0% means no orders used a code in this period — unrelated to sale-% discounts without a code.',
      },
    ],
  },
  {
    id: 'traffic',
    title: 'Traffic',
    items: [
      { key: 'sessions', label: 'Sessions', format: formatNumber },
      { key: 'users', label: 'Users', format: formatNumber },
      { key: 'newUsers', label: 'New Users', format: formatNumber },
      { key: 'pageViews', label: 'Page Views', format: formatNumber },
      {
        key: 'bounceRate',
        label: 'Bounce Rate',
        format: (v) => `${v.toFixed(1)}%`,
        tooltip:
          'Share of sessions with only one page view (GA4). Lower is better — a drop vs the prior period is shown as a positive trend.',
        lowerIsBetterOverride: true,
      },
      {
        key: 'avgSessionDuration',
        label: 'Avg. Time on Site',
        format: (v) => `${formatNumber(v)} s`,
        tooltip:
          'Average engaged time per session (seconds), from GA4 user engagement — not raw session wall-clock length.',
      },
      { key: 'pagesPerSession', label: 'Pages/Session', format: (v) => formatNumber(v, 1) },
    ],
  },
  {
    id: 'conversion',
    title: 'Conversion',
    items: [{ key: 'conversionRate', label: 'Conversion Rate', format: (v) => `${v.toFixed(1)}%`, tier: 'featured' }],
  },
  {
    id: 'customers',
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
      {
        key: 'avgDaysBetweenOrders',
        label: 'Avg Days Between Orders',
        format: formatAvgDaysBetweenOrders,
      },
    ],
  },
  {
    id: 'email',
    title: 'Email Delivery',
    items: [
      { key: 'emailsSent', label: 'Sent', format: formatNumber },
      { key: 'emailsDelivered', label: 'Delivered', format: formatNumber },
      { key: 'emailDeliveryRate', label: 'Delivery Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'emailOpenRate', label: 'Open Rate', format: (v) => `${v.toFixed(1)}%` },
      { key: 'emailClickRate', label: 'Click Rate', format: (v) => `${v.toFixed(1)}%` },
      {
        key: 'emailBounceRate',
        label: 'Email Hard Bounce Rate',
        format: (v) => `${v.toFixed(1)}%`,
        lowerIsBetterOverride: true,
      },
    ],
  },
];

function effectiveTier(item: KpiItem, layout: KpiLayout): KpiTier {
  if (layout !== 'overview' && item.tier === 'featured') return 'standard';
  return item.tier ?? 'standard';
}

function isOverviewFeaturedKey(key: keyof BusinessMetrics, layout: KpiLayout): boolean {
  return layout === 'overview' && OVERVIEW_FEATURED_KEYS.includes(key);
}

function changeDirectionArrow(changePct: number | null, changeLabel: string | null): string {
  if (changeLabel != null || changePct == null) return '';
  if (changePct > 0) return '↑ ';
  if (changePct < 0) return '↓ ';
  return '';
}

function sparklineNumericValues(data: TimeSeriesPoint[], valueFormat: 'currency' | 'number'): number[] {
  return data.map((p) =>
    valueFormat === 'number' ? parseDecimal(p.value) || (p.count ?? 0) : parseDecimal(p.value),
  );
}

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
  caveat,
  tier,
  sparkline,
  momentumLabel,
}: {
  label: string;
  labelTooltip?: string;
  value: number;
  format: (v: number) => string;
  compareValue?: number;
  changePct: number | null;
  changeLabel?: string | null;
  lowerIsBetter?: boolean;
  compareEnabled: boolean;
  caveat?: string;
  tier: KpiTier;
  sparkline?: ReactNode;
  momentumLabel?: string | null;
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
  const arrow = changeDirectionArrow(changePct, changeLabel);
  const compareLine =
    compareValue !== undefined
      ? changeSuffix !== ''
        ? `${format(value)} vs ${format(compareValue)} · ${changeSuffix}`
        : `${format(value)} vs ${format(compareValue)}`
      : changeSuffix;

  const shell =
    tier === 'featured'
      ? 'border-2 border-textColor/20 bg-bgSecondary p-4 min-w-0 flex flex-col gap-1'
      : tier === 'detail'
        ? 'border border-textInactiveColor/50 bg-bgSecondary/30 p-3 flex flex-col gap-0.5 min-w-0'
        : 'border border-textInactiveColor p-4 flex flex-col gap-1 min-w-0';

  const valueClass =
    tier === 'featured'
      ? 'text-xl font-bold truncate'
      : tier === 'detail'
        ? 'text-sm font-semibold truncate'
        : 'font-bold truncate';

  return (
    <div className={shell}>
      <div className='flex flex-wrap items-start justify-between gap-1'>
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
        {momentumLabel && (
          <Text
            variant='uppercase'
            className='text-[9px] text-textInactiveColor shrink-0'
            title='First half vs second half of this period (daily mean)'
          >
            {momentumLabel}
          </Text>
        )}
      </div>
      <Text className={valueClass} title={caveat}>
        {format(value)}
      </Text>
      {sparkline}
      {hasCompare && compareLine !== '' && (
        <Text variant='uppercase' className={`text-[10px] ${changeToneClass}`}>
          {arrow}
          {compareLine}
        </Text>
      )}
      {caveat && (
        <Text className='text-textInactiveColor text-[9px] italic truncate' title={caveat}>
          {caveat}
        </Text>
      )}
    </div>
  );
}

function buildCardForItem(
  item: KpiItem,
  metrics: BusinessMetrics,
  compareEnabled: boolean,
  layout: KpiLayout,
): ReactNode {
  const m = metrics[item.key];
  if (!m || typeof m !== 'object' || !('value' in m)) return null;

  const { value, compareValue, changePct: backendChangePct, lowerIsBetter: apiLowerIsBetter, caveat } =
    getMetricComparison(m as unknown as Record<string, unknown>);
  const lowerIsBetter =
    item.lowerIsBetterOverride !== undefined ? item.lowerIsBetterOverride : apiLowerIsBetter;
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
      changePct = backendChangePct ?? ((value - compareValue) / compareValue) * 100;
    }
  } else {
    changePct = backendChangePct ?? null;
  }
  if (
    item.key === 'avgDaysBetweenOrders' &&
    isAvgDaysBetweenOrdersNearZeroDisplay(value) &&
    compareValue !== undefined &&
    compareValue > 0
  ) {
    changePct = null;
    changeLabel = null;
  }

  const tier = effectiveTier(item, layout);
  const sparkCfg = getSparklineSeriesForMetric(metrics, item.key);
  const showSparkline = tier !== 'detail' && sparkCfg && sparkCfg.data.length > 0;
  let momentumLabel: string | null = null;
  if (tier === 'featured' && showSparkline && sparkCfg) {
    const vals = sparklineNumericValues(sparkCfg.data, sparkCfg.valueFormat);
    const mom = periodMomentumFromValues(vals);
    if (mom === 'accelerating') momentumLabel = 'Trend: up';
    if (mom === 'softening') momentumLabel = 'Trend: down';
  }

  const sparklineEl =
    showSparkline && sparkCfg ? (
      <MetricSparkline
        data={sparkCfg.data}
        compareData={sparkCfg.compareData}
        valueFormat={sparkCfg.valueFormat}
        showCompare={compareEnabled && (sparkCfg.compareData?.length ?? 0) > 0}
      />
    ) : undefined;

  return (
    <KpiCard
      key={item.key}
      label={item.label}
      labelTooltip={item.tooltip}
      value={value}
      format={item.format}
      compareValue={compareValue}
      changePct={changePct}
      changeLabel={changeLabel}
      lowerIsBetter={lowerIsBetter}
      compareEnabled={compareEnabled}
      caveat={caveat}
      tier={tier}
      sparkline={sparklineEl}
      momentumLabel={momentumLabel}
    />
  );
}

export const KpiCards: FC<KpiCardsProps> = ({
  metrics,
  compareEnabled = false,
  visibleGroupIds,
  layout = 'default',
  collapseOverviewRevenueDetails = false,
}) => {
  const groups = visibleGroupIds?.length
    ? KPI_GROUPS.filter((g) => visibleGroupIds.includes(g.id))
    : KPI_GROUPS;

  if (!metrics) return null;

  const featuredRow =
    layout === 'overview'
      ? OVERVIEW_FEATURED_KEYS.map((key) => {
          for (const g of groups) {
            const item = g.items.find((i) => i.key === key);
            if (item) return buildCardForItem(item, metrics, compareEnabled, layout);
          }
          return null;
        }).filter(Boolean)
      : [];

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Key metrics
      </Text>
      {featuredRow.length > 0 && (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>{featuredRow}</div>
      )}
      {groups.map(({ id, title, items }) => {
        const rest = items.filter((item) => !(layout === 'overview' && isOverviewFeaturedKey(item.key, layout)));

        if (id === 'revenue' && layout === 'overview') {
          const standard = rest.filter((i) => effectiveTier(i, layout) !== 'detail');
          const detail = rest.filter((i) => effectiveTier(i, layout) === 'detail');
          const standardCards = standard
            .map((item) => buildCardForItem(item, metrics, compareEnabled, layout))
            .filter(Boolean);
          const detailCards = detail
            .map((item) => buildCardForItem(item, metrics, compareEnabled, layout))
            .filter(Boolean);
          if (standardCards.length === 0 && detailCards.length === 0) return null;
          return (
            <div key={title} className='space-y-3'>
              <Text variant='uppercase' className='text-textInactiveColor text-xs font-semibold'>
                {title}
              </Text>
              {standardCards.length > 0 && (
                <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7'>
                  {standardCards}
                </div>
              )}
              {detailCards.length > 0 &&
                (collapseOverviewRevenueDetails ? (
                  <details className='border border-textInactiveColor/50 bg-bgSecondary/20'>
                    <summary className='cursor-pointer select-none px-3 py-2 text-[10px] font-semibold uppercase text-textInactiveColor hover:text-textColor'>
                      Revenue breakdown
                    </summary>
                    <div className='grid grid-cols-2 gap-3 px-3 pb-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7'>
                      {detailCards}
                    </div>
                  </details>
                ) : (
                  <div className='space-y-2'>
                    <Text variant='uppercase' className='text-textInactiveColor text-[10px] font-semibold'>
                      Revenue breakdown
                    </Text>
                    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7'>
                      {detailCards}
                    </div>
                  </div>
                ))}
            </div>
          );
        }

        const cards = rest
          .map((item) => buildCardForItem(item, metrics, compareEnabled, layout))
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
            Customer lifetime value
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
                        Average
                      </Text>
                      <Text className='font-bold'>
                        {formatCurrency(parseDecimal(metrics.clvDistribution.mean))}
                      </Text>
                    </div>
                    <div>
                      <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                        Median
                      </Text>
                      <Text className='font-bold'>
                        {formatCurrency(parseDecimal(metrics.clvDistribution.median))}
                      </Text>
                    </div>
                    <div>
                      <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                        90th percentile
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
