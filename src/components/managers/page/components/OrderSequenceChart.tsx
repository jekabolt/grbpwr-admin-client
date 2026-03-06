import type { OrderSequenceMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface OrderSequenceChartProps {
  orderSequence: OrderSequenceMetric[] | undefined;
}

export const OrderSequenceChart: FC<OrderSequenceChartProps> = ({ orderSequence }) => {
  if (!orderSequence || orderSequence.length === 0) return null;

  const data = orderSequence.map((m) => ({
    orderNumber: m.orderNumber || 0,
    orderCount: m.orderCount || 0,
    avgOrderValue: parseDecimal(m.avgOrderValue),
    avgDaysSincePrev: m.avgDaysSincePrev || 0,
  }));

  return (
    <div className='border border-textInactiveColor p-4 min-h-[480px] w-full min-w-0'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Order sequence analysis
      </Text>
      <div className='space-y-6'>
        <div className='min-h-[220px] w-full'>
          <Text variant='uppercase' className='text-xs mb-2'>Order Count by Sequence</Text>
          <ResponsiveContainer width='100%' height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
              <XAxis dataKey='orderNumber' stroke='#666' tick={{ fill: '#666' }} />
              <YAxis stroke='#666' tick={{ fill: '#666' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                labelStyle={{ color: '#333' }}
                formatter={(value: number) => [formatNumber(value), 'Orders']}
              />
              <Bar dataKey='orderCount' fill='#333' />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className='min-h-[220px] w-full'>
          <Text variant='uppercase' className='text-xs mb-2'>Avg Order Value by Sequence</Text>
          <ResponsiveContainer width='100%' height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
              <XAxis dataKey='orderNumber' stroke='#666' tick={{ fill: '#666' }} />
              <YAxis stroke='#666' tick={{ fill: '#666' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                labelStyle={{ color: '#333' }}
                formatter={(value: number) => [formatCurrency(value), 'AOV']}
              />
              <Line type='monotone' dataKey='avgOrderValue' stroke='#333' strokeWidth={2} dot={{ fill: '#333' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
