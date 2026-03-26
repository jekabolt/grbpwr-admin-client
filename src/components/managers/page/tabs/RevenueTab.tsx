import type { GetMetricsResponse } from 'api/proto-http/admin';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import {
  CurrencyPaymentCharts,
  OrdersByStatusChart,
  PromoTable,
  TimeSeriesChart,
} from '../components';

interface RevenueTabProps {
  metricsResponse: GetMetricsResponse;
}

export function RevenueTab({ metricsResponse }: RevenueTabProps) {
  const metrics = metricsResponse.business;
  const { pathname } = useLocation();
  const funnelHref = `${pathname}?tab=funnel`;

  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Revenue & sales trends</h3>
        <Text className='text-textInactiveColor text-xs'>
          Product return rates sit with abandoned carts on{' '}
          <Link to={funnelHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Conversion Funnel
          </Link>{' '}
          (Abandonment &amp; returns).
        </Text>
        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='Revenue by day'
            data={metrics?.revenueByDay}
            compareData={metrics?.revenueByDayCompare}
          />
          <TimeSeriesChart
            title='Gross revenue by day'
            data={metrics?.grossRevenueByDay}
            compareData={metrics?.grossRevenueByDayCompare}
          />
          <TimeSeriesChart
            title='Refunds by day'
            data={metrics?.refundsByDay}
            compareData={metrics?.refundsByDayCompare}
          />
          <TimeSeriesChart
            title='Avg order value by day'
            data={metrics?.avgOrderValueByDay}
            compareData={metrics?.avgOrderValueByDayCompare}
          />
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
        </div>
      </div>

      <div className='grid gap-6 md:grid-cols-2'>
        <OrdersByStatusChart metrics={metrics} />
        <div className='space-y-6'>
          <CurrencyPaymentCharts metrics={metrics} />
        </div>
      </div>

      <PromoTable metrics={metrics} />
    </div>
  );
}
