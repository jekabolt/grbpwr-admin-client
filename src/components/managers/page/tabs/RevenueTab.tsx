import type { GetMetricsResponse } from 'api/proto-http/admin';
import { type FC } from 'react';
import Text from 'ui/components/text';
import { FunnelChart, PromoTable, TimeSeriesChart } from '../components';
import { orderCancellationSharePercent } from '../executiveAlerts';
import {
  coarsenTimeSeries,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatNumberDelta,
  getMetricComparison,
} from '../utils';

interface RevenueTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled?: boolean;
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
    good === 'flat' ? 'text-textInactiveColor' : good === 'good' ? 'text-green-600' : 'text-error';
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

export function RevenueTab({ metricsResponse, compareEnabled = false }: RevenueTabProps) {
  const metrics = metricsResponse.business;

  const revenue = getMetricComparison(metrics?.revenue as any);
  const grossRevenue = getMetricComparison(metrics?.grossRevenue as any);
  const orders = getMetricComparison(metrics?.ordersCount as any);
  const aov = getMetricComparison(metrics?.avgOrderValue as any);
  const refundRate = getMetricComparison(metrics?.refundRate as any);
  const cancellationPct = orderCancellationSharePercent(metrics);

  const ordersN = orders.value;
  const refundedCount = Math.round((refundRate.value / 100) * ordersN);
  const cancelledCount = Math.round(((cancellationPct ?? 0) / 100) * ordersN);
  const showRates = ordersN >= MIN_ORDERS_FOR_RATE;

  // Margin — computed only over the costed subset of revenue (products with a cost set).
  const revenueCost = getMetricComparison(metrics?.revenueCost as any);
  const grossMargin = getMetricComparison(metrics?.grossMargin as any);
  const grossMarginPct = getMetricComparison(metrics?.grossMarginPct as any);
  const contributionMargin = getMetricComparison(metrics?.contributionMargin as any);
  const costCoverage = metrics?.costCoveragePct ?? 0;
  const marginPctTrusted = costCoverage >= COVERAGE_FLOOR_FOR_PCT;

  return (
    <div className='space-y-6'>
      {/* Profit is the point — lead with it. Margin is over the costed revenue subset. */}
      <div className='space-y-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h3 className='text-sm font-bold uppercase'>Profit &amp; Margin</h3>
          <Text variant='inactive' size='small'>
            {costCoverage > 0
              ? `over the ${costCoverage.toFixed(0)}% of revenue with a product cost set`
              : 'set product costs to unlock'}
          </Text>
        </div>
        {costCoverage > 0 ? (
          <div className='grid grid-cols-2 md:grid-cols-4 gap-3 border-2 border-textColor/20 p-4 bg-bgSecondary/30'>
            <div className='space-y-1'>
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                COGS
              </Text>
              <Text className='font-bold text-lg'>{formatCurrency(revenueCost.value)}</Text>
            </div>
            <div className='space-y-1'>
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                Gross Profit
              </Text>
              <Text className='font-bold text-lg'>{formatCurrency(grossMargin.value)}</Text>
              <Delta cur={grossMargin.value} prev={grossMargin.compareValue} kind='currency' enabled={compareEnabled} />
            </div>
            <div className='space-y-1'>
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                Gross Margin
              </Text>
              <Text className='font-bold text-lg'>
                {marginPctTrusted ? `${grossMarginPct.value.toFixed(0)}%` : '—'}
              </Text>
              {marginPctTrusted ? (
                <Delta cur={grossMarginPct.value} prev={grossMarginPct.compareValue} kind='pp' enabled={compareEnabled} />
              ) : (
                <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                  need ≥{COVERAGE_FLOOR_FOR_PCT}% costed
                </Text>
              )}
            </div>
            <div className='space-y-1'>
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                Contribution
              </Text>
              <Text className='font-bold text-lg'>{formatCurrency(contributionMargin.value)}</Text>
              <Delta cur={contributionMargin.value} prev={contributionMargin.compareValue} kind='currency' enabled={compareEnabled} />
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                after shipping
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

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Revenue &amp; Orders</h3>

        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 border border-textInactiveColor p-4 bg-bgSecondary/20'>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Revenue
            </Text>
            <Text className='font-bold'>{formatCurrency(revenue.value)}</Text>
            <Delta cur={revenue.value} prev={revenue.compareValue} kind='currency' enabled={compareEnabled} />
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Gross Revenue
            </Text>
            <Text className='font-bold'>{formatCurrency(grossRevenue.value)}</Text>
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Orders
            </Text>
            <Text className='font-bold'>{formatNumber(orders.value)}</Text>
            <Delta cur={orders.value} prev={orders.compareValue} kind='number' enabled={compareEnabled} />
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              AOV
            </Text>
            <Text className='font-bold'>{formatCurrency(aov.value)}</Text>
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Refunds
            </Text>
            <Text className='font-bold'>
              {formatNumber(refundedCount)} <span className='text-textInactiveColor text-xs'>of {formatNumber(ordersN)}</span>
            </Text>
            {showRates && (
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                {refundRate.value.toFixed(1)}%
              </Text>
            )}
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Cancelled
            </Text>
            <Text className='font-bold'>
              {formatNumber(cancelledCount)} <span className='text-textInactiveColor text-xs'>of {formatNumber(ordersN)}</span>
            </Text>
            {showRates && cancellationPct != null && (
              <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                {cancellationPct.toFixed(1)}%
              </Text>
            )}
          </div>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart title='Revenue' data={coarsenTimeSeries(metrics?.revenueByDay)} />
          <TimeSeriesChart title='Gross revenue' data={coarsenTimeSeries(metrics?.grossRevenueByDay)} />
        </div>
      </div>

      <details className='border border-textInactiveColor' open>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
          Purchase Funnel
        </summary>
        <div className='space-y-3 p-4'>
          <Text className='text-xs text-textInactiveColor leading-relaxed'>
            Where browsers drop off on the way to purchase (browse → cart → buy).
          </Text>
          <FunnelChart funnel={metricsResponse.funnel} />
        </div>
      </details>

      <details className='border border-textInactiveColor'>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
          Shipping & Delivery
        </summary>
        <div className='space-y-6 p-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <TimeSeriesChart
              title='Units sold'
              data={coarsenTimeSeries(metrics?.unitsSoldByDay)}
              valueFormat='number'
            />
            <TimeSeriesChart
              title='Shipped'
              data={coarsenTimeSeries(metrics?.shippedByDay)}
              valueFormat='number'
            />
            <TimeSeriesChart
              title='Delivered'
              data={coarsenTimeSeries(metrics?.deliveredByDay)}
              valueFormat='number'
            />
            <TimeSeriesChart title='Refunds' data={coarsenTimeSeries(metrics?.refundsByDay)} />
          </div>
        </div>
      </details>

      <PromoTable metrics={metrics} />
    </div>
  );
}
