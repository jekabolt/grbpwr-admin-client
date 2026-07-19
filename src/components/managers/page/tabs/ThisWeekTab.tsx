import type {
  BusinessMetrics,
  CompareMode,
  GetMetricsResponse,
  NewVsReturningSplit,
} from 'api/proto-http/admin';
import { FC, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import { ExecutiveHealthStrip, ForecastStrip, SectionHead } from '../components';
import { ProductNameLink } from '../components/ProductNameLink';
import type { MetricsPeriod } from '../useMetricsQuery';
import {
  formatCurrency,
  formatCurrencyWhole,
  formatNumber,
  getMetricComparison,
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

/** This period vs the previous one as a connected stats grid: value + % change + prior value.
 *  Deltas only render when compare is on (matches the "vs-previous" stub pick). */
const VsPreviousStrip: FC<{
  commerce: BusinessMetrics['commerce'];
  compareEnabled: boolean;
}> = ({ commerce, compareEnabled }) => {
  const revenue = getMetricComparison(commerce?.revenue as any);
  const orders = getMetricComparison(commerce?.ordersCount as any);
  const aov = getMetricComparison(commerce?.avgOrderValue as any);
  const newCust = getMetricComparison(commerce?.newCustomers as any);

  const cells: {
    label: string;
    cmp: ReturnType<typeof getMetricComparison>;
    fmt: (v: number) => string;
  }[] = [
    { label: 'Revenue', cmp: revenue, fmt: formatCurrencyWhole },
    { label: 'Orders', cmp: orders, fmt: formatNumber },
    { label: 'AOV', cmp: aov, fmt: formatCurrency },
    { label: 'New customers', cmp: newCust, fmt: formatNumber },
  ];

  return (
    <div className='grid grid-cols-2 border-l border-t border-textInactiveColor md:grid-cols-4'>
      {cells.map((c) => {
        const prev = c.cmp.compareValue;
        const show = compareEnabled && prev !== undefined && prev !== 0;
        const diff = show ? c.cmp.value - (prev as number) : 0;
        const pct = show ? (diff / Math.abs(prev as number)) * 100 : 0;
        const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
        const color =
          dir === 'flat' ? 'text-labelColor' : dir === 'up' ? 'text-success' : 'text-error';
        const arrow = dir === 'up' ? '↑ ' : dir === 'down' ? '↓ ' : '';
        return (
          <div key={c.label} className='border-r border-b border-textInactiveColor px-3 py-2.5'>
            <Text variant='uppercase' className='text-labelColor block text-[10px]'>
              {c.label}
            </Text>
            <Text className='block font-bold text-lg tabular-nums'>{c.fmt(c.cmp.value)}</Text>
            {show && (
              <Text variant='uppercase' className={`block text-[10px] tabular-nums ${color}`}>
                {arrow}
                {Math.abs(pct).toFixed(0)}% vs {c.fmt(prev as number)}
              </Text>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** New- vs returning-customer revenue as one split bar + a plain-language verdict. */
const NewReturningSplit: FC<{ split: NewVsReturningSplit | undefined; repeatRatePct?: number }> = ({
  split,
  repeatRatePct,
}) => {
  if (!split) return null;
  const newRev = getMetricComparison(split.newRevenue as any).value;
  const retRev = getMetricComparison(split.returningRevenue as any).value;
  const total = newRev + retRev;
  if (total <= 0) return null;
  const newShare = Math.max(0, Math.min(100, split.newRevenueSharePct ?? (newRev / total) * 100));
  const retShare = 100 - newShare;

  return (
    <div>
      <div className='flex h-[30px] border border-textColor'>
        <div
          className='flex items-center justify-center overflow-hidden bg-textColor px-1 text-[10px] whitespace-nowrap text-bgColor'
          style={{ width: `${newShare}%` }}
        >
          {newShare >= 22 ? `New · ${formatCurrency(newRev)} · ${newShare.toFixed(0)}%` : ''}
        </div>
        <div
          className='flex items-center justify-center overflow-hidden bg-textInactiveColor px-1 text-[10px] whitespace-nowrap'
          style={{ width: `${retShare}%` }}
        >
          {retShare >= 14 ? `Repeat · ${retShare.toFixed(0)}%` : ''}
        </div>
      </div>
      <Text variant='uppercase' className='text-labelColor mt-2 block text-[10px]'>
        {repeatRatePct != null ? `repeat ${repeatRatePct.toFixed(0)}% of customers, ` : ''}
        {retShare.toFixed(0)}% of revenue · growth {newShare >= 50 ? 'new-led' : 'repeat-led'}
      </Text>
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
      <div key={idx} className='border border-textInactiveColor p-3'>
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
      <div className='border border-textInactiveColor p-3'>
        <Text variant='uppercase' className='text-labelColor block text-[10px]'>
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

  const repeatRatePct = useMemo(
    () => getMetricComparison(commerce?.repeatCustomersRate as any).value,
    [commerce?.repeatCustomersRate],
  );

  const hasTopMovers = top3Products.length > 0 || topTrafficSource != null;

  return (
    <div className='space-y-6'>
      {/* HEALTH / ACT NOW — status pill + act-now list (config: Health=pill). */}
      <ExecutiveHealthStrip
        metrics={metrics}
        compareEnabled={compareEnabled}
        revenueHref={revenueHref}
        currentPeriodLabel={currentPeriodLabel}
        comparePeriodLabel={comparePeriodLabel}
      />

      {paymentFailures.count > 0 && (
        <div className='flex flex-wrap items-center justify-between gap-2 border-2 border-error bg-bgSecondary p-3'>
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

      {/* HOW THE PERIOD IS GOING — vs-previous stats grid (config: Trend=vsprev). */}
      <div className='space-y-3'>
        <SectionHead title='How the period is going' sub='— trend & movement vs previous' />
        <VsPreviousStrip commerce={commerce} compareEnabled={compareEnabled} />
      </div>

      {/* NEW VS RETURNING — split bar + verdict (config: Acq=split). */}
      {commerce?.newVsReturning && (
        <div className='space-y-3'>
          <SectionHead title='New vs returning' sub='— are we growing on new or repeat?' />
          <NewReturningSplit split={commerce.newVsReturning} repeatRatePct={repeatRatePct} />
        </div>
      )}

      {/* TOP MOVERS — product + source cards (config: Top=cards). */}
      <div className='space-y-3'>
        <SectionHead
          title='Top movers'
          sub='— best products & traffic source'
          right={
            <Link
              to={productsHref}
              replace
              className='text-textBaseSize text-labelColor underline underline-offset-2 hover:text-textColor'
            >
              View all →
            </Link>
          }
        />
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
