import type { CompareMode, GetMetricsResponse } from 'api/proto-http/admin';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';
import { ExecutiveHealthStrip, KpiCards, TimeSeriesChart } from '../components';
import type { MetricsPeriod } from '../useMetricsQuery';
import { getTimeSeries, resolveAnalyticsPeriodLabels } from '../utils';

interface OverviewTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled: boolean;
  period: MetricsPeriod;
  compareMode: CompareMode;
  customFrom: Date;
  customTo: Date;
}

export function OverviewTab({
  metricsResponse,
  compareEnabled,
  period,
  compareMode,
  customFrom,
  customTo,
}: OverviewTabProps) {
  const metrics = metricsResponse.business;
  const metricsRecord = metrics as Record<string, unknown> | undefined;
  const { pathname } = useLocation();
  const trafficHref = `${pathname}?tab=traffic`;
  const revenueHref = `${pathname}?tab=revenue`;
  const merchandisingHref = `${pathname}?tab=merchandising`;
  const customersHref = `${pathname}?tab=customers`;
  const productsAtcHref = `${pathname}?tab=products#atc-matrix`;

  const { current: currentPeriodLabel, compare: comparePeriodLabel } = useMemo(
    () =>
      resolveAnalyticsPeriodLabels(
        metrics?.period,
        metrics?.comparePeriod,
        compareEnabled,
        compareMode,
        period,
        customFrom,
        customTo,
      ),
    [
      metrics?.period,
      metrics?.comparePeriod,
      compareEnabled,
      compareMode,
      period,
      customFrom,
      customTo,
    ],
  );

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <ExecutiveHealthStrip
          metrics={metrics}
          compareEnabled={compareEnabled}
          revenueHref={revenueHref}
          currentPeriodLabel={currentPeriodLabel}
          comparePeriodLabel={comparePeriodLabel}
        />
        <KpiCards
          metrics={metrics}
          compareEnabled={compareEnabled}
          layout='overview'
          visibleGroupIds={['revenue', 'orders', 'traffic', 'conversion', 'customers']}
          collapseOverviewRevenueDetails
        />
        <Text className='text-textInactiveColor text-xs leading-relaxed'>
          <span className='text-textColor/90'>Same metrics elsewhere: </span>
          conversion rate trend —{' '}
          <Link to={trafficHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Traffic &amp; Marketing
          </Link>
          ; transactional email (sent, open, click) —{' '}
          <Link to={trafficHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Traffic &amp; Marketing
          </Link>
          ; revenue by day —{' '}
          <Link to={revenueHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Revenue &amp; Sales
          </Link>
          .
        </Text>
      </div>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Orders at a glance</h3>
        <div className='max-w-xl'>
          <TimeSeriesChart
            title='Orders by day'
            data={getTimeSeries(metricsRecord, 'ordersByDay')}
            compareData={getTimeSeries(metricsRecord, 'ordersByDayCompare')}
            valueFormat='number'
          />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Acquisition &amp; retention</h3>
        <Text className='text-textInactiveColor text-xs leading-relaxed max-w-3xl'>
          <span className='text-textColor/90'>New Users</span> in Key metrics is from GA4 (first-time visitors to
          the site). <span className='text-textColor/90'>New customers by day</span> below counts first-time
          buyers (orders). <span className='text-textColor/90'>Repeat rate</span> is in Key metrics under Customers.
        </Text>
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

      <div className='space-y-6 border border-textInactiveColor p-4'>
        <h3 className='text-sm font-bold uppercase'>What to feature this week</h3>
        <Text className='text-textInactiveColor text-xs leading-relaxed'>
          One place for top revenue products, add-to-cart performance, first purchases, and trends:{' '}
          <Link to={merchandisingHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Merchandising
          </Link>
          . Or jump straight to{' '}
          <Link to={productsAtcHref} replace className='underline underline-offset-2 hover:text-textColor'>
            add-to-cart performance
          </Link>
          ,{' '}
          <Link to={customersHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Customers
          </Link>{' '}
          (first purchase products), or{' '}
          <Link to={revenueHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Revenue &amp; Sales
          </Link>
          .
        </Text>
      </div>
    </div>
  );
}
