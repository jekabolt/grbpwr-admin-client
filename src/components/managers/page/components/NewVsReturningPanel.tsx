import type { NewVsReturningSplit } from 'api/proto-http/admin';
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
import { coarsenTimeSeries, formatCurrency, getMetricComparison, parseDecimal } from '../utils';

interface NewVsReturningPanelProps {
  split: NewVsReturningSplit | undefined;
}

// Below this combined order count the split swings on a handful of orders — same floor the
// Repeat-economics block uses for its low-sample warning.
const MIN_ORDERS = 30;
// The retention argument only earns a callout when returning baskets are meaningfully bigger.
const AOV_LIFT_PP = 20;

// The one non-semantic second series colour the design system permits (brand blue), paired here
// with direct in-segment / end-of-line labels so meaning never rides on colour alone.
const NEW_COLOR = '#2323ff';

const GridCell: FC<{ value: string; muted?: boolean }> = ({ value, muted }) => (
  <td className={`p-2 text-right ${muted ? 'text-textInactiveColor' : ''}`}>{value}</td>
);

export const NewVsReturningPanel: FC<NewVsReturningPanelProps> = ({ split }) => {
  if (!split) return null;

  const newOrders = getMetricComparison(split.newOrders as any);
  const newRevenue = getMetricComparison(split.newRevenue as any);
  const newAov = getMetricComparison(split.newAov as any);
  const retOrders = getMetricComparison(split.returningOrders as any);
  const retRevenue = getMetricComparison(split.returningRevenue as any);
  const retAov = getMetricComparison(split.returningAov as any);

  const totalOrders = newOrders.value + retOrders.value;
  if (totalOrders <= 0 && newRevenue.value <= 0 && retRevenue.value <= 0) return null;

  const newShare = Math.max(0, Math.min(100, split.newRevenueSharePct ?? 0));
  const retShare = 100 - newShare;
  const newWon = newShare >= 50;
  const headline = newWon
    ? `New customers brought ${newShare.toFixed(0)}% of revenue`
    : `Returning customers brought ${retShare.toFixed(0)}% of revenue`;

  const lowSample = totalOrders > 0 && totalOrders < MIN_ORDERS;

  // AOV punchline: returning baskets bigger than new by a clear margin is the retention case.
  const aovLift =
    newAov.value > 0 ? ((retAov.value - newAov.value) / newAov.value) * 100 : null;
  const showAovLift = aovLift != null && aovLift >= AOV_LIFT_PP;

  const newDays = coarsenTimeSeries(split.newRevenueByDay) ?? [];
  const retDays = coarsenTimeSeries(split.returningRevenueByDay) ?? [];
  const showChart = newDays.length >= 3 || retDays.length >= 3;

  const chartDates = (retDays.length >= newDays.length ? retDays : newDays).map((p) =>
    p.date ? new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
  );

  const chartOption: EChartsOption = {
    grid: { ...gridBase, right: 44 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      formatter: (raw: TooltipComponentFormatterCallbackParams) => {
        const items = Array.isArray(raw) ? raw : [raw];
        const label = items[0]?.name ?? '';
        const rows = items
          .map((it) => `${it.marker ?? ''}${it.seriesName}: <b>${formatCurrency(Number(it.value ?? 0))}</b>`)
          .join('<br/>');
        return `<div style="font-size:11px;line-height:1.6">${label}<br/>${rows}</div>`;
      },
    },
    xAxis: categoryAxis({ data: chartDates, boundaryGap: false }),
    yAxis: valueAxis({ axisLabel: { formatter: (v: number) => formatCurrency(v) } }),
    series: [
      {
        name: 'returning',
        type: 'line',
        data: retDays.map((p) => parseDecimal(p.value)),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: chartColors.ink, width: 2 },
        itemStyle: { color: chartColors.ink },
        endLabel: { show: true, formatter: 'returning', color: chartColors.ink, fontSize: 10 },
      },
      {
        name: 'new',
        type: 'line',
        data: newDays.map((p) => parseDecimal(p.value)),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: NEW_COLOR, width: 2 },
        itemStyle: { color: NEW_COLOR },
        endLabel: { show: true, formatter: 'new', color: NEW_COLOR, fontSize: 10 },
      },
    ],
  };

  return (
    <div className='space-y-3'>
      <Text className='font-bold'>{headline}</Text>

      {/* Split bar: new (blue) vs returning (ink), labels inside the segments. */}
      <div className='flex h-6 w-full overflow-hidden'>
        <div
          className='flex items-center overflow-hidden whitespace-nowrap px-2 text-textBaseSize'
          style={{ width: `${newShare}%`, backgroundColor: NEW_COLOR, color: '#fff' }}
        >
          {newShare >= 12 ? `new ${newShare.toFixed(0)}%` : ''}
        </div>
        <div
          className='flex items-center justify-end overflow-hidden whitespace-nowrap bg-textColor px-2 text-textBaseSize text-bgColor'
          style={{ width: `${retShare}%` }}
        >
          {retShare >= 12 ? `returning ${retShare.toFixed(0)}%` : ''}
        </div>
      </div>
      {(newShare < 12 || retShare < 12) && (
        <Text className='text-textInactiveColor text-textBaseSize'>
          new {newShare.toFixed(0)}% · returning {retShare.toFixed(0)}%
        </Text>
      )}

      {lowSample && (
        <div className='border border-warning bg-warning/10 p-2'>
          <Text className='text-warning text-textBaseSize'>
            Low sample (n={totalOrders}): directional only, not statistically reliable yet.
          </Text>
        </div>
      )}

      <div className='overflow-x-auto border border-textInactiveColor'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='p-2 text-left'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Segment
                </Text>
              </th>
              <th className='p-2 text-right'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Orders
                </Text>
              </th>
              <th className='p-2 text-right'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Revenue
                </Text>
              </th>
              <th className='p-2 text-right'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  AOV
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className='border-b border-textInactiveColor'>
              <td className='p-2'>New</td>
              <GridCell value={newOrders.value.toLocaleString()} />
              <GridCell value={formatCurrency(newRevenue.value)} />
              <GridCell value={formatCurrency(newAov.value)} />
            </tr>
            <tr>
              <td className='p-2'>Returning</td>
              <GridCell value={retOrders.value.toLocaleString()} />
              <GridCell value={formatCurrency(retRevenue.value)} />
              <GridCell value={formatCurrency(retAov.value)} />
            </tr>
          </tbody>
        </table>
      </div>

      {showAovLift && (
        <Text className='text-labelColor text-textBaseSize'>
          Returning customers spend {aovLift!.toFixed(0)}% more per order.
        </Text>
      )}

      {showChart && (
        <ChartCard title='Revenue: new vs returning'>
          <EChart option={chartOption} height={220} />
        </ChartCard>
      )}
    </div>
  );
};
