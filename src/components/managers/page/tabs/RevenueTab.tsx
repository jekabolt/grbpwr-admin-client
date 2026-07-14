import type { GetDashboardResponse, GetMetricsResponse } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { type FC } from 'react';
import Text from 'ui/components/text';
import { FunnelChart, OperatingResultStrip, PromoTable, TimeSeriesChart } from '../components';
import { orderCancellationSharePercent } from '../executiveAlerts';
import {
  coarsenTimeSeries,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatNumberDelta,
  formatPercentWithBand,
  getMetricComparison,
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
    good === 'flat' ? 'text-textInactiveColor' : good === 'good' ? 'text-success' : 'text-error';
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
  // Products with no cost entered are why margin is partial/dark — name the gap to close it.
  const uncostedCount = margin?.uncostedProductIds?.length ?? 0;

  return (
    <div className='space-y-6'>
      {/* Profit is the point — lead with it. Margin is over the costed revenue subset.
          Gated on costing:read: without it the server nulls the money fields, so we hide the
          whole block rather than trust costCoveragePct (which may not be nulled) and risk €0.00. */}
      {canReadCosting && (
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-textBaseSize font-bold uppercase'>Profit &amp; Margin</h3>
            <Text variant='inactive' size='small'>
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
                <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
                  COGS
                </Text>
                <Text className='font-bold text-lg'>{formatCurrency(revenueCost.value)}</Text>
              </div>
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
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
                <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
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
                  <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
                    need ≥{COVERAGE_FLOOR_FOR_PCT}% costed
                  </Text>
                )}
              </div>
              {showFees && (
                <div className='space-y-1'>
                  <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
                    Payment fees
                  </Text>
                  <Text className='font-bold text-lg'>−{formatCurrency(paymentFees.value)}</Text>
                  <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
                    processor cut
                  </Text>
                </div>
              )}
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
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
                <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
                  {showFees ? 'after shipping & fees' : 'after shipping'} · before opex
                </Text>
              </div>
            </div>
          ) : (
            <div className='border border-textInactiveColor p-4 bg-bgSecondary/20'>
              <Text variant='inactive' size='small'>
                No product costs entered yet — add cost (EUR) on products to see gross profit,
                margin %, and contribution here.
              </Text>
            </div>
          )}
        </div>
      )}

      {/* Operating result (contribution − opex − marketing) + GA4 coverage, from GetDashboard. */}
      <OperatingResultStrip dashboard={dashboard} />

      <div className='space-y-6'>
        <h3 className='text-textBaseSize font-bold uppercase'>Revenue &amp; Orders</h3>

        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 border border-textInactiveColor p-4 bg-bgSecondary/20'>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
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
            <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
              Gross Revenue
            </Text>
            <Text className='font-bold'>{formatCurrency(grossRevenue.value)}</Text>
            <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
              before discounts
            </Text>
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
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
            <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
              AOV
            </Text>
            <Text className='font-bold'>{formatCurrency(aov.value)}</Text>
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
              Refunds
            </Text>
            <Text className='font-bold'>
              {formatNumber(refundedCount)}{' '}
              <span className='text-textInactiveColor text-textBaseSize'>
                of {formatNumber(ordersN)}
              </span>
            </Text>
            {showRates && (
              <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
                {formatPercentWithBand(refundRate.value, refundRate.marginOfError)}
              </Text>
            )}
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
              Cancelled
            </Text>
            <Text className='font-bold'>
              {formatNumber(cancelledCount)}{' '}
              <span className='text-textInactiveColor text-textBaseSize'>
                of {formatNumber(ordersN)}
              </span>
            </Text>
            {showRates && cancellationPct != null && (
              <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
                {cancellationPct.toFixed(1)}%
              </Text>
            )}
          </div>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='Net revenue (ex-VAT)'
            data={coarsenTimeSeries(commerce?.revenueByDay)}
          />
          <TimeSeriesChart
            title='Gross revenue'
            data={coarsenTimeSeries(commerce?.grossRevenueByDay)}
          />
        </div>
      </div>

      <details className='border border-textInactiveColor' open>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
          Purchase Funnel
        </summary>
        <div className='space-y-3 p-4'>
          <Text className='text-textBaseSize text-textInactiveColor leading-relaxed'>
            Where browsers drop off on the way to purchase (browse → cart → buy).
          </Text>
          <FunnelChart funnel={metricsResponse.funnel} />
        </div>
      </details>

      <details className='border border-textInactiveColor'>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-textBaseSize font-bold uppercase hover:bg-bgSecondary/50'>
          Shipping & Delivery
        </summary>
        <div className='space-y-6 p-4'>
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

      <PromoTable metrics={metrics} />
    </div>
  );
}
