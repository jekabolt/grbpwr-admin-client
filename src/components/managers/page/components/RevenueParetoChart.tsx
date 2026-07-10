import type { RevenueParetoRow } from 'api/proto-http/admin';
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
import { ProductNameLink } from './ProductNameLink';

/**
 * `cumulative_pct` from the API is defined as a fraction in [0, 1]. If a value
 * is already in percent form (> 1), use it as-is so the chart does not blow up.
 */
function cumulativePctToDisplayPercent(raw: number | undefined): number {
  const v = raw ?? 0;
  if (!Number.isFinite(v)) return 0;
  const pct = v > 1 ? v : v * 100;
  return Math.max(0, Math.min(100, pct));
}

interface RevenueParetoChartProps {
  revenuePareto: RevenueParetoRow[] | undefined;
}

export const RevenueParetoChart: FC<RevenueParetoChartProps> = ({ revenuePareto }) => {
  if (!revenuePareto || revenuePareto.length === 0) return null;

  const data = revenuePareto.map((row) => ({
    rank: row.rank || 0,
    productId: row.productId,
    productName: row.productName || `#${row.productId}`,
    revenue: parseDecimal(row.revenue),
    cumulativePct: cumulativePctToDisplayPercent(row.cumulativePct),
  }));

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const idx = items[0]?.dataIndex ?? 0;
    const row = data[idx];
    if (!row) return '';
    return `<div style="font-size:11px;line-height:1.6">
      <div style="font-weight:700">#${row.rank} · ${row.productName}</div>
      <div>Cumulative: <b>${row.cumulativePct.toFixed(1)}%</b></div>
      <div>Revenue: ${formatCurrency(row.revenue)}</div>
    </div>`;
  };

  const option: EChartsOption = {
    grid: { ...gridBase, left: 12, right: 20, top: 16, bottom: 32 },
    tooltip: { ...tooltipBase, trigger: 'axis', formatter: tooltipFormatter },
    xAxis: categoryAxis({
      data: data.map((d) => String(d.rank)),
      boundaryGap: false,
      name: 'Product rank',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: chartColors.inkSecondary, fontSize: 10 },
    }),
    yAxis: valueAxis({
      max: 100,
      axisLabel: {
        formatter: (v: number) => `${v}%`,
        color: chartColors.inkSecondary,
        fontSize: 10,
      },
      name: 'Cumulative revenue %',
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { color: chartColors.inkSecondary, fontSize: 10 },
    }),
    series: [
      {
        type: 'line',
        data: data.map((d) => d.cumulativePct),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: chartColors.ink, width: 2 },
        areaStyle: { color: 'rgba(0,0,0,0.06)' },
      },
    ],
  };

  return (
    <ChartCard title='Top products driving revenue'>
      <EChart option={option} height={300} />
      <div className='mt-4 overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-1'>
                <Text variant='uppercase' className='text-[10px]'>
                  Rank
                </Text>
              </th>
              <th className='text-left p-1'>
                <Text variant='uppercase' className='text-[10px]'>
                  Product
                </Text>
              </th>
              <th className='text-right p-1'>
                <Text variant='uppercase' className='text-[10px]'>
                  Revenue
                </Text>
              </th>
              <th className='text-right p-1'>
                <Text variant='uppercase' className='text-[10px]'>
                  Cumulative %
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 15).map((row) => (
              <tr
                key={row.rank}
                className='border-b border-textInactiveColor/50 hover:bg-bgSecondary'
              >
                <td className='p-1'>{row.rank}</td>
                <td className='p-1'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='140px'
                  />
                </td>
                <td className='p-1 text-right'>{formatCurrency(row.revenue)}</td>
                <td className='p-1 text-right'>{row.cumulativePct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>
          Cumulative share of revenue by best-selling products — a small set often drives most
          sales.
        </Text>
      </div>
    </ChartCard>
  );
};
