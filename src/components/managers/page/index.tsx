import { subDays } from 'date-fns';
import { useState } from 'react';
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
  TrafficCharts,
} from './components';
import { useMetricsQuery } from './useMetricsQuery';
import type { CompareMode } from 'api/proto-http/admin';
import type { MetricsPeriod } from './useMetricsQuery';

function getDefaultCustomRange() {
  const to = new Date();
  const from = subDays(to, 6); // 7 days inclusive
  return { from, to };
}

export function Analitic() {
  const defaultCustom = getDefaultCustomRange();
  const [period, setPeriod] = useState<MetricsPeriod>('7d');
  const [compareMode, setCompareMode] = useState<CompareMode>('COMPARE_MODE_PREVIOUS_PERIOD');
  const [customFrom, setCustomFrom] = useState(defaultCustom.from);
  const [customTo, setCustomTo] = useState(defaultCustom.to);

  const handlePeriodChange = (p: MetricsPeriod) => {
    setPeriod(p);
    if (p === 'custom') {
      const { from, to } = getDefaultCustomRange();
      setCustomFrom(from);
      setCustomTo(to);
    }
  };

  const handleCustomRangeChange = (from: Date, to: Date) => {
    setCustomFrom(from);
    setCustomTo(to);
  };

  const { data: metrics, isLoading, isError, refetch } = useMetricsQuery(period, {
    compareMode,
    customFrom: period === 'custom' ? customFrom : undefined,
    customTo: period === 'custom' ? customTo : undefined,
  });

  return (
    <div className='flex flex-col gap-8 pb-16'>
      <div className='flex flex-col gap-4'>
        <Text variant='uppercase' className='text-2xl font-bold'>
          Analytics
        </Text>
        <DateRangePicker
          period={period}
          compareMode={compareMode}
          customFrom={customFrom}
          customTo={customTo}
          onPeriodChange={handlePeriodChange}
          onCompareModeChange={setCompareMode}
          onCustomRangeChange={handleCustomRangeChange}
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
          <KpiCards
            metrics={metrics}
            compareEnabled={compareMode !== 'COMPARE_MODE_NONE'}
          />

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

          <div className='space-y-6'>
            <Text variant='uppercase' className='font-bold'>
              GA4 Traffic & Engagement
            </Text>
            <div className='grid gap-4 md:grid-cols-2'>
              <TimeSeriesChart
                title='Sessions by day'
                data={metrics.sessionsByDay}
                compareData={metrics.sessionsByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Users by day'
                data={metrics.usersByDay}
                compareData={metrics.usersByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Page views by day'
                data={metrics.pageViewsByDay}
                compareData={metrics.pageViewsByDayCompare}
                valueFormat='number'
              />
              <TimeSeriesChart
                title='Conversion rate by day'
                data={metrics.conversionRateByDay}
                compareData={metrics.conversionRateByDayCompare}
                valueFormat='number'
              />
            </div>
          </div>

          <TrafficCharts metrics={metrics} />
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
