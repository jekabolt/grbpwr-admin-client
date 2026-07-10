import type { BusinessMetrics, GeographyMetric, RegionMetric } from 'api/proto-http/admin';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { FC } from 'react';
import Text from 'ui/components/text';
import {
  ChartCard,
  EChart,
  categoryAxis,
  chartColors,
  gridBase,
  tooltipBase,
  valueAxis,
} from '../charts';
import { formatCurrency, parseDecimal } from '../utils';

interface BarChartWrapperProps {
  title: string;
  data: Array<{ name: string; value: number; count?: number }>;
  maxItems?: number;
}

const BarChartWrapper: FC<BarChartWrapperProps> = ({ title, data, maxItems = 10 }) => {
  const sliced = data.slice(0, maxItems);
  if (sliced.length === 0) return null;

  const names = sliced.map((d) => d.name);
  const values = sliced.map((d) => d.value);

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const label = items[0]?.name ?? '';
    const rows = items
      .map((it) => `${it.marker ?? ''}<b>${formatCurrency(Number(it.value ?? 0))}</b>`)
      .join('<br/>');
    return `<div style="font-size:11px;line-height:1.6">${label}<br/>${rows}</div>`;
  };

  const option: EChartsOption = {
    grid: gridBase,
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: tooltipFormatter,
    },
    xAxis: valueAxis({
      axisLabel: { formatter: (v: number) => formatCurrency(v) },
    }) as EChartsOption['xAxis'],
    yAxis: categoryAxis({ type: 'category', data: names, inverse: true }) as EChartsOption['yAxis'],
    series: [
      {
        type: 'bar',
        data: values,
        itemStyle: { color: chartColors.ink, borderRadius: [0, 2, 2, 0] },
      },
    ],
  };

  return (
    <ChartCard title={title}>
      <EChart option={option} height={220} />
    </ChartCard>
  );
};

function geoToChartData(
  items: GeographyMetric[] | undefined,
): Array<{ name: string; value: number; count?: number }> {
  if (!items?.length) return [];
  return items.map((g) => ({
    name: [g.country, g.state, g.city].filter(Boolean).join(', ') || 'Unknown',
    value: parseDecimal(g.value),
    count: g.count ?? 0,
  }));
}

function regionToChartData(
  items: RegionMetric[] | undefined,
): Array<{ name: string; value: number; count?: number }> {
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
        <BarChartWrapper
          title='Revenue by country'
          data={geoToChartData(metrics.revenueByCountry)}
        />
        <BarChartWrapper title='Revenue by city' data={geoToChartData(metrics.revenueByCity)} />
        <BarChartWrapper
          title='Revenue by region'
          data={regionToChartData(metrics.revenueByRegion)}
        />
        <BarChartWrapper
          title='Avg order by country'
          data={geoToChartData(metrics.avgOrderByCountry)}
        />
      </div>
    </div>
  );
};
