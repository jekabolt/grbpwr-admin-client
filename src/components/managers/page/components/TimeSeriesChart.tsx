import type { TimeSeriesPoint } from 'api/proto-http/admin';
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
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface TimeSeriesChartProps {
  title: string;
  data: TimeSeriesPoint[] | undefined;
  compareData?: TimeSeriesPoint[] | undefined;
  valueFormat?: 'currency' | 'number';
  /** Values above this are flagged as likely-invalid (e.g. a daily % that exceeds 100). */
  maxSane?: number;
}

export const TimeSeriesChart: FC<TimeSeriesChartProps> = ({
  title,
  data,
  compareData,
  valueFormat = 'currency',
  maxSane,
}) => {
  const formatValue = valueFormat === 'currency' ? formatCurrency : formatNumber;

  // For number format (e.g. orders), backend may use 'count' instead of 'value'
  const getValue = (p: TimeSeriesPoint) =>
    valueFormat === 'number' ? parseDecimal(p.value) || (p.count ?? 0) : parseDecimal(p.value);

  const dates = (data ?? []).map((p) =>
    p.date
      ? new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '',
  );
  const values = (data ?? []).map(getValue);
  const compareValues = (compareData ?? []).map(getValue);
  const hasCompare = compareValues.length > 0;

  if (values.length === 0) return null;

  const hasInvalid = maxSane != null && values.some((v) => Number.isFinite(v) && v > maxSane);

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const label = items[0]?.name ?? '';
    const rows = items
      .map(
        (it) => `${it.marker ?? ''}${it.seriesName}: <b>${formatValue(Number(it.value ?? 0))}</b>`,
      )
      .join('<br/>');
    return `<div style="font-size:11px;line-height:1.6">${label}<br/>${rows}</div>`;
  };

  const option: EChartsOption = {
    grid: { ...gridBase, bottom: hasCompare ? 28 : 8 },
    tooltip: { ...tooltipBase, trigger: 'axis', formatter: tooltipFormatter },
    legend: hasCompare ? { ...legendBase } : undefined,
    xAxis: categoryAxis({ data: dates, boundaryGap: false }),
    yAxis: valueAxis({ axisLabel: { formatter: (v: number) => formatValue(v) } }),
    series: [
      {
        name: 'Period',
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: chartColors.ink, width: 2 },
        itemStyle: { color: chartColors.ink },
      },
      ...(hasCompare
        ? [
            {
              name: 'Compare',
              type: 'line' as const,
              data: compareValues,
              smooth: true,
              symbol: 'none',
              lineStyle: compareLineStyle,
              itemStyle: { color: chartColors.compare },
            },
          ]
        : []),
    ],
  };

  return (
    <ChartCard
      title={title}
      warning={
        hasInvalid
          ? `values above ${maxSane} look invalid — treat this chart as unreliable`
          : undefined
      }
    >
      <EChart option={option} height={220} />
    </ChartCard>
  );
};
