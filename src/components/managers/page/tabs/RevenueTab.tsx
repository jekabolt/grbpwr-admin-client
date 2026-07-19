import type { GetDashboardResponse, GetMetricsResponse } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import {
  DeliveryPanel,
  FunnelChart,
  FunnelDropoff,
  OperatingResultStrip,
  OrderValueBandsTable,
  PaymentMixTable,
  ProfitabilityPanel,
  PromoTable,
  RevenueOrdersCombo,
  RevenueSplitBar,
  RevenueWaterfall,
  Sparkline,
  TimeSeriesChart,
} from '../components';
import { orderCancellationSharePercent } from '../executiveAlerts';
import type { WaterfallStep } from '../components/RevenueWaterfall';
import {
  coarsenTimeSeries,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatNumberDelta,
  formatPercentWithBand,
  getMetricComparison,
  getTimeSeries,
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

/** Compact good/bad delta vs the comparison period. */
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
    <Text variant='uppercase' className={`text-textBaseSize ${color}`}>
      {arrow}
      {text}
    </Text>
  );
};

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
  const paymentFees = getMetricComparison(margin?.paymentFees as any);
  const contributionMargin = getMetricComparison(margin?.contributionMargin as any);
  const costCoverage = margin?.costCoveragePct ?? 0;
  const marginPctTrusted = costCoverage >= COVERAGE_FLOOR_FOR_PCT;
  // Processor fees bridge gross profit → contribution; only show the line once they're captured.
  const showFees = paymentFees.value > 0;
  // Directional processor cut as a share of net revenue — a creeping rate is the signal to watch.
  // paymentFees (from MarginMetrics) and net revenue may be scoped differently by the backend
  // (fees can be summed over a different order set than the costed-revenue view), so treat this as
  // a trend indicator, not an exact rate. Scope is backend ask S4 in docs/analytics-backend-asks.md.
  const feeRatePct = revenue.value > 0 ? (paymentFees.value / revenue.value) * 100 : null;
  // Products with no cost entered are why margin is partial/dark — name the gap to close it.
  const uncostedCount = margin?.uncostedProductIds?.length ?? 0;

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

  // Top revenue band for the "Order value distribution" summary line (collapsed view).
  const bands = metricsResponse.orderValueBands ?? [];
  const topBand = bands.length
    ? bands.reduce((best, b) => ((b.revenueSharePct ?? 0) > (best.revenueSharePct ?? 0) ? b : best))
    : null;
  const topRevenueBandLabel = topBand?.label ?? null;
  const topRevenueBandShare = topBand ? (topBand.revenueSharePct ?? 0).toFixed(0) : null;

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

  // "Where net revenue goes" split bar — estimated (grossed-up) so COGS reflects all revenue, not
  // just the costed slice. Only when costing is readable and there is some coverage.
  const profitability = metricsResponse.profitability;
  const opexV = parseDecimal(profitability?.opexTotal);
  const marketingV = parseDecimal(profitability?.marketingSpend);
  const coverageFrac = costCoverage / 100;
  const splitCosts =
    canReadCosting && coverageFrac > 0 && revenue.value > 0
      ? [
          {
            label: 'COGS',
            value: Math.max(0, revenue.value - grossMargin.value / coverageFrac),
            className: 'bg-textColor',
          },
          {
            label: 'Shipping & fees',
            value: Math.max(0, (grossMargin.value - contributionMargin.value) / coverageFrac),
            className: 'bg-textColor/60',
          },
          { label: 'OPEX', value: opexV, className: 'bg-error/60' },
          { label: 'Marketing', value: marketingV, className: 'bg-textColor/30' },
        ]
      : null;

  // Order-value verdict: revenue vs orders share carried by the big baskets (bands from ≥ €300,
  // else the single top-revenue band).
  const bigBands = bands.filter((b) => parseDecimal(b.from) >= 300);
  const verdictBands = bigBands.length > 0 ? bigBands : topBand ? [topBand] : [];
  const bigRevShare = Math.round(verdictBands.reduce((s, b) => s + (b.revenueSharePct ?? 0), 0));
  const bigOrdShare = Math.round(verdictBands.reduce((s, b) => s + (b.ordersSharePct ?? 0), 0));
  const bandThreshold = bigBands.length > 0 ? 'over €300' : topBand?.label ?? '';

  // Over-time series (coarsened weekly at volume).
  const revByDay = coarsenTimeSeries(commerce?.revenueByDay);
  const ordersByDay = coarsenTimeSeries(getTimeSeries(commerce as any, 'ordersByDay'));
  const unitsByDay = coarsenTimeSeries(commerce?.unitsSoldByDay);

  return (
    <div className='space-y-6'>
      {/* Profit is the point — lead with it. Margin is over the costed revenue subset.
          Gated on costing:read: without it the server nulls the money fields, so we hide the
          whole block rather than trust costCoveragePct (which may not be nulled) and risk €0.00. */}
      {canReadCosting && (
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-textBaseSize font-bold uppercase'>Profit &amp; Margin</h3>
            <Text variant='label' size='small'>
              {costCoverage > 0
                ? `over the ${costCoverage.toFixed(0)}% of revenue with a product cost set`
                : 'set product costs to unlock'}
              {uncostedCount > 0 &&
                ` · ${uncostedCount} product${uncostedCount === 1 ? '' : 's'} missing cost`}
            </Text>
          </div>
          {costCoverage > 0 ? (
            <div
              className={`grid grid-cols-2 ${showFees ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3 border-2 border-textInactiveColor/20 p-4 bg-bgSecondary/30`}
            >
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                  COGS
                </Text>
                <Text className='font-bold text-lg'>{formatCurrency(revenueCost.value)}</Text>
              </div>
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                  Gross Profit
                </Text>
                <Text className='font-bold text-lg'>{formatCurrency(grossMargin.value)}</Text>
                <Delta
                  cur={grossMargin.value}
                  prev={grossMargin.compareValue}
                  kind='currency'
                  enabled={compareEnabled}
                />
              </div>
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                  Gross Margin
                </Text>
                <Text className='font-bold text-lg'>
                  {marginPctTrusted ? `${grossMarginPct.value.toFixed(0)}%` : '—'}
                </Text>
                {marginPctTrusted ? (
                  <Delta
                    cur={grossMarginPct.value}
                    prev={grossMarginPct.compareValue}
                    kind='pp'
                    enabled={compareEnabled}
                  />
                ) : (
                  <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                    need ≥{COVERAGE_FLOOR_FOR_PCT}% costed
                  </Text>
                )}
              </div>
              {showFees && (
                <div className='space-y-1'>
                  <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                    Payment fees
                  </Text>
                  <Text className='font-bold text-lg'>−{formatCurrency(paymentFees.value)}</Text>
                  {feeRatePct != null && (
                    <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                      {feeRatePct.toFixed(1)}% of revenue
                    </Text>
                  )}
                  <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                    processor cut
                  </Text>
                </div>
              )}
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                  Contribution (not profit)
                </Text>
                <Text className='font-bold text-lg'>
                  {formatCurrency(contributionMargin.value)}
                </Text>
                <Delta
                  cur={contributionMargin.value}
                  prev={contributionMargin.compareValue}
                  kind='currency'
                  enabled={compareEnabled}
                />
                <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                  {showFees ? 'after shipping & fees' : 'after shipping'} · before opex
                </Text>
              </div>
            </div>
          ) : (
            <div className='border border-textInactiveColor p-4 bg-bgSecondary/20'>
              <Text variant='label' size='small'>
                No product costs entered yet — add cost (EUR) on products to see gross profit,
                margin %, and contribution here.
              </Text>
            </div>
          )}
        </div>
      )}

      {/* Full P&L waterfall + unit economics (costing-gated). Absorbs the operating-result
          waterfall that used to live in OperatingResultStrip. */}
      {canReadCosting && (
        <ProfitabilityPanel
          profitability={metricsResponse.profitability}
          compareEnabled={compareEnabled}
          operatingResultChangePct={dashboard?.compare?.operatingResultChangePct}
        />
      )}

      {splitCosts && (
        <div className='space-y-2'>
          <h3 className='text-textBaseSize font-bold uppercase'>Where net revenue goes</h3>
          <Text variant='label' size='small'>
            estimated split of each € of net revenue (COGS grossed up to all revenue, not just the
            costed slice)
          </Text>
          <div className='border border-textInactiveColor p-4'>
            <RevenueSplitBar netRevenue={revenue.value} costs={splitCosts} />
          </div>
        </div>
      )}

      {/* GA4 coverage note, from GetDashboard (the waterfall moved into ProfitabilityPanel). */}
      <OperatingResultStrip dashboard={dashboard} />

      <div className='space-y-6'>
        <h3 className='text-textBaseSize font-bold uppercase'>Revenue &amp; Orders</h3>

        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 border border-textInactiveColor p-4 bg-bgSecondary/20'>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
              Net revenue (ex-VAT)
            </Text>
            <Text className='font-bold'>{formatCurrency(revenue.value)}</Text>
            <Delta
              cur={revenue.value}
              prev={revenue.compareValue}
              kind='currency'
              enabled={compareEnabled}
            />
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
              Gross Revenue
            </Text>
            <Text className='font-bold'>{formatCurrency(grossRevenue.value)}</Text>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
              before discounts
            </Text>
            {discountRate.value > 0 && (
              <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                −{discountRate.value.toFixed(1)}% discounts
              </Text>
            )}
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
              Orders
            </Text>
            <Text className='font-bold'>{formatNumber(orders.value)}</Text>
            <Delta
              cur={orders.value}
              prev={orders.compareValue}
              kind='number'
              enabled={compareEnabled}
            />
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
              AOV
            </Text>
            <Text className='font-bold'>{formatCurrency(aov.value)}</Text>
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
              Refunds
            </Text>
            <Text className='font-bold'>
              {formatNumber(refundedCount)}{' '}
              <span className='text-labelColor text-textBaseSize'>of {formatNumber(ordersN)}</span>
            </Text>
            {showRates && (
              <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                {formatPercentWithBand(refundRate.value, refundRate.marginOfError)}
              </Text>
            )}
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
              Cancelled
            </Text>
            <Text className='font-bold'>
              {formatNumber(cancelledCount)}{' '}
              <span className='text-labelColor text-textBaseSize'>of {formatNumber(ordersN)}</span>
            </Text>
            {showRates && cancellationPct != null && (
              <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
                {cancellationPct.toFixed(1)}%
              </Text>
            )}
          </div>
        </div>

        {/* Money story in one column: gross → net → contribution. */}
        <div className='border border-textInactiveColor p-4'>
          <Text variant='uppercase' className='mb-3 block font-bold'>
            Revenue → contribution
          </Text>
          <RevenueWaterfall steps={waterfallSteps} />
        </div>

        {/* How the period moved: sparkline strip + combined revenue/orders chart. */}
        <div className='grid grid-cols-3 gap-3'>
          <Sparkline label='Revenue' data={revByDay} />
          <Sparkline label='Orders' data={ordersByDay} number />
          <Sparkline label='Units' data={unitsByDay} number />
        </div>
        <RevenueOrdersCombo revenue={revByDay} orders={ordersByDay} />
      </div>

      {(metricsResponse.orderValueBands?.length ?? 0) > 0 && (
        <div className='space-y-2'>
          <h3 className='text-textBaseSize font-bold uppercase'>Order value</h3>
          {bigRevShare > 0 && verdictBands.length > 0 ? (
            <Text className='text-textBaseSize font-bold'>
              {bigRevShare}% of revenue comes from the {bigOrdShare}% of orders {bandThreshold}.
            </Text>
          ) : (
            <Text variant='label' size='small'>
              Net revenue by basket size — a few large baskets usually carry most of the money.
            </Text>
          )}
          <div className='border border-textInactiveColor p-4'>
            <OrderValueBandsTable bands={metricsResponse.orderValueBands} aovValue={aov.value} />
          </div>
        </div>
      )}

      {metricsResponse.funnel?.aggregate && (
        <div className='space-y-2'>
          <h3 className='text-textBaseSize font-bold uppercase'>Purchase funnel</h3>
          <Text variant='label' size='small'>
            Where browsers drop off on the way to purchase (browse → cart → buy).
          </Text>
          <div className='space-y-3 border border-textInactiveColor p-4'>
            <FunnelDropoff funnel={metricsResponse.funnel} />
            <details>
              <summary className='cursor-pointer text-textBaseSize text-labelColor'>
                Full funnel bars
              </summary>
              <div className='mt-2'>
                <FunnelChart funnel={metricsResponse.funnel} />
              </div>
            </details>
          </div>
        </div>
      )}

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

      {(commerce?.revenueByPaymentMethod?.length ?? 0) > 0 && (
        <details className='border border-textInactiveColor'>
          <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
            Payments
          </summary>
          <div className='space-y-3 p-4'>
            <Text className='text-textBaseSize text-labelColor leading-relaxed'>
              Revenue by payment method over the period. Settled revenue by channel lives in{' '}
              <Link to={{ search: '?tab=growth' }} className='underline hover:text-blue'>
                Growth
              </Link>
              .
            </Text>
            <PaymentMixTable methods={commerce?.revenueByPaymentMethod} />
          </div>
        </details>
      )}

      <PromoTable metrics={metrics} />
    </div>
  );
}
