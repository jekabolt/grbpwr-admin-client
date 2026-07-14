import type { BusinessMetrics, GeographyMetric, GeographySection } from 'api/proto-http/admin';
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

interface GeoDatum {
  name: string;
  value: number;
  count: number;
  sharePct?: number;
  aov?: number;
  changePct?: number;
}

interface BarChartWrapperProps {
  title: string;
  data: GeoDatum[];
  maxItems?: number;
}

const BarChartWrapper: FC<BarChartWrapperProps> = ({ title, data, maxItems = 10 }) => {
  const sliced = data.slice(0, maxItems);
  if (sliced.length === 0) return null;

  const names = sliced.map((d) => d.name);
  const values = sliced.map((d) => d.value);

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const idx = items[0]?.dataIndex;
    const d = typeof idx === 'number' ? sliced[idx] : undefined;
    const label = items[0]?.name ?? '';
    const extras: string[] = [];
    if (d?.sharePct != null && d.sharePct > 0) extras.push(`${d.sharePct.toFixed(0)}% of revenue`);
    if (d?.aov != null && d.aov > 0) extras.push(`AOV ${formatCurrency(d.aov)}`);
    if (d?.changePct != null && d.changePct !== 0) {
      const arrow = d.changePct > 0 ? '↑' : '↓';
      extras.push(`${arrow} ${Math.abs(d.changePct).toFixed(0)}% vs compare`);
    }
    const extraLine = extras.length ? `<br/><span style="color:#666">${extras.join(' · ')}</span>` : '';
    return `<div style="font-size:11px;line-height:1.6">${label}<br/><b>${formatCurrency(
      Number(items[0]?.value ?? 0),
    )}</b>${extraLine}</div>`;
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

function geoToChartData(items: GeographyMetric[] | undefined): GeoDatum[] {
  if (!items?.length) return [];
  return items.map((g) => ({
    name: [g.country, g.state, g.city].filter(Boolean).join(', ') || 'Unknown',
    value: parseDecimal(g.value),
    count: g.count ?? 0,
    sharePct: g.sharePct,
    aov: g.avgOrderValue ? parseDecimal(g.avgOrderValue) : undefined,
    changePct: g.changePct,
  }));
}

interface GeographyChartsProps {
  metrics: BusinessMetrics | undefined;
  geography?: GeographySection | undefined;
}

// Country-level revenue is the useful floor. City/region rows are 1–2 orders and per-country AOV
// flips on a single large order — cut. This is DB revenue, so it's trustworthy (unlike GA4 geo).
// Prefers the analytics-v2 geography.byCountry (carries share / AOV / change) when present.
export const GeographyCharts: FC<GeographyChartsProps> = ({ metrics, geography }) => {
  const source =
    geography?.byCountry && geography.byCountry.length > 0
      ? geography.byCountry
      : metrics?.commerce?.revenueByCountry;
  const data = geoToChartData(source);
  if (data.length === 0) return null;

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Revenue by country
      </Text>
      <div className='max-w-xl'>
        <BarChartWrapper title='Revenue by country' data={data} />
      </div>
    </div>
  );
};
