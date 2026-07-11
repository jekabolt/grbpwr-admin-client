import type { common_StockChange } from 'api/proto-http/admin';
import {
  categoryAxis,
  ChartCard,
  chartColors,
  EChart,
  gridBase,
  tooltipBase,
  valueAxis,
} from 'components/managers/page/charts';
import { format } from 'date-fns';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { useMemo } from 'react';
import { Button } from 'ui/components/button';

interface StockTrendChartProps {
  changes: common_StockChange[];
  productId?: number;
  sizeLabel: string;
  onDownloadCsv: () => void;
  isLoading?: boolean;
}

export function StockTrendChart({
  changes,
  productId,
  sizeLabel,
  onDownloadCsv,
  isLoading,
}: StockTrendChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...changes].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    });
    return sorted.map((c) => ({
      date: c.createdAt ? format(new Date(c.createdAt), 'MMM d yy') : '',
      quantity: Number(c.quantityAfter?.value ?? 0),
      fullDate: c.createdAt ? new Date(c.createdAt).toLocaleString() : '',
    }));
  }, [changes]);

  const hasData = chartData.length > 0;

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const first = items[0];
    const fullDate = chartData[first?.dataIndex ?? 0]?.fullDate ?? '';
    const qty = Number(first?.value ?? 0);
    return `<div style="font-size:11px;line-height:1.6">${fullDate}<br/>Quantity: <b>${qty}</b></div>`;
  };

  const option: EChartsOption = {
    grid: { ...gridBase },
    tooltip: { ...tooltipBase, trigger: 'axis', formatter: tooltipFormatter },
    xAxis: categoryAxis({ data: chartData.map((d) => d.date), boundaryGap: false }),
    yAxis: valueAxis({
      minInterval: 1,
      axisLabel: { formatter: (v: number) => `${Math.round(v)}` },
    }),
    series: [
      {
        name: 'Quantity',
        type: 'line',
        data: chartData.map((d) => d.quantity),
        smooth: false,
        symbol: 'none',
        lineStyle: { color: chartColors.accent, width: 2 },
        areaStyle: { color: 'rgba(49,30,238,0.12)' },
      },
    ],
  };

  const downloadButton = (
    <Button
      type='button'
      variant='secondary'
      onClick={onDownloadCsv}
      disabled={!hasData || isLoading}
    >
      Download CSV
    </Button>
  );

  return (
    <ChartCard
      title='Product Stock Trend'
      subtitle={`Product ${productId != null ? productId : '—'}; Size: ${sizeLabel}`}
      action={downloadButton}
      emptyMessage={!hasData ? (isLoading ? 'Loading…' : 'No data to display') : undefined}
      className='shrink-0 rounded-none bg-bgColor'
    >
      <EChart option={option} height={220} />
    </ChartCard>
  );
}
