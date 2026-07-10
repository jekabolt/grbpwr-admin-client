import type { GetMetricsResponse } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { CrossSellTable, TimeSeriesChart } from '../components';
import { formatNumber, getMetricComparison } from '../utils';

interface CustomerTabProps {
  metricsResponse: GetMetricsResponse;
}

export function CustomerTab({ metricsResponse }: CustomerTabProps) {
  const metrics = metricsResponse.business;
  // Number of customers the repeat stats are computed over — used as the honesty label.
  const sampleSize = metrics?.clvDistribution?.sampleSize ?? 0;

  const repeatRate = getMetricComparison(metrics?.repeatCustomersRate as any);
  const ordersPerCustomer = getMetricComparison(metrics?.avgOrdersPerCustomer as any);
  const daysBetweenOrders = getMetricComparison(metrics?.avgDaysBetweenOrders as any);

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h3 className='text-sm font-bold uppercase'>Repeat economics</h3>
          <Text variant='inactive' size='small'>
            {sampleSize > 0 ? `over ${formatNumber(sampleSize)} customers` : 'no customer data yet'}
          </Text>
        </div>

        {sampleSize > 0 && sampleSize < 30 && (
          <div className='border border-warning bg-warning/10 p-2'>
            <Text className='text-warning text-xs'>
              Low sample (n={sampleSize}): directional only, not statistically reliable yet. Deeper
              cohort/CLV breakdowns are hidden until volume supports them.
            </Text>
          </div>
        )}

        <div className='grid grid-cols-1 md:grid-cols-3 gap-3 border border-textInactiveColor p-4 bg-bgSecondary/20'>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Repeat customer rate
            </Text>
            <Text className='font-bold text-lg'>{repeatRate.value.toFixed(0)}%</Text>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              share who ordered before
            </Text>
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Orders per customer
            </Text>
            <Text className='font-bold text-lg'>{ordersPerCustomer.value.toFixed(1)}</Text>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              lifetime average
            </Text>
          </div>
          <div className='space-y-1'>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              Days between orders
            </Text>
            <Text className='font-bold text-lg'>
              {daysBetweenOrders.value > 0 ? daysBetweenOrders.value.toFixed(0) : '—'}
            </Text>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              avg gap to next order
            </Text>
          </div>
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>New vs returning by day</h3>
        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='New customers by day'
            data={metrics?.newCustomersByDay}
            compareData={metrics?.newCustomersByDayCompare}
            valueFormat='number'
          />
          <TimeSeriesChart
            title='Returning customers by day'
            data={metrics?.returningCustomersByDay}
            compareData={metrics?.returningCustomersByDayCompare}
            valueFormat='number'
          />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Frequently bought together</h3>
        <CrossSellTable metrics={metrics} />
      </div>
    </div>
  );
}
