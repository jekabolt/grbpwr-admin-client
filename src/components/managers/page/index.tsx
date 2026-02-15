import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import {
  CurrencyPaymentCharts,
  DateRangePicker,
  GeographyCharts,
  KpiCards,
  OrdersByStatusChart,
  ProductCharts,
  PromoTable,
  CrossSellTable,
  TimeSeriesChart,
} from './components';
import {
  getDefaultCompareRange,
  getDefaultDateRange,
  getGranularityForDays,
  useMetricsQuery,
} from './useMetricsQuery';
import type { MetricsGranularity } from 'api/proto-http/admin';

export function Analitic() {
  const defaultRange = getDefaultDateRange(7);
  const defaultCompare = getDefaultCompareRange(defaultRange.from, defaultRange.to);
  const [periodFrom, setPeriodFrom] = useState(defaultRange.from);
  const [periodTo, setPeriodTo] = useState(defaultRange.to);
  const [comparePeriodFrom, setComparePeriodFrom] = useState(defaultCompare.from);
  const [comparePeriodTo, setComparePeriodTo] = useState(defaultCompare.to);
  const [granularity, setGranularity] = useState<MetricsGranularity>(
    getGranularityForDays(7),
  );

  useEffect(() => {
    const { from, to } = getDefaultCompareRange(periodFrom, periodTo);
    setComparePeriodFrom(from);
    setComparePeriodTo(to);
  }, [periodFrom, periodTo]);

  const handlePeriodFromChange = (d: Date) => {
    setPeriodFrom(d);
    if (d > periodTo) setPeriodTo(d);
  };

  const handlePeriodToChange = (d: Date) => {
    setPeriodTo(d);
    if (d < periodFrom) setPeriodFrom(d);
  };

  const { data: metrics, isLoading, isError, refetch } = useMetricsQuery(periodFrom, periodTo, {
    comparePeriodFrom,
    comparePeriodTo,
    granularity,
  });

  return (
    <div className='flex flex-col gap-8 pb-16'>
      <div className='flex flex-col gap-4'>
        <Text variant='uppercase' className='text-2xl font-bold'>
          Analytics
        </Text>
        <DateRangePicker
          periodFrom={periodFrom}
          periodTo={periodTo}
          comparePeriodFrom={comparePeriodFrom}
          comparePeriodTo={comparePeriodTo}
          onPeriodFromChange={handlePeriodFromChange}
          onPeriodToChange={handlePeriodToChange}
          granularity={granularity}
          onGranularityChange={(v) => setGranularity(v as MetricsGranularity)}
        />
      </div>

      {isLoading && (
        <div className='border border-textInactiveColor p-8 text-center'>
          <Text>Loading metrics...</Text>
        </div>
      )}

      {isError && (
        <div className='border border-error p-8 text-center'>
          <Text className='text-error mb-4'>Failed to load metrics</Text>
          <Button variant='main' onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && metrics && (
        <>
          <KpiCards metrics={metrics} compareEnabled={true} />

          <div className='space-y-6'>
            <Text variant='uppercase' className='font-bold'>
              Time series
            </Text>
            <div className='grid gap-4 md:grid-cols-2'>
              <TimeSeriesChart
                title='Revenue by day'
                data={metrics.revenueByDay}
                compareData={metrics.revenueByDayCompare}
              />
              <TimeSeriesChart
                title='Orders by day'
                data={metrics.ordersByDay}
                compareData={metrics.ordersByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Subscribers by day'
                data={metrics.subscribersByDay}
                compareData={metrics.subscribersByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Gross revenue by day'
                data={metrics.grossRevenueByDay}
                compareData={metrics.grossRevenueByDayCompare}
              />
              <TimeSeriesChart
                title='Refunds by day'
                data={metrics.refundsByDay}
                compareData={metrics.refundsByDayCompare}
              />
              <TimeSeriesChart
                title='Avg order value by day'
                data={metrics.avgOrderValueByDay}
                compareData={metrics.avgOrderValueByDayCompare}
              />
              <TimeSeriesChart
                title='Units sold by day'
                data={metrics.unitsSoldByDay}
                compareData={metrics.unitsSoldByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='New customers by day'
                data={metrics.newCustomersByDay}
                compareData={metrics.newCustomersByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Returning customers by day'
                data={metrics.returningCustomersByDay}
                compareData={metrics.returningCustomersByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Shipped by day'
                data={metrics.shippedByDay}
                compareData={metrics.shippedByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Delivered by day'
                data={metrics.deliveredByDay}
                compareData={metrics.deliveredByDayCompare}
                valueFormat='number'
              />
            </div>
          </div>

          <GeographyCharts metrics={metrics} />
          <CurrencyPaymentCharts metrics={metrics} />
          <ProductCharts metrics={metrics} />

          <div className='grid gap-6 md:grid-cols-2'>
            <OrdersByStatusChart metrics={metrics} />
            <div className='space-y-6'>
              <CrossSellTable metrics={metrics} />
              <PromoTable metrics={metrics} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
