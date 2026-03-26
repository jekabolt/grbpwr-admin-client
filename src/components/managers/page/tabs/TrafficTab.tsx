import type { GetMetricsResponse } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import {
  CampaignAttributionTable,
  GeographyCharts,
  KpiCards,
  TimeSeriesChart,
  TrafficCharts,
} from '../components';

interface TrafficTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled: boolean;
}

export function TrafficTab({ metricsResponse, compareEnabled }: TrafficTabProps) {
  const metrics = metricsResponse.business;

  return (
    <div className='space-y-6'>
      <CampaignAttributionTable campaignAttribution={metricsResponse.campaignAttribution} />

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Conversion Rate Trend</h3>
        <div className='max-w-xl'>
          <TimeSeriesChart
            title='Conversion rate by day'
            data={metrics?.conversionRateByDay}
            compareData={metrics?.conversionRateByDayCompare}
            valueFormat='number'
          />
        </div>
      </div>

      <div className='space-y-6'>
        <h3 className='text-sm font-bold uppercase'>Traffic &amp; engagement over time</h3>
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
        </div>
      </div>

      <TrafficCharts metrics={metrics} />
      <GeographyCharts metrics={metrics} />

      <div className='space-y-3'>
        <h3 className='text-sm font-bold uppercase'>Email Performance</h3>
        <KpiCards
          metrics={metrics}
          compareEnabled={compareEnabled}
          visibleGroupIds={['email']}
        />
      </div>
    </div>
  );
}
