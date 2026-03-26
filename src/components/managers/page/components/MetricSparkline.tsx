import type { TimeSeriesPoint } from 'api/proto-http/admin';
import { FC, useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import type { SparklineValueFormat } from './kpiSparklineConfig';
import { parseDecimal } from '../utils';

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
  const chartData = useMemo(() => {
    const compareValues = (compareData ?? []).map((p) => pointValue(p, valueFormat));
    return data.map((p, i) => ({
      i,
      v: pointValue(p, valueFormat),
      c: compareValues[i],
    }));
  }, [data, compareData, valueFormat]);

  if (chartData.length === 0) return null;

  const hasCompare = Boolean(showCompare && compareData && compareData.length > 0);

  return (
    <div className='h-8 w-full mt-1 -mx-0.5' aria-hidden>
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
          <Line type='monotone' dataKey='v' stroke='#000' strokeWidth={1.5} dot={false} isAnimationActive={false} />
          {hasCompare && (
            <Line
              type='monotone'
              dataKey='c'
              stroke='#999'
              strokeWidth={1}
              strokeDasharray='4 3'
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
