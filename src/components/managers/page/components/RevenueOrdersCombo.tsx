import type { TimeSeriesPoint } from 'api/proto-http/admin';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { FC } from 'react';
import {
  ChartCard,
  EChart,
  categoryAxis,
  chartColors,
  gridBase,
  tooltipBase,
  valueAxis,
} from '../charts';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

/**
 * Revenue (line) with orders (faint bars) on the same daily axis — shows the revenue-per-order
 * shape at a glance (a high line over low bars = big baskets). Dual y-axis: € left, orders right.
 */
export const RevenueOrdersCombo: FC<{
  revenue: TimeSeriesPoint[] | undefined;
  orders: TimeSeriesPoint[] | undefined;
}> = ({ revenue, orders }) => {
  const rev = revenue ?? [];
  if (rev.length === 0) return null;
  const dates = rev.map((p) =>
    p.date
      ? new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '',
  );
  const revVals = rev.map((p) => parseDecimal(p.value));
  const ordVals = rev.map((_, i) => {
    const o = orders?.[i];
    return o ? parseDecimal(o.value) || (o.count ?? 0) : 0;
  });

  const tooltip = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const label = items[0]?.name ?? '';
    const rows = items
      .map((it) => {
        const v = Number(it.value ?? 0);
        const txt = it.seriesName === 'Orders' ? `${formatNumber(v)} orders` : formatCurrency(v);
        return `${it.marker ?? ''}${it.seriesName}: <b>${txt}</b>`;
      })
      .join('<br/>');
    return `<div style="font-size:11px;line-height:1.6">${label}<br/>${rows}</div>`;
  };

  const option: EChartsOption = {
    grid: { ...gridBase, right: 40 },
    tooltip: { ...tooltipBase, trigger: 'axis', formatter: tooltip },
    xAxis: categoryAxis({ data: dates, boundaryGap: true }),
    yAxis: [
      valueAxis({ axisLabel: { formatter: (v: number) => formatCurrency(v) } }),
      valueAxis({
        axisLabel: { formatter: (v: number) => formatNumber(v) },
        position: 'right',
        splitLine: { show: false },
      }),
    ],
    series: [
      {
        name: 'Orders',
        type: 'bar',
        yAxisIndex: 1,
        data: ordVals,
        itemStyle: { color: chartColors.axisLine },
        barMaxWidth: 18,
      },
      {
        name: 'Revenue',
        type: 'line',
        yAxisIndex: 0,
        data: revVals,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: chartColors.ink, width: 2 },
        itemStyle: { color: chartColors.ink },
        z: 3,
      },
    ],
  };

  return (
    <ChartCard title='Revenue & orders / day'>
      <EChart option={option} height={240} />
    </ChartCard>
  );
};
