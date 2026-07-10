import type { GetMetricsResponse } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import {
  CurrencyPaymentCharts,
  FunnelChart,
  OrdersByStatusChart,
  PromoTable,
  TimeSeriesChart,
} from '../components';
import { hasEnoughOrdersForAlert, orderCancellationSharePercent } from '../executiveAlerts';
import { formatCurrency, formatNumber, getMetricComparison } from '../utils';

interface RevenueTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled?: boolean;
}

export function RevenueTab({ metricsResponse, compareEnabled = false }: RevenueTabProps) {
  const metrics = metricsResponse.business;

  const revenue = getMetricComparison(metrics?.revenue as any);
  const grossRevenue = getMetricComparison(metrics?.grossRevenue as any);
  const orders = getMetricComparison(metrics?.ordersCount as any);
  const aov = getMetricComparison(metrics?.avgOrderValue as any);
  const refundRate = getMetricComparison(metrics?.refundRate as any);
  const cancellationPct = orderCancellationSharePercent(metrics);
  const cancellationCritical =
    !!cancellationPct && cancellationPct > 20 && hasEnoughOrdersForAlert(metrics);

  // Margin — computed only over the costed subset of revenue (products with a cost set).
  const revenueCost = getMetricComparison(metrics?.revenueCost as any);
  const grossMargin = getMetricComparison(metrics?.grossMargin as any);
  const grossMarginPct = getMetricComparison(metrics?.grossMarginPct as any);
  const contributionMargin = getMetricComparison(metrics?.contributionMargin as any);
  const costCoverage = metrics?.costCoveragePct ?? 0;

  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Revenue & Orders Overview</h3>

        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 border border-textInactiveColor p-4 bg-bgSecondary/20'>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Revenue
            </Text>
            <Text className='font-bold'>{formatCurrency(revenue.value)}</Text>
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
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              AOV
            </Text>
            <Text className='font-bold'>{formatCurrency(aov.value)}</Text>
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Refund Rate
            </Text>
            <Text className='font-bold'>{refundRate.value.toFixed(1)}%</Text>
          </div>
          <div className='space-y-1'>
            <Text
              variant='uppercase'
              className={
                cancellationCritical
                  ? 'text-error text-[10px]'
                  : 'text-textInactiveColor text-[10px]'
              }
            >
              Cancellation Rate
            </Text>
            <Text className={cancellationCritical ? 'font-bold text-error' : 'font-bold'}>
              {cancellationPct?.toFixed(1) ?? 0}%
            </Text>
          </div>
        </div>

        {/* P&L-lite: profit, not just top line. Margin is over the costed revenue subset. */}
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
            <div className='grid grid-cols-2 md:grid-cols-4 gap-3 border border-textInactiveColor p-4 bg-bgSecondary/20'>
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                  COGS
                </Text>
                <Text className='font-bold'>{formatCurrency(revenueCost.value)}</Text>
              </div>
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                  Gross Profit
                </Text>
                <Text className='font-bold'>{formatCurrency(grossMargin.value)}</Text>
              </div>
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                  Gross Margin
                </Text>
                <Text className='font-bold'>{grossMarginPct.value.toFixed(0)}%</Text>
              </div>
              <div className='space-y-1'>
                <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
                  Contribution
                </Text>
                <Text className='font-bold'>{formatCurrency(contributionMargin.value)}</Text>
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

        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='Revenue by day'
            data={metrics?.revenueByDay}
            compareData={metrics?.revenueByDayCompare}
          />
          <TimeSeriesChart
            title='Avg order value by day'
            data={metrics?.avgOrderValueByDay}
            compareData={metrics?.avgOrderValueByDayCompare}
          />
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          <OrdersByStatusChart metrics={metrics} />
          <TimeSeriesChart
            title='Gross revenue by day'
            data={metrics?.grossRevenueByDay}
            compareData={metrics?.grossRevenueByDayCompare}
          />
        </div>
      </div>

      <details className='border border-textInactiveColor' open>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
          Purchase Funnel
        </summary>
        <div className='space-y-3 p-4'>
          <Text className='text-xs text-textInactiveColor leading-relaxed'>
            Conversion rate shown in persistent bar above. Step-by-step drop-off here.
          </Text>
          <FunnelChart funnel={metricsResponse.funnel} compareEnabled={compareEnabled} />
        </div>
      </details>

      <details className='border border-textInactiveColor'>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
          Shipping & Delivery
        </summary>
        <div className='space-y-6 p-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <TimeSeriesChart
              title='Units sold by day'
              data={metrics?.unitsSoldByDay}
              compareData={metrics?.unitsSoldByDayCompare}
              valueFormat='number'
            />
            <TimeSeriesChart
              title='Shipped by day'
              data={metrics?.shippedByDay}
              compareData={metrics?.shippedByDayCompare}
              valueFormat='number'
            />
            <TimeSeriesChart
              title='Delivered by day'
              data={metrics?.deliveredByDay}
              compareData={metrics?.deliveredByDayCompare}
              valueFormat='number'
            />
            <div className='border border-textInactiveColor/50'>
              <TimeSeriesChart
                title='Refunds by day'
                data={metrics?.refundsByDay}
                compareData={metrics?.refundsByDayCompare}
              />
            </div>
          </div>
        </div>
      </details>

      <details className='border border-textInactiveColor'>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
          Payment Methods
        </summary>
        <div className='space-y-3 p-4'>
          <Text className='text-xs text-textInactiveColor leading-relaxed'>
            Single currency/method business — expand when multi-currency launches
          </Text>
          <CurrencyPaymentCharts metrics={metrics} />
        </div>
      </details>

      <PromoTable metrics={metrics} />
    </div>
  );
}
