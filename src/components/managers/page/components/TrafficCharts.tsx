import type {
  BusinessMetrics,
  DeviceMetric,
  GeographySessionMetric,
  ProductViewMetric,
  TrafficSourceMetric,
} from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { SessionsByCountryMapChart } from './SessionsByCountryMapChart';

interface BarChartWrapperProps {
  title: string;
  data: Array<{ name: string; value: number; productId?: number }>;
  valueFormat?: 'number' | 'percent';
  maxItems?: number;
  onBarClick?: (data: { productId?: number }) => void;
}

const TrafficBarChart: FC<BarChartWrapperProps> = ({
  title,
  data,
  valueFormat = 'number',
  maxItems = 10,
  onBarClick,
}) => {
  const sliced = data.slice(0, maxItems);
  if (sliced.length === 0) return null;

  const formatValue = valueFormat === 'percent' ? (v: number) => `${v.toFixed(1)}%` : formatNumber;

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const label = items[0]?.name ?? '';
    const rows = items
      .map((it) => `${it.marker ?? ''}<b>${formatValue(Number(it.value ?? 0))}</b>`)
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
    // Horizontal bar: swap axes. The `as` casts are required only in this file —
    // importing SessionsByCountryMapChart pulls in the large world-countries geo
    // JSON, inflating the type graph past tsc's structural-comparison budget so it
    // can no longer prove XAXisOption/YAXisOption are interchangeable (other bar
    // charts using these helpers swapped need no cast).
    xAxis: valueAxis({
      axisLabel: { formatter: (v: number) => formatValue(v) },
    }) as EChartsOption['xAxis'],
    yAxis: categoryAxis({
      type: 'category',
      data: sliced.map((d) => d.name),
      inverse: true,
    }) as EChartsOption['yAxis'],
    series: [
      {
        type: 'bar',
        data: sliced.map((d) => ({ value: d.value, productId: d.productId })),
        itemStyle: { color: chartColors.ink, borderRadius: [0, 2, 2, 0] },
      },
    ],
  };

  const onEvents = onBarClick
    ? {
        click: (params: { data?: unknown }) => {
          const d = (params.data as { productId?: number }) ?? {};
          onBarClick(d);
        },
      }
    : undefined;

  return (
    <ChartCard title={title}>
      <EChart option={option} height={220} onEvents={onEvents} />
    </ChartCard>
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
    productId: p.productId,
  }));
}

interface TrafficChartsProps {
  metrics: BusinessMetrics | undefined;
}

export const TrafficCharts: FC<TrafficChartsProps> = ({ metrics }) => {
  const navigate = useNavigate();
  if (!metrics) return null;

  const handleProductBarClick = (data: { productId?: number }) => {
    const id = data?.productId;
    if (id != null && !isNaN(id)) {
      navigate(`${BASE_PATH}/products/${id}`);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='space-y-1'>
        <Text variant='uppercase' className='font-bold'>
          Where your visits come from
        </Text>
        <Text className='text-textInactiveColor text-xs leading-relaxed'>
          Sessions by geography, marketing channel, and device for this period.
        </Text>
      </div>
      <div className='space-y-3'>
        <Text
          variant='uppercase'
          className='text-[10px] font-semibold text-textInactiveColor tracking-wide'
        >
          Geography
        </Text>
        <div className='flex flex-col gap-4 md:flex-row md:items-stretch'>
          <SessionsByCountryMapChart
            sessionsByCountry={metrics.sessionsByCountry}
            showTitle={false}
          />
          <div className='flex-1 min-w-0'>
            <TrafficBarChart
              title='Sessions by country'
              data={sessionsByCountryToData(metrics.sessionsByCountry)}
            />
          </div>
        </div>
      </div>
      <div className='grid gap-6 md:grid-cols-2'>
        <div className='space-y-3 min-w-0'>
          <Text
            variant='uppercase'
            className='text-[10px] font-semibold text-textInactiveColor tracking-wide'
          >
            Marketing channels
          </Text>
          <TrafficBarChart
            title='Traffic by source'
            data={trafficBySourceToData(metrics.trafficBySource)}
          />
        </div>
        <div className='space-y-3 min-w-0'>
          <Text
            variant='uppercase'
            className='text-[10px] font-semibold text-textInactiveColor tracking-wide'
          >
            Devices
          </Text>
          <TrafficBarChart
            title='Traffic by device'
            data={trafficByDeviceToData(metrics.trafficByDevice)}
          />
        </div>
      </div>
      <div className='space-y-3'>
        <Text
          variant='uppercase'
          className='text-[10px] font-semibold text-textInactiveColor tracking-wide'
        >
          Product interest
        </Text>
        <TrafficBarChart
          title='Top products by views'
          data={topProductsByViewsToData(metrics.topProductsByViews)}
          onBarClick={handleProductBarClick}
        />
      </div>
      <Text className='text-textInactiveColor text-xs leading-relaxed'>
        Top products by views are ranked across all traffic sources and sessions — not filtered to a
        single channel (e.g. Instagram vs organic). Per-source product breakdown requires additional
        reporting.
      </Text>
    </div>
  );
};
