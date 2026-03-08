import type { GetMetricsResponse } from 'api/proto-http/admin';
import {
  CampaignAttributionTable,
  GeographyCharts,
  TimeSeriesChart,
  TrafficCharts,
} from '../components';

interface TrafficTabProps {
  metricsResponse: GetMetricsResponse;
}

export function TrafficTab({ metricsResponse }: TrafficTabProps) {
  const metrics = metricsResponse.business;

  return (
    <div className='space-y-6'>
      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>GA4 traffic & engagement</h3>
        <div className='grid gap-4 md:grid-cols-2'>
          <TimeSeriesChart
            title='Sessions by day'
            data={metrics?.sessionsByDay}
            compareData={metrics?.sessionsByDayCompare}
            valueFormat='number'
          />
          <TimeSeriesChart
            title='Users by day'
            data={metrics?.usersByDay}
            compareData={metrics?.usersByDayCompare}
            valueFormat='number'
          />
          <TimeSeriesChart
            title='Page views by day'
            data={metrics?.pageViewsByDay}
            compareData={metrics?.pageViewsByDayCompare}
            valueFormat='number'
          />
          <TimeSeriesChart
            title='Conversion rate by day'
            data={metrics?.conversionRateByDay}
            compareData={metrics?.conversionRateByDayCompare}
            valueFormat='number'
          />
        </div>
      </div>

      <TrafficCharts metrics={metrics} />
      <GeographyCharts metrics={metrics} />
      <CampaignAttributionTable campaignAttribution={metricsResponse.campaignAttribution} />
    </div>
  );
}
