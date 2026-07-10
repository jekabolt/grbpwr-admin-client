import type { GetMetricsResponse } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { CampaignAttributionTable, CrossSellTable, GeographyCharts, TrafficCharts } from '../components';
import { formatAvgDaysBetweenOrders, formatNumber, getMetricComparison } from '../utils';

interface GrowthTabProps {
  metricsResponse: GetMetricsResponse;
}

/**
 * Where growth comes from. Repeat economics (DB-true) up top, then GA4/channel signals — all of
 * which are directional at boutique traffic, so they live here rather than at the money altitude.
 * Absorbs the former standalone Customers tab (a 3-number card didn't warrant its own tab).
 */
export function GrowthTab({ metricsResponse }: GrowthTabProps) {
  const metrics = metricsResponse.business;
  const sampleSize = metrics?.clvDistribution?.sampleSize ?? 0;

  const repeatRate = getMetricComparison(metrics?.repeatCustomersRate as any);
  const ordersPerCustomer = getMetricComparison(metrics?.avgOrdersPerCustomer as any);
  const daysBetweenOrders = getMetricComparison(metrics?.avgDaysBetweenOrders as any);

  return (
    <div className='space-y-10'>
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
              Low sample (n={sampleSize}): directional only, not statistically reliable yet.
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
              {daysBetweenOrders.value > 0
                ? formatAvgDaysBetweenOrders(daysBetweenOrders.value)
                : '—'}
            </Text>
            <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
              avg gap to next order
            </Text>
          </div>
        </div>

        <CrossSellTable metrics={metrics} />
      </div>

      <div className='space-y-3'>
        <h3 className='text-sm font-bold uppercase'>Campaigns &amp; channels</h3>
        <CampaignAttributionTable campaignAttribution={metricsResponse.campaignAttribution} />
        <Text className='text-textInactiveColor text-[11px] leading-relaxed'>
          Channel data is GA4-sourced and directional at boutique traffic — sampling, consent gaps,
          bots and last-click attribution make daily lines and micro-conversion rates unreliable, so
          only channel mix, spend/ROAS and DB revenue-by-country are shown.
        </Text>
      </div>

      <div className='grid gap-8 md:grid-cols-2'>
        <TrafficCharts metrics={metrics} />
        <GeographyCharts metrics={metrics} />
      </div>
    </div>
  );
}
