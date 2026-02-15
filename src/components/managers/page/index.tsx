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
} from './components';
import {
  getDefaultCompareRange,
  getDefaultDateRange,
  getGranularityForDays,
  getPresetRange,
  PRESETS,
  useMetricsQuery,
} from './useMetricsQuery';
import type { MetricsGranularity } from 'api/proto-http/admin';

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function getActivePresetDays(
  periodFrom: Date,
  periodTo: Date,
  compareFrom: Date,
  compareTo: Date,
): number | null {
  const periodDays = Math.round((periodTo.getTime() - periodFrom.getTime()) / (24 * 60 * 60 * 1000));
  const preset = PRESETS.find((p) => p.days === periodDays);
  if (!preset) return null;
  const expected = getPresetRange(preset.days);
  if (
    isSameDay(periodFrom, expected.from) &&
    isSameDay(periodTo, expected.to) &&
    isSameDay(compareFrom, expected.compareFrom) &&
    isSameDay(compareTo, expected.compareTo)
  ) {
    return preset.days;
  }
  return null;
}

export function Analitic() {
  const defaultRange = getDefaultDateRange(7);
  const defaultCompare = getDefaultCompareRange(defaultRange.from, defaultRange.to);
  const [periodFrom, setPeriodFrom] = useState(defaultRange.from);
  const [periodTo, setPeriodTo] = useState(defaultRange.to);
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [comparePeriodFrom, setComparePeriodFrom] = useState(defaultCompare.from);
  const [comparePeriodTo, setComparePeriodTo] = useState(defaultCompare.to);
  const [granularity, setGranularity] = useState<MetricsGranularity>(
    getGranularityForDays(7),
  );

  const handlePresetSelect = (days: number) => {
    const { from, to, compareFrom, compareTo } = getPresetRange(days);
    setPeriodFrom(from);
    setPeriodTo(to);
    setComparePeriodFrom(compareFrom);
    setComparePeriodTo(compareTo);
    setCompareEnabled(true);
    setGranularity(getGranularityForDays(days));
  };

  const { data: metrics, isLoading, isError, refetch } = useMetricsQuery(periodFrom, periodTo, {
    comparePeriodFrom: compareEnabled ? comparePeriodFrom : undefined,
    comparePeriodTo: compareEnabled ? comparePeriodTo : undefined,
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
          onPeriodFromChange={setPeriodFrom}
          onPeriodToChange={setPeriodTo}
          onComparePeriodFromChange={setComparePeriodFrom}
          onComparePeriodToChange={setComparePeriodTo}
          compareEnabled={compareEnabled}
          onCompareEnabledChange={setCompareEnabled}
          granularity={granularity}
          onGranularityChange={(v) => setGranularity(v as MetricsGranularity)}
          onPresetSelect={handlePresetSelect}
          activePresetDays={
            compareEnabled
              ? getActivePresetDays(periodFrom, periodTo, comparePeriodFrom, comparePeriodTo)
              : null
          }
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
          <KpiCards metrics={metrics} compareEnabled={compareEnabled} />

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
