import type {
  BusinessMetrics,
  DeviceMetric,
  GeographySessionMetric,
  ProductViewMetric,
  TrafficSourceMetric,
} from 'api/proto-http/admin';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface BarChartWrapperProps {
  title: string;
  data: Array<{ name: string; value: number }>;
  valueFormat?: 'number' | 'percent';
  maxItems?: number;
}

const TrafficBarChart: FC<BarChartWrapperProps> = ({
  title,
  data,
  valueFormat = 'number',
  maxItems = 10,
}) => {
  const sliced = data.slice(0, maxItems);
  if (sliced.length === 0) return null;

  const formatValue = valueFormat === 'percent' ? (v: number) => `${v.toFixed(1)}%` : formatNumber;

  return (
    <div className='border border-textInactiveColor p-4 min-h-[280px]'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        {title}
      </Text>
      <ResponsiveContainer width='100%' height={220}>
        <BarChart data={sliced} layout='vertical' margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
          <XAxis type='number' tick={{ fontSize: 10 }} tickFormatter={(v) => formatValue(Number(v))} />
          <YAxis type='category' dataKey='name' width={80} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value: number | undefined) => [value != null ? formatValue(value) : '', '']} />
          <Bar dataKey='value' fill='#000' radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

function sessionsByCountryToData(items: GeographySessionMetric[] | undefined) {
  if (!items?.length) return [];
  return items.map((g) => ({
    name: [g.country, g.state, g.city].filter(Boolean).join(', ') || 'Unknown',
    value: g.sessions ?? 0,
  }));
}

function trafficBySourceToData(items: TrafficSourceMetric[] | undefined) {
  if (!items?.length) return [];
  return items.map((t) => ({
    name: [t.source, t.medium].filter(Boolean).join(' / ') || 'Unknown',
    value: t.sessions ?? 0,
  }));
}

function trafficByDeviceToData(items: DeviceMetric[] | undefined) {
  if (!items?.length) return [];
  return items.map((d) => ({
    name: d.deviceCategory ?? 'Unknown',
    value: d.sessions ?? 0,
  }));
}

function topProductsByViewsToData(items: ProductViewMetric[] | undefined) {
  if (!items?.length) return [];
  return items.map((p) => ({
    name: (p.productName || `#${p.productId}`).slice(0, 20),
    value: p.pageViews ?? 0,
  }));
}

interface TrafficChartsProps {
  metrics: BusinessMetrics | undefined;
}

export const TrafficCharts: FC<TrafficChartsProps> = ({ metrics }) => {
  if (!metrics) return null;

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        GA4 Traffic breakdown
      </Text>
      <div className='grid gap-4 md:grid-cols-2'>
        <TrafficBarChart
          title='Sessions by country'
          data={sessionsByCountryToData(metrics.sessionsByCountry)}
        />
        <TrafficBarChart
          title='Traffic by source'
          data={trafficBySourceToData(metrics.trafficBySource)}
        />
        <TrafficBarChart
          title='Traffic by device'
          data={trafficByDeviceToData(metrics.trafficByDevice)}
        />
        <TrafficBarChart
          title='Top products by views'
          data={topProductsByViewsToData(metrics.topProductsByViews)}
        />
      </div>
    </div>
  );
};
