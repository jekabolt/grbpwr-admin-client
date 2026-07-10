import type { GetMetricsResponse } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { CampaignAttributionTable, GeographyCharts, TrafficCharts } from '../components';

interface TrafficTabProps {
  metricsResponse: GetMetricsResponse;
  compareEnabled?: boolean;
}

export function TrafficTab({ metricsResponse }: TrafficTabProps) {
  const metrics = metricsResponse.business;

  return (
    <div className='space-y-8'>
      <div className='space-y-3'>
        <h3 className='text-sm font-bold uppercase'>Campaigns &amp; channels</h3>
        <CampaignAttributionTable campaignAttribution={metricsResponse.campaignAttribution} />
        <Text className='text-textInactiveColor text-[11px] leading-relaxed'>
          Everything on this tab is GA4-sourced and directional at boutique traffic — sampling,
          consent gaps, bots and last-click attribution make daily lines and micro-conversion rates
          unreliable, so only channel mix, spend/ROAS and DB revenue-by-country are shown.
        </Text>
      </div>

      <div className='grid gap-8 md:grid-cols-2'>
        <TrafficCharts metrics={metrics} />
        <GeographyCharts metrics={metrics} />
      </div>
    </div>
  );
}
