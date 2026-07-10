import type { TimeSeriesPoint } from 'api/proto-http/admin';
import type { EChartsOption } from 'echarts';
import { FC, useMemo } from 'react';
import { EChart, chartColors } from '../charts';
import { parseDecimal } from '../utils';
import type { SparklineValueFormat } from './kpiSparklineConfig';

function pointValue(p: TimeSeriesPoint, valueFormat: SparklineValueFormat): number {
  if (valueFormat === 'number') {
    return parseDecimal(p.value) || (p.count ?? 0);
  }
  return parseDecimal(p.value);
}

interface MetricSparklineProps {
  data: TimeSeriesPoint[];
  compareData?: TimeSeriesPoint[] | undefined;
  valueFormat: SparklineValueFormat;
  showCompare?: boolean;
}

export const MetricSparkline: FC<MetricSparklineProps> = ({
  data,
  compareData,
  valueFormat,
  showCompare = false,
}) => {
  const values = useMemo(() => data.map((p) => pointValue(p, valueFormat)), [data, valueFormat]);
  const compareValues = useMemo(
    () => (compareData ?? []).map((p) => pointValue(p, valueFormat)),
    [compareData, valueFormat],
  );

  if (values.length === 0) return null;

  const hasCompare = Boolean(showCompare && compareData && compareData.length > 0);

  const option: EChartsOption = {
    animation: false,
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, boundaryGap: false },
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'line',
        data: values,
        symbol: 'none',
        lineStyle: { color: chartColors.ink, width: 1.5 },
      },
      ...(hasCompare
        ? [
            {
              type: 'line' as const,
              data: compareValues,
              symbol: 'none',
              connectNulls: true,
              lineStyle: { color: chartColors.compare, width: 1, type: 'dashed' as const },
            },
          ]
        : []),
    ],
  };

  return (
    <div className='h-8 w-full mt-1 -mx-0.5' aria-hidden>
      <EChart option={option} height={32} />
    </div>
  );
};
