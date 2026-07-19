import type {
  BusinessMetrics,
  CompareMode,
  GetMetricsResponse,
  NewVsReturningSplit,
} from 'api/proto-http/admin';
import { format } from 'date-fns';
import { FC, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import { ExecutiveHealthStrip, ForecastStrip, TimeSeriesChart } from '../components';
import { ProductNameLink } from '../components/ProductNameLink';
import { orderCancellationSharePercent } from '../executiveAlerts';
import type { MetricsPeriod } from '../useMetricsQuery';
import {
  coarsenTimeSeries,
  formatCurrency,
  formatCurrencyDelta,
  formatCurrencyWhole,
  formatNumber,
  formatNumberDelta,
  getMetricComparison,
  getTimeSeries,
  parseDecimal,
  resolveAnalyticsPeriodLabels,
} from '../utils';

interface ThisWeekTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled: boolean;
  period: MetricsPeriod;
  compareMode: CompareMode;
  customFrom: Date;
  customTo: Date;
}

type DotStatus = 'g' | 'a' | 'r';
// Status dot: green ok / amber watch (the app's warning is the blue token) / red act.
const DOT: Record<DotStatus, string> = { g: 'bg-success', a: 'bg-warning', r: 'bg-error' };

/** At-a-glance health: each key metric with a green/amber/red status dot. */
const HealthScorecard: FC<{ metrics: BusinessMetrics | undefined }> = ({ metrics }) => {
  if (!metrics) return null;
  const commerce = metrics.commerce;
  const margin = metrics.margin;
  const revenue = getMetricComparison(commerce?.revenue as any);
  const orders = getMetricComparison(commerce?.ordersCount as any);
  const refund = getMetricComparison(commerce?.refundRate as any);
  const repeat = getMetricComparison(commerce?.repeatCustomersRate as any);
  const cancelPct = orderCancellationSharePercent(metrics);
  const coverage = margin?.costCoveragePct ?? 0;

  const cells: { label: string; value: string; status: DotStatus }[] = [
    { label: 'Revenue', value: formatCurrencyWhole(revenue.value), status: 'g' },
    { label: 'Orders', value: formatNumber(orders.value), status: 'g' },
    {
      label: 'Cancellations',
      value: cancelPct != null ? `${cancelPct.toFixed(0)}%` : '—',
      status: cancelPct == null ? 'g' : cancelPct >= 15 ? 'r' : cancelPct >= 8 ? 'a' : 'g',
    },
    {
      label: 'Cost coverage',
      value: `${coverage.toFixed(0)}%`,
      status: coverage < 50 ? 'r' : coverage < 80 ? 'a' : 'g',
    },
    {
      label: 'Refund rate',
      value: `${refund.value.toFixed(1)}%`,
      status: refund.value >= 8 ? 'r' : refund.value >= 5 ? 'a' : 'g',
    },
    { label: 'Repeat rate', value: `${repeat.value.toFixed(0)}%`, status: 'g' },
  ];

  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6'>
      {cells.map((c) => (
        <div
          key={c.label}
          className='flex items-start gap-2 border border-textInactiveColor bg-bgSecondary/30 p-3'
        >
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[c.status]}`} />
          <div className='min-w-0'>
            <Text variant='uppercase' className='text-labelColor text-[10px]'>
              {c.label}
            </Text>
            <Text className='font-bold tabular-nums'>{c.value}</Text>
          </div>
        </div>
      ))}
    </div>
  );
};

/** This period vs the previous one, as a value + delta strip (deltas only when compare is on). */
const VsPreviousStrip: FC<{
  commerce: BusinessMetrics['commerce'];
  compareEnabled: boolean;
}> = ({ commerce, compareEnabled }) => {
  const revenue = getMetricComparison(commerce?.revenue as any);
  const orders = getMetricComparison(commerce?.ordersCount as any);
  const aov = getMetricComparison(commerce?.avgOrderValue as any);
  const newCust = getMetricComparison(commerce?.newCustomers as any);

  const cells = [
    { label: 'Revenue', value: formatCurrencyWhole(revenue.value), cmp: revenue, currency: true },
    { label: 'Orders', value: formatNumber(orders.value), cmp: orders, currency: false },
    { label: 'AOV', value: formatCurrency(aov.value), cmp: aov, currency: true },
    { label: 'New customers', value: formatNumber(newCust.value), cmp: newCust, currency: false },
  ];

  return (
    <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
      {cells.map((c) => {
        const show = compareEnabled && c.cmp.compareValue !== undefined;
        const diff = show ? c.cmp.value - (c.cmp.compareValue as number) : 0;
        const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
        const color =
          dir === 'flat' ? 'text-labelColor' : dir === 'up' ? 'text-success' : 'text-error';
        const arrow = dir === 'up' ? '↑ ' : dir === 'down' ? '↓ ' : '';
        return (
          <div
            key={c.label}
            className='flex flex-col gap-1 border border-textInactiveColor bg-bgSecondary/30 p-3'
          >
            <Text variant='uppercase' className='text-labelColor text-[10px]'>
              {c.label}
            </Text>
            <Text className='font-bold text-lg tabular-nums'>{c.value}</Text>
            {show && (
              <Text variant='uppercase' className={`text-[11px] tabular-nums ${color}`}>
                {arrow}
                {c.currency ? formatCurrencyDelta(diff) : formatNumberDelta(diff)} vs prev
              </Text>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** New- vs returning-customer revenue as one split bar. */
const NewReturningSplit: FC<{ split: NewVsReturningSplit | undefined }> = ({ split }) => {
  if (!split) return null;
  const newRev = getMetricComparison(split.newRevenue as any).value;
  const retRev = getMetricComparison(split.returningRevenue as any).value;
  const total = newRev + retRev;
  if (total <= 0) return null;
  const newShare = Math.max(0, Math.min(100, split.newRevenueSharePct ?? (newRev / total) * 100));
  const retShare = 100 - newShare;

  return (
    <div>
      <div className='flex h-8 border border-textColor'>
        <div
          className='flex items-center justify-center overflow-hidden bg-textColor text-[10px] text-bgColor'
          style={{ width: `${newShare}%` }}
        >
          {newShare >= 14 ? `New ${newShare.toFixed(0)}%` : ''}
        </div>
        <div
          className='flex items-center justify-center overflow-hidden bg-textInactiveColor/40 text-[10px]'
          style={{ width: `${retShare}%` }}
        >
          {retShare >= 14 ? `Returning ${retShare.toFixed(0)}%` : ''}
        </div>
      </div>
      <div className='mt-2 flex flex-wrap justify-between gap-2 text-textBaseSize text-labelColor'>
        <span>New: {formatCurrency(newRev)}</span>
        <span>Returning: {formatCurrency(retRev)}</span>
      </div>
    </div>
  );
};

interface TopProduct {
  productId?: number;
  productName?: string;
  revenue: number;
  units: number;
  grossMarginPct?: number | null;
}

/** Top movers as cards: three products + the top traffic source. */
const TopMoverCards: FC<{
  products: TopProduct[];
  source: { name: string; sessions: number } | null;
}> = ({ products, source }) => (
  <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
    {products.map((p, idx) => (
      <div key={idx} className='border border-textInactiveColor bg-bgSecondary/30 p-3'>
        <ProductNameLink productId={p.productId} productName={p.productName} maxWidth='100%' />
        <Text className='mt-1 block font-bold text-lg tabular-nums'>
          {formatCurrency(p.revenue)}
        </Text>
        <Text className='text-labelColor text-[11px]'>
          {formatNumber(p.units)} units
          {p.grossMarginPct != null ? ` · ${p.grossMarginPct.toFixed(0)}% margin` : ''}
        </Text>
      </div>
    ))}
    {source && (
      <div className='border border-textInactiveColor bg-bgSecondary/30 p-3'>
        <Text variant='uppercase' className='text-labelColor text-[10px]'>
          Top source
        </Text>
        <Text className='mt-1 block font-bold break-words'>{source.name}</Text>
        <Text className='text-labelColor text-[11px]'>
          {formatNumber(source.sessions)} sessions · excl. direct
        </Text>
      </div>
    )}
  </div>
);

export function ThisWeekTab({
  metricsResponse,
  compareEnabled,
  period,
  compareMode,
  customFrom,
  customTo,
}: ThisWeekTabProps) {
  const metrics = metricsResponse.business;
  const commerce = metrics?.commerce;
  const traffic = metrics?.traffic;
  // ordersByDay moved into the commerce sub-message; feed getTimeSeries that record.
  const metricsRecord = commerce as Record<string, unknown> | undefined;
  const { pathname } = useLocation();
  const revenueHref = `${pathname}?tab=revenue`;
  const productsHref = `${pathname}?tab=products`;

  const { current: currentPeriodLabel, compare: comparePeriodLabel } = useMemo(
    () =>
      resolveAnalyticsPeriodLabels(
        metrics?.period,
        metrics?.comparePeriod,
        compareEnabled,
        compareMode,
        period,
        customFrom,
        customTo,
      ),
    [
      metrics?.period,
      metrics?.comparePeriod,
      compareEnabled,
      compareMode,
      period,
      customFrom,
      customTo,
    ],
  );

  const top3Products = useMemo(() => {
    const byRevenue = commerce?.topProductsByRevenue || [];
    const byQuantity = commerce?.topProductsByQuantity || [];

    // Units live in `count` on some breakdowns and in `value` on others — take whichever is
    // populated so the join doesn't silently render 0 units for every product.
    const unitsOf = (p: { count?: number; value?: unknown }) =>
      p.count && p.count > 0 ? p.count : Math.round(parseDecimal(p.value as any));
    const quantityMap = new Map(byQuantity.map((p) => [p.productId, unitsOf(p)]));

    return byRevenue.slice(0, 3).map((p) => ({
      productId: p.productId,
      productName: p.productName,
      revenue: parseDecimal(p.value),
      units: quantityMap.get(p.productId) ?? unitsOf(p),
      grossMarginPct: p.hasCost ? p.grossMarginPct : null,
    }));
  }, [commerce?.topProductsByRevenue, commerce?.topProductsByQuantity]);

  const topTrafficSource = useMemo(() => {
    const sources = traffic?.trafficBySource || [];
    const filtered = sources.filter((s) => {
      const name = [s.source, s.medium].filter(Boolean).join(' / ').toLowerCase();
      return !name.includes('direct') && !name.includes('none');
    });

    if (filtered.length === 0) return null;

    const top = filtered[0];
    return {
      name: [top.source, top.medium].filter(Boolean).join(' / ') || 'Unknown',
      sessions: top.sessions ?? 0,
    };
  }, [traffic?.trafficBySource]);

  // Payment failures = money that didn't get captured — the one ops-relevant signal kept
  // from the retired Technical tab.
  const paymentFailures = useMemo(() => {
    const rows = metricsResponse.paymentFailures ?? [];
    const count = rows.reduce((sum, r) => sum + (r.failureCount ?? 0), 0);
    const value = rows.reduce((sum, r) => sum + parseDecimal(r.totalFailedValue), 0);
    return { count, value };
  }, [metricsResponse.paymentFailures]);

  const hasTopMovers = top3Products.length > 0 || topTrafficSource != null;

  return (
    <div className='space-y-6'>
      {/* HEALTH / ACT NOW — the scorecard is the glance, the strip's act-now list is the detail. */}
      <ExecutiveHealthStrip
        metrics={metrics}
        compareEnabled={compareEnabled}
        revenueHref={revenueHref}
        currentPeriodLabel={currentPeriodLabel}
        comparePeriodLabel={comparePeriodLabel}
      />
      <HealthScorecard metrics={metrics} />

      {paymentFailures.count > 0 && (
        <div className='flex flex-wrap items-center justify-between gap-2 border-2 border-error bg-error/10 p-3'>
          <Text variant='uppercase' className='text-error text-textBaseSize font-semibold'>
            Payment failures this period
          </Text>
          <Text className='font-bold text-error'>
            {formatNumber(paymentFailures.count)} failed · {formatCurrency(paymentFailures.value)}{' '}
            not captured
          </Text>
        </div>
      )}

      <ForecastStrip forecast={metricsResponse.revenueForecast} />

      {/* HOW THE PERIOD IS GOING */}
      <div className='space-y-3'>
        <h3 className='text-textBaseSize font-bold uppercase'>How the period is going</h3>
        <VsPreviousStrip commerce={commerce} compareEnabled={compareEnabled} />
        <div className='max-w-xl space-y-2'>
          <TimeSeriesChart
            title='Orders / day'
            data={coarsenTimeSeries(getTimeSeries(metricsRecord, 'ordersByDay'))}
            valueFormat='number'
          />
          {commerce?.peakDay?.date && parseDecimal(commerce.peakDay.revenue) > 0 && (
            <Text className='text-labelColor text-textBaseSize'>
              Peak: {format(new Date(commerce.peakDay.date), 'EEE d MMM')} ·{' '}
              {formatCurrency(parseDecimal(commerce.peakDay.revenue))} ·{' '}
              {formatNumber(commerce.peakDay.orders ?? 0)} orders
            </Text>
          )}
        </div>
      </div>

      {/* NEW VS RETURNING */}
      {commerce?.newVsReturning && (
        <div className='space-y-3'>
          <h3 className='text-textBaseSize font-bold uppercase'>New vs returning</h3>
          <NewReturningSplit split={commerce.newVsReturning} />
          <details className='border border-textInactiveColor'>
            <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-2 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
              By day
            </summary>
            <div className='grid gap-4 p-4 md:grid-cols-2'>
              <TimeSeriesChart
                title='New customers'
                data={coarsenTimeSeries(commerce?.newCustomersByDay)}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Returning customers'
                data={coarsenTimeSeries(commerce?.returningCustomersByDay)}
                valueFormat='number'
              />
            </div>
          </details>
        </div>
      )}

      {/* TOP MOVERS */}
      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <h3 className='text-textBaseSize font-bold uppercase'>Top movers this period</h3>
          <Link
            to={productsHref}
            replace
            className='text-textBaseSize text-labelColor underline underline-offset-2 hover:text-textColor'
          >
            View all →
          </Link>
        </div>
        {hasTopMovers ? (
          <TopMoverCards products={top3Products} source={topTrafficSource} />
        ) : (
          <div className='border border-textInactiveColor p-4 text-center'>
            <Text className='text-labelColor text-textBaseSize'>
              No product or traffic data for this period.
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
