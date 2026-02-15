import type { BusinessMetrics, GeographyMetric, RegionMetric } from 'api/proto-http/admin';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, parseDecimal } from '../utils';

interface BarChartWrapperProps {
  title: string;
  data: Array<{ name: string; value: number; count?: number }>;
  maxItems?: number;
}

const BarChartWrapper: FC<BarChartWrapperProps> = ({ title, data, maxItems = 10 }) => {
  const sliced = data.slice(0, maxItems);
  if (sliced.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4 min-h-[280px]'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        {title}
      </Text>
      <ResponsiveContainer width='100%' height={220}>
        <BarChart data={sliced} layout='vertical' margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
          <XAxis type='number' tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} />
          <YAxis type='category' dataKey='name' width={80} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
          <Bar dataKey='value' fill='#000' radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

function geoToChartData(items: GeographyMetric[] | undefined): Array<{ name: string; value: number; count?: number }> {
  if (!items?.length) return [];
  return items.map((g) => ({
    name: [g.country, g.state, g.city].filter(Boolean).join(', ') || 'Unknown',
    value: parseDecimal(g.value),
    count: g.count ?? 0,
  }));
}

function regionToChartData(items: RegionMetric[] | undefined): Array<{ name: string; value: number; count?: number }> {
  if (!items?.length) return [];
  return items.map((r) => ({
    name: r.region || 'Unknown',
    value: parseDecimal(r.value),
    count: r.count ?? 0,
  }));
}

interface GeographyChartsProps {
  metrics: BusinessMetrics | undefined;
}

export const GeographyCharts: FC<GeographyChartsProps> = ({ metrics }) => {
  if (!metrics) return null;

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Geography
      </Text>
      <div className='grid gap-4 md:grid-cols-2'>
        <BarChartWrapper title='Revenue by country' data={geoToChartData(metrics.revenueByCountry)} />
        <BarChartWrapper title='Revenue by city' data={geoToChartData(metrics.revenueByCity)} />
        <BarChartWrapper title='Revenue by region' data={regionToChartData(metrics.revenueByRegion)} />
        <BarChartWrapper title='Avg order by country' data={geoToChartData(metrics.avgOrderByCountry)} />
      </div>
    </div>
  );
};
