import type { BusinessMetrics } from 'api/proto-http/admin';
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

interface CurrencyPaymentChartsProps {
  metrics: BusinessMetrics | undefined;
}

const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
  const items = Array.isArray(raw) ? raw : [raw];
  const label = items[0]?.name ?? '';
  const rows = items
    .map((it) => `${it.marker ?? ''}<b>${formatCurrency(Number(it.value ?? 0))}</b>`)
    .join('<br/>');
  return `<div style="font-size:11px;line-height:1.6">${label}<br/>${rows}</div>`;
};

const barOption = (names: string[], values: number[]): EChartsOption => ({
  grid: gridBase,
  tooltip: { ...tooltipBase, trigger: 'axis', formatter: tooltipFormatter },
  xAxis: categoryAxis({ data: names }),
  yAxis: valueAxis({ axisLabel: { formatter: (v: number) => formatCurrency(v) } }),
  series: [
    {
      type: 'bar',
      data: values,
      itemStyle: { color: chartColors.ink, borderRadius: [2, 2, 0, 0] },
    },
  ],
});

export const CurrencyPaymentCharts: FC<CurrencyPaymentChartsProps> = ({ metrics }) => {
  if (!metrics) return null;

  const currencyData =
    metrics.revenueByCurrency?.map((c) => ({
      name: c.currency || 'Unknown',
      value: parseDecimal(c.value),
      count: c.count ?? 0,
    })) ?? [];

  const paymentData =
    metrics.revenueByPaymentMethod?.map((p) => ({
      name: (p.paymentMethod ?? 'Unknown')
        .replace(/PAYMENT_METHOD_NAME_ENUM_/g, '')
        .replace(/_/g, ' '),
      value: parseDecimal(p.value),
      count: p.count ?? 0,
    })) ?? [];

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Currency & payment
      </Text>
      <div className='grid gap-4 md:grid-cols-2'>
        {currencyData.length > 0 && (
          <ChartCard title='Revenue by currency'>
            <EChart
              option={barOption(
                currencyData.map((d) => d.name),
                currencyData.map((d) => d.value),
              )}
              height={220}
            />
          </ChartCard>
        )}
        {paymentData.length > 0 && (
          <ChartCard title='Revenue by payment method'>
            <EChart
              option={barOption(
                paymentData.map((d) => d.name),
                paymentData.map((d) => d.value),
              )}
              height={220}
            />
          </ChartCard>
        )}
      </div>
    </div>
  );
};
