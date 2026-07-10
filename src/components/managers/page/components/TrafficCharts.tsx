import type { BusinessMetrics, TrafficSourceMetric } from 'api/proto-http/admin';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { FC } from 'react';
import Text from 'ui/components/text';
import {
  categoryAxis,
  ChartCard,
  chartColors,
  EChart,
  gridBase,
  tooltipBase,
  valueAxis,
} from '../charts';
import { formatNumber } from '../utils';

interface TrafficChartsProps {
  metrics: BusinessMetrics | undefined;
}

function trafficBySourceToData(items: TrafficSourceMetric[] | undefined) {
  if (!items?.length) return [];
  return items.map((t) => ({
    name: [t.source, t.medium].filter(Boolean).join(' / ') || 'Unknown',
    value: t.sessions ?? 0,
  }));
}

/**
 * Just the channel mix — where visits come from. The country map (external-CDN geo + rules-of-hooks
 * bug), device split, and top-products-by-views were vanity at boutique traffic; cut. GA4 sessions
 * are a directional estimate, labelled as such.
 */
export const TrafficCharts: FC<TrafficChartsProps> = ({ metrics }) => {
  if (!metrics) return null;
  const data = trafficBySourceToData(metrics.trafficBySource).slice(0, 10);
  if (data.length === 0) return null;

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const label = items[0]?.name ?? '';
    const rows = items
      .map((it) => `${it.marker ?? ''}<b>${formatNumber(Number(it.value ?? 0))}</b>`)
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
      axisLabel: { formatter: (v: number) => formatNumber(v) },
    }) as EChartsOption['xAxis'],
    yAxis: categoryAxis({
      type: 'category',
      data: data.map((d) => d.name),
      inverse: true,
    }) as EChartsOption['yAxis'],
    series: [
      {
        type: 'bar',
        data: data.map((d) => d.value),
        itemStyle: { color: chartColors.ink, borderRadius: [0, 2, 2, 0] },
      },
    ],
  };

  return (
    <div className='space-y-3'>
      <div className='space-y-1'>
        <Text variant='uppercase' className='font-bold'>
          Traffic by source
        </Text>
        <Text className='text-textInactiveColor text-xs'>
          Sessions by channel — GA4 estimate, directional only.
        </Text>
      </div>
      <div className='max-w-xl'>
        <ChartCard title='Traffic by source'>
          <EChart option={option} height={220} />
        </ChartCard>
      </div>
    </div>
  );
};
