import type { TimeSeriesPoint } from 'api/proto-http/admin';
import { FC } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface TimeSeriesChartProps {
  title: string;
  data: TimeSeriesPoint[] | undefined;
  compareData?: TimeSeriesPoint[] | undefined;
  valueFormat?: 'currency' | 'number';
}

export const TimeSeriesChart: FC<TimeSeriesChartProps> = ({
  title,
  data,
  compareData,
  valueFormat = 'currency',
}) => {
  const formatValue = valueFormat === 'currency' ? formatCurrency : formatNumber;

  // For number format (e.g. orders), backend may use 'count' instead of 'value'
  const getValue = (p: TimeSeriesPoint) =>
    valueFormat === 'number' ? parseDecimal(p.value) || (p.count ?? 0) : parseDecimal(p.value);

  const chartData = (data ?? []).map((p) => ({
    date: p.date
      ? new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '',
    value: getValue(p),
    count: p.count ?? 0,
  }));

  const compareValues = (compareData ?? []).map((p) => getValue(p));

  const merged = chartData.map((d, i) => ({
    ...d,
    compareValue: compareValues[i],
  }));

  if (merged.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4 min-h-[280px]'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        {title}
      </Text>
      <ResponsiveContainer width='100%' height={220}>
        <LineChart data={merged} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
          <XAxis dataKey='date' tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatValue(v)} />
          <Tooltip
            formatter={(value?: number) => [formatValue(value ?? 0), '']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend />
          <Line
            type='monotone'
            dataKey='value'
            stroke='#000'
            strokeWidth={2}
            dot={false}
            name='Period'
          />
          {compareData && compareData.length > 0 && (
            <Line
              type='monotone'
              dataKey='compareValue'
              stroke='#999'
              strokeWidth={1}
              strokeDasharray='5 5'
              dot={false}
              name='Compare'
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
