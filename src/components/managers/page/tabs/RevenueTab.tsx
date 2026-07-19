import type { GetDashboardResponse, GetMetricsResponse } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { type FC, type ReactNode } from 'react';
import Text from 'ui/components/text';
import {
  DeliveryPanel,
  FunnelChart,
  FunnelDropoff,
  OperatingResultStrip,
  OrderValueBandsBars,
  PaymentMixBars,
  ProfitabilityPanel,
  PromoBars,
  RevenueWaterfall,
  SectionHead,
  StatGrid,
  TimeSeriesChart,
} from '../components';
import type { StatCell } from '../components/StatGrid';
import type { WaterfallStep } from '../components/RevenueWaterfall';
import { orderCancellationSharePercent } from '../executiveAlerts';
import {
  coarsenTimeSeries,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatNumberDelta,
  formatPercentWithBand,
  getMetricComparison,
  parseDecimal,
} from '../utils';

interface RevenueTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled?: boolean;
  dashboard?: GetDashboardResponse;
}

// Below this coverage the margin % is a biased average of an unrepresentative slice; the € totals
// are still real (they're just "over the costed subset"), but the percentage would mislead.
const COVERAGE_FLOOR_FOR_PCT = 80;
// Rate over fewer orders than this is inside its own error band — show the raw count instead.
const MIN_ORDERS_FOR_RATE = 30;

