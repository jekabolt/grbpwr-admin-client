import type { GetMetricsResponse } from 'api/proto-http/admin';
import { Link, useLocation } from 'react-router-dom';
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
  const { pathname } = useLocation();
  const overviewHref = `${pathname}?tab=overview`;

  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <KpiCards
          metrics={metrics}
          compareEnabled={compareEnabled}
          visibleGroupIds={['traffic', 'conversion', 'email']}
        />
        <Text className='text-textInactiveColor text-xs leading-relaxed'>
          Period conversion rate headline also appears on{' '}
          <Link to={overviewHref} replace className='underline underline-offset-2 hover:text-textColor'>
            Overview
          </Link>{' '}
          (Key metrics).
        </Text>
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
