import type { SpendingCurvePoint } from 'api/proto-http/admin';
import { FC } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface SpendingCurveChartProps {
  spendingCurve: SpendingCurvePoint[] | undefined;
}

export const SpendingCurveChart: FC<SpendingCurveChartProps> = ({ spendingCurve }) => {
  if (!spendingCurve || spendingCurve.length === 0) return null;

  const data = spendingCurve.map((point) => ({
    orderNumber: point.orderNumber || 0,
    avgCumulativeSpend: parseDecimal(point.avgCumulativeSpend),
    customerCount: point.customerCount || 0,
  }));

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Customer spending curve
      </Text>
      <ResponsiveContainer width='100%' height={300}>
        <LineChart data={data}>
<<<<<<< HEAD
          <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
          <XAxis 
            dataKey='orderNumber' 
            stroke='#666' 
            tick={{ fill: '#666' }}
            label={{ value: 'Order Number', position: 'insideBottom', offset: -5, fill: '#666' }}
          />
          <YAxis 
            stroke='#666' 
            tick={{ fill: '#666' }}
            label={{ value: 'Cumulative Spend', angle: -90, position: 'insideLeft', fill: '#666' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
            labelStyle={{ color: '#333' }}
=======
          <CartesianGrid strokeDasharray='3 3' stroke='#333' />
          <XAxis 
            dataKey='orderNumber' 
            stroke='#999' 
            tick={{ fill: '#999' }}
            label={{ value: 'Order Number', position: 'insideBottom', offset: -5, fill: '#999' }}
          />
          <YAxis 
            stroke='#999' 
            tick={{ fill: '#999' }}
            label={{ value: 'Cumulative Spend', angle: -90, position: 'insideLeft', fill: '#999' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
            labelStyle={{ color: '#fff' }}
>>>>>>> f0891c80561a95c2d46f89010526ca1850264475
            formatter={(value: number, name: string) => {
              if (name === 'avgCumulativeSpend') return [formatCurrency(value), 'Avg Cumulative'];
              if (name === 'customerCount') return [formatNumber(value), 'Customers'];
              return [value, name];
            }}
          />
          <Line 
            type='monotone' 
            dataKey='avgCumulativeSpend' 
<<<<<<< HEAD
            stroke='#333' 
            strokeWidth={2} 
            dot={{ fill: '#333' }} 
=======
            stroke='#fff' 
            strokeWidth={2} 
            dot={{ fill: '#fff' }} 
>>>>>>> f0891c80561a95c2d46f89010526ca1850264475
          />
        </LineChart>
      </ResponsiveContainer>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Shows average cumulative spending by order number across all customers</Text>
      </div>
    </div>
  );
};
