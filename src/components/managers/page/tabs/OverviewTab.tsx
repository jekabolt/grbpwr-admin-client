import type { GetMetricsResponse } from 'api/proto-http/admin';
import { KpiCards, TimeSeriesChart } from '../components';
import { getTimeSeries } from '../utils';

interface OverviewTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled: boolean;
}

export function OverviewTab({ metricsResponse, compareEnabled }: OverviewTabProps) {
  const metrics = metricsResponse.business;
  const metricsRecord = metrics as Record<string, unknown> | undefined;

  return (
    <div className='space-y-6'>
      <KpiCards metrics={metrics} compareEnabled={compareEnabled} />
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Revenue & orders at a glance</h3>
        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='Revenue by day'
            data={metrics?.revenueByDay}
            compareData={metrics?.revenueByDayCompare}
          />
          <TimeSeriesChart
            title='Orders by day'
            data={getTimeSeries(metricsRecord, 'ordersByDay')}
            compareData={getTimeSeries(metricsRecord, 'ordersByDayCompare')}
            valueFormat='number'
          />
        </div>
      </div>
    </div>
  );
}