/** Compact good/bad delta vs the comparison period, in the shared arrow grammar. */
const Delta: FC<{
  cur: number;
  prev: number | undefined;
  kind: 'currency' | 'pp' | 'number';
  enabled: boolean;
  higherIsBetter?: boolean;
}> = ({ cur, prev, kind, enabled, higherIsBetter = true }) => {
  if (!enabled || prev === undefined) return null;
  const diff = cur - prev;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const good = dir === 'flat' ? 'flat' : (dir === 'up') === higherIsBetter ? 'good' : 'bad';
  const color =
    good === 'flat' ? 'text-labelColor' : good === 'good' ? 'text-success' : 'text-error';
  const arrow = dir === 'up' ? '↑ ' : dir === 'down' ? '↓ ' : '';
  const text =
    kind === 'currency'
      ? formatCurrencyDelta(diff)
      : kind === 'pp'
        ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(1)}pp`
        : formatNumberDelta(diff);
  return (
    <Text variant='uppercase' className={`text-[10px] ${color}`}>
      {arrow}
      {text}
    </Text>
  );
};

const Muted: FC<{ children: ReactNode }> = ({ children }) => (
  <Text variant='uppercase' className='text-labelColor text-[10px]'>
    {children}
  </Text>
);

export function RevenueTab({
  metricsResponse,
  compareEnabled = false,
  dashboard,
}: RevenueTabProps) {
  const { canReadCosting } = usePermissions();
  const metrics = metricsResponse.business;
  const commerce = metrics?.commerce;
  const margin = metrics?.margin;

  const revenue = getMetricComparison(commerce?.revenue as any);
  const grossRevenue = getMetricComparison(commerce?.grossRevenue as any);
  const orders = getMetricComparison(commerce?.ordersCount as any);
  const aov = getMetricComparison(commerce?.avgOrderValue as any);
  const refundRate = getMetricComparison(commerce?.refundRate as any);
  const discountRate = getMetricComparison(commerce?.discountRatePct as any);
  const cancellationPct = orderCancellationSharePercent(metrics);

  const ordersN = orders.value;
  const refundedCount = Math.round((refundRate.value / 100) * ordersN);
  const cancelledCount = Math.round(((cancellationPct ?? 0) / 100) * ordersN);
  const showRates = ordersN >= MIN_ORDERS_FOR_RATE;

  // Margin — computed only over the costed subset of revenue (products with a cost set).
  const revenueCost = getMetricComparison(margin?.revenueCost as any);
  const grossMargin = getMetricComparison(margin?.grossMargin as any);
  const grossMarginPct = getMetricComparison(margin?.grossMarginPct as any);
  const contributionMargin = getMetricComparison(margin?.contributionMargin as any);
  const costCoverage = margin?.costCoveragePct ?? 0;
  const marginPctTrusted = costCoverage >= COVERAGE_FLOOR_FOR_PCT;
  const contribShown = canReadCosting && costCoverage > 0;
  const marginShown = canReadCosting && marginPctTrusted;

  // Compact door-to-door / on-time stat for the Shipping & Delivery summary line (collapsed view).
  const delivery = metricsResponse.delivery;
  const deliverySummary = (() => {
    if (!delivery) return null;
    const parts: string[] = [];
    if ((delivery.deliveredSample ?? 0) >= 10 && (delivery.medianDaysPlacedToDelivered ?? 0) > 0) {
      parts.push(`${delivery.medianDaysPlacedToDelivered!.toFixed(1)} d median door-to-door`);
    }
    if ((delivery.onTimeSample ?? 0) >= 10) {
      parts.push(`${(delivery.onTimeRatePct ?? 0).toFixed(0)}% on-time`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  // Money-headline waterfall: gross → net → contribution (costing rows only when we have coverage).
  const waterfallSteps: WaterfallStep[] = [
    { label: 'Gross revenue', value: grossRevenue.value, kind: 'base' },
  ];
  const discountsAndRefunds = grossRevenue.value - revenue.value;
  if (discountsAndRefunds > 0)
    waterfallSteps.push({
      label: '− Discounts & refunds',
      value: discountsAndRefunds,
      kind: 'neg',
    });
  waterfallSteps.push({ label: '= Net revenue', value: revenue.value, kind: 'subtotal' });
  if (canReadCosting && costCoverage > 0) {
    waterfallSteps.push({ label: '− COGS', value: revenueCost.value, kind: 'neg' });
    const shipFees = grossMargin.value - contributionMargin.value;
    if (shipFees > 0)
      waterfallSteps.push({ label: '− Shipping & fees', value: shipFees, kind: 'neg' });
    waterfallSteps.push({
      label: '= Contribution',
      value: contributionMargin.value,
      kind: 'final',
    });
  }

  // Two KPI grids for the money headline (config: Headline=waterfall + two).
  const kpiPrimary: StatCell[] = [
    {
      label: 'Net revenue',
      value: formatCurrency(revenue.value),
      sub: (
        <Delta
          cur={revenue.value}
          prev={revenue.compareValue}
          kind='currency'
          enabled={compareEnabled}
        />
      ),
    },
    {
      label: 'Contribution',
      value: contribShown ? formatCurrency(contributionMargin.value) : '—',
      sub: contribShown ? (
        <Delta
          cur={contributionMargin.value}
          prev={contributionMargin.compareValue}
          kind='currency'
          enabled={compareEnabled}
        />
      ) : (
        <Muted>set product costs</Muted>
      ),
    },
    {
      label: 'Gross margin',
      value: marginShown ? `${grossMarginPct.value.toFixed(0)}%` : '—',
      sub: (
        <Muted>
          {costCoverage > 0 ? `${costCoverage.toFixed(0)}% costed` : 'no costs set'}
          {costCoverage > 0 && !marginShown ? ` · need ≥${COVERAGE_FLOOR_FOR_PCT}%` : ''}
        </Muted>
      ),
    },
    {
      label: 'Orders',
      value: formatNumber(orders.value),
      sub: (
        <Delta
          cur={orders.value}
          prev={orders.compareValue}
          kind='number'
          enabled={compareEnabled}
        />
      ),
    },
  ];

  const kpiSecondary: StatCell[] = [
    {
      label: 'Gross revenue',
      value: formatCurrency(grossRevenue.value),
      sub: (
        <Muted>
          before disc.{discountRate.value > 0 ? ` · −${discountRate.value.toFixed(1)}%` : ''}
        </Muted>
      ),
    },
    { label: 'AOV', value: formatCurrency(aov.value) },
    {
      label: 'Refunds',
      value: (
        <>
          {formatNumber(refundedCount)}{' '}
          <span className='text-labelColor text-[11px]'>of {formatNumber(ordersN)}</span>
        </>
      ),
      sub: showRates ? (
        <Muted>{formatPercentWithBand(refundRate.value, refundRate.marginOfError)}</Muted>
      ) : undefined,
    },
    {
      label: 'Cancelled',
      value: (
        <>
          {formatNumber(cancelledCount)}{' '}
          <span className='text-labelColor text-[11px]'>of {formatNumber(ordersN)}</span>
        </>
      ),
      sub:
        showRates && cancellationPct != null ? (
          <Muted>{cancellationPct.toFixed(1)}%</Muted>
        ) : undefined,
    },
  ];

  // Order-value verdict: revenue vs orders share carried by the big baskets (bands from ≥ €300,
  // else the single top-revenue band).
  const bands = metricsResponse.orderValueBands ?? [];
  const topBand = bands.length
    ? bands.reduce((best, b) => ((b.revenueSharePct ?? 0) > (best.revenueSharePct ?? 0) ? b : best))
    : null;
  const bigBands = bands.filter((b) => parseDecimal(b.from) >= 300);
  const verdictBands = bigBands.length > 0 ? bigBands : topBand ? [topBand] : [];
  const bigRevShare = Math.round(verdictBands.reduce((s, b) => s + (b.revenueSharePct ?? 0), 0));
  const bigOrdShare = Math.round(verdictBands.reduce((s, b) => s + (b.ordersSharePct ?? 0), 0));
  const bandThreshold = bigBands.length > 0 ? 'over €300' : topBand?.label ?? '';

  // Over-time series (coarsened weekly at volume).
  const revByDay = coarsenTimeSeries(commerce?.revenueByDay);
  const grossRevByDay = coarsenTimeSeries(commerce?.grossRevenueByDay);

  const hasPayments = (commerce?.revenueByPaymentMethod?.length ?? 0) > 0;
  const hasPromos = (commerce?.revenueByPromo?.length ?? 0) > 0;

  return (
    <div className='space-y-8'>
      {/* MONEY HEADLINE — revenue waterfall + two KPI grids (config: Headline=waterfall + two). */}
      <section className='space-y-3'>
        <SectionHead title='Money headline' sub="— how much came in, what's left" />
        <StatGrid cells={kpiPrimary} />
        <StatGrid cells={kpiSecondary} />
        <div className='space-y-1.5 pt-1'>
          <Muted>Revenue → contribution</Muted>
          <RevenueWaterfall steps={waterfallSteps} />
        </div>
      </section>

      {/* P&L / PROFITABILITY — waterfall + unit economics (config: PL=waterfall). Costing-gated:
          without costing:read the server nulls the money fields, so hide the whole section. */}
      {canReadCosting && (
        <section className='space-y-3'>
          <SectionHead
            title='P&L / profitability'
            sub='— costs down to operating result + unit economics'
          />
          <ProfitabilityPanel
            profitability={metricsResponse.profitability}
            compareEnabled={compareEnabled}
            operatingResultChangePct={dashboard?.compare?.operatingResultChangePct}
          />
          <OperatingResultStrip dashboard={dashboard} />
        </section>
      )}

      {/* OVER TIME — two line charts (config: Trend=twolines). */}
      <section className='space-y-3'>
        <SectionHead title='Over time' sub='— revenue & order trend across the period' />
        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart title='Net revenue / day' data={revByDay} />
          <TimeSeriesChart title='Gross revenue / day' data={grossRevByDay} />
        </div>
      </section>

      {/* ORDER VALUE — revenue-share bars + verdict (config: Bands=bars). */}
      {bands.length > 0 && (
        <section className='space-y-3'>
          <SectionHead title='Order value' sub='— do a few big baskets carry the revenue?' />
          {bigRevShare > 0 && verdictBands.length > 0 ? (
            <Text className='text-[13px] font-bold leading-snug'>
              {bigRevShare}% of revenue comes from the {bigOrdShare}% of orders {bandThreshold}.
            </Text>
          ) : (
            <Text variant='label' size='small'>
              Net revenue by basket size — a few large baskets usually carry most of the money.
            </Text>
          )}
          <OrderValueBandsBars bands={bands} />
        </section>
      )}

      {/* PURCHASE FUNNEL — drop-off + biggest leak (config: Funnel=dropoff). */}
      {metricsResponse.funnel?.aggregate && (
        <section className='space-y-3'>
          <SectionHead
            title='Purchase funnel'
            sub='— where browsers drop off on the way to buying'
          />
          <FunnelDropoff funnel={metricsResponse.funnel} />
          <details>
            <summary className='cursor-pointer text-textBaseSize text-labelColor'>
              Full funnel bars
            </summary>
            <div className='mt-2'>
              <FunnelChart funnel={metricsResponse.funnel} />
            </div>
          </details>
        </section>
      )}

      {/* PAYMENTS & PROMO — mix bars (config: PayPromo=bars). */}
      {(hasPayments || hasPromos) && (
        <section className='space-y-3'>
          <SectionHead title='Payments & promo' sub='— method mix & promo-driven revenue' />
          <div className='grid gap-6 md:grid-cols-2'>
            {hasPayments && (
              <div className='space-y-2'>
                <Muted>By payment method</Muted>
                <PaymentMixBars methods={commerce?.revenueByPaymentMethod} />
              </div>
            )}
            {hasPromos && (
              <div className='space-y-2'>
                <Muted>By promo code</Muted>
                <PromoBars metrics={metrics} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* SHIPPING & DELIVERY — ops detail, collapsed (not a headline metric). */}
      <details className='border border-textInactiveColor'>
        <summary className='flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 bg-bgSecondary/30 px-4 py-3 hover:bg-bgSecondary/50'>
          <span className='text-textBaseSize font-bold uppercase'>Shipping &amp; Delivery</span>
          {deliverySummary && (
            <span className='text-textBaseSize text-labelColor normal-case'>{deliverySummary}</span>
          )}
        </summary>
        <div className='space-y-6 p-4'>
          <DeliveryPanel delivery={delivery} />
          <div className='grid gap-4 md:grid-cols-2'>
            <TimeSeriesChart
              title='Units sold'
              data={coarsenTimeSeries(commerce?.unitsSoldByDay)}
              valueFormat='number'
            />
            <TimeSeriesChart
              title='Shipped'
              data={coarsenTimeSeries(commerce?.shippedByDay)}
              valueFormat='number'
            />
            <TimeSeriesChart
              title='Delivered'
              data={coarsenTimeSeries(commerce?.deliveredByDay)}
              valueFormat='number'
            />
            <TimeSeriesChart title='Refunds' data={coarsenTimeSeries(commerce?.refundsByDay)} />
          </div>
        </div>
      </details>
    </div>
  );
}
