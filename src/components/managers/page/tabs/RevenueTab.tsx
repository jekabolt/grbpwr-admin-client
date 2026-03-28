import type { GetMetricsResponse } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import {
  AbandonedCartCard,
  CheckoutTimingsCard,
  CurrencyPaymentCharts,
  DeviceFunnelChart,
  FunnelChart,
  HeroFunnelChart,
  OrdersByStatusChart,
  PaymentRecoveryCard,
  PromoTable,
  ReturnByProductChart,
  TimeSeriesChart,
  UserJourneysTable,
} from '../components';
import { orderCancellationSharePercent } from '../executiveAlerts';
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
            <Text variant='uppercase' className={cancellationPct && cancellationPct > 20 ? 'text-error text-[10px]' : 'text-textInactiveColor text-[10px]'}>
              Cancellation Rate
            </Text>
            <Text className={cancellationPct && cancellationPct > 20 ? 'font-bold text-error' : 'font-bold'}>
              {cancellationPct?.toFixed(1) ?? 0}%
            </Text>
          </div>
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
        
        <OrdersByStatusChart metrics={metrics} />
        <CurrencyPaymentCharts metrics={metrics} />
      </div>

      <details className='border border-textInactiveColor' open>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
          Conversion Funnel
        </summary>
        <div className='space-y-6 p-4'>
          <div>
            <Text className='text-xs text-textInactiveColor leading-relaxed mb-3'>
              Step-by-step conversion path showing where visitors drop off
            </Text>
            <FunnelChart funnel={metricsResponse.funnel} compareEnabled={compareEnabled} />
          </div>
          <CheckoutTimingsCard checkoutTimings={metricsResponse.checkoutTimings} />
        </div>
      </details>

      <details className='border border-textInactiveColor'>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
          Abandonment &amp; Recovery
        </summary>
        <div className='space-y-6 p-4'>
          <div className='grid gap-6 md:grid-cols-2'>
            <AbandonedCartCard abandonedCart={metricsResponse.abandonedCart} />
            <PaymentRecoveryCard paymentRecovery={metricsResponse.paymentRecovery} />
          </div>
          <ReturnByProductChart returnByProduct={metricsResponse.returnByProduct} />
        </div>
      </details>

      <details className='border border-textInactiveColor'>
        <summary className='cursor-pointer select-none bg-bgSecondary/30 px-4 py-3 text-sm font-bold uppercase hover:bg-bgSecondary/50'>
          Device &amp; Entry Funnels
        </summary>
        <div className='space-y-6 p-4'>
          <div className='grid gap-6 md:grid-cols-2'>
            <HeroFunnelChart heroFunnel={metricsResponse.heroFunnel} compareEnabled={compareEnabled} />
            <DeviceFunnelChart deviceFunnel={metricsResponse.deviceFunnel} />
          </div>
        </div>
      </details>

      <div className='space-y-3'>
        <h3 className='text-sm font-bold uppercase'>How customers browse</h3>
        <Text className='text-xs text-textInactiveColor leading-relaxed'>
          Most common navigation paths through your site and their conversion rates
        </Text>
        <UserJourneysTable userJourneys={metricsResponse.userJourneys} />
      </div>

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

      <PromoTable metrics={metrics} />
    </div>
  );
}
