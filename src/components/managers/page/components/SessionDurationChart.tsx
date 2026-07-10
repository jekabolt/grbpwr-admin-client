import type { SessionDurationMetric } from 'api/proto-http/admin';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { FC } from 'react';
import {
  ChartCard,
  EChart,
  categoryAxis,
  chartColors,
  compareLineStyle,
  gridBase,
  legendBase,
  tooltipBase,
  valueAxis,
} from '../charts';

interface SessionDurationChartProps {
  sessionDuration: SessionDurationMetric[] | undefined;
}

export const SessionDurationChart: FC<SessionDurationChartProps> = ({ sessionDuration }) => {
  if (!sessionDuration || sessionDuration.length === 0) return null;

  const dates = sessionDuration.map((m) =>
    m.date ? new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
  );
  const avgValues = sessionDuration.map((m) => m.avgTimeBetweenEventsSeconds || 0);
  const medianValues = sessionDuration.map((m) => m.medianTimeBetweenEvents || 0);

  const formatSeconds = (v: number) => `${v.toFixed(1)}s`;

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const label = items[0]?.name ?? '';
    const rows = items
      .map(
        (it) =>
          `${it.marker ?? ''}${it.seriesName}: <b>${formatSeconds(Number(it.value ?? 0))}</b>`,
      )
      .join('<br/>');
    return `<div style="font-size:11px;line-height:1.6">${label}<br/>${rows}</div>`;
  };

  const option: EChartsOption = {
    grid: { ...gridBase, bottom: 28 },
    tooltip: { ...tooltipBase, trigger: 'axis', formatter: tooltipFormatter },
    legend: { ...legendBase },
    xAxis: categoryAxis({ data: dates, boundaryGap: false }),
    yAxis: valueAxis({
      name: 'Seconds',
      nameTextStyle: { color: chartColors.inkSecondary, fontSize: 10 },
      axisLabel: { formatter: (v: number) => formatSeconds(v) },
    }),
    series: [
      {
        name: 'Average',
        type: 'line',
        data: avgValues,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: chartColors.ink, width: 2 },
        itemStyle: { color: chartColors.ink },
      },
      {
        name: 'Median',
        type: 'line',
        data: medianValues,
        smooth: true,
        symbol: 'none',
        lineStyle: compareLineStyle,
        itemStyle: { color: chartColors.compare },
      },
    ],
  };

  return (
    <ChartCard
      title='Session duration (time between events)'
      subtitle='Time between user interactions - higher = more engaged sessions'
    >
      <EChart option={option} height={300} />
    </ChartCard>
  );
};
