import type { BusinessMetrics } from 'api/proto-http/admin';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { FC } from 'react';
import { ChartCard, EChart, chartColors, tooltipBase } from '../charts';

interface OrdersByStatusChartProps {
  metrics: BusinessMetrics | undefined;
}

// Grayscale status ramp, ink → light-gray (matches chartColors.ink/inkSecondary/muted family).
const COLORS = ['#000', '#333', '#666', '#999', '#bbb', '#ddd'];

export const OrdersByStatusChart: FC<OrdersByStatusChartProps> = ({ metrics }) => {
  const data =
    metrics?.ordersByStatus?.map((s) => ({
      name: (s.statusName ?? 'Unknown').replace(/ORDER_STATUS_ENUM_/g, '').replace(/_/g, ' '),
      value: s.count ?? 0,
    })) ?? [];

  if (data.length === 0) return null;

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const it = Array.isArray(raw) ? raw[0] : raw;
    const name = it?.name ?? '';
    const value = Number(it?.value ?? 0);
    return `<div style="font-size:11px;line-height:1.6">${name}: <b>${value} Orders</b></div>`;
  };

  const option: EChartsOption = {
    tooltip: { ...tooltipBase, trigger: 'item', formatter: tooltipFormatter },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: true,
        label: { formatter: '{b} {d}%', color: chartColors.inkSecondary, fontSize: 10 },
        data: data.map((d, i) => ({
          value: d.value,
          name: d.name,
          itemStyle: {
            color: COLORS[i % COLORS.length],
            borderColor: chartColors.surface,
            borderWidth: 2,
          },
        })),
      },
    ],
  };

  return (
    <ChartCard title='Orders by status'>
      <EChart option={option} height={220} />
    </ChartCard>
  );
};
