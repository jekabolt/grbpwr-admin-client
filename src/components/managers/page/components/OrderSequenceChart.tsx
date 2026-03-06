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
<<<<<<< HEAD
    <div className='border border-textInactiveColor p-4 min-h-[480px] w-full min-w-0'>
=======
    <div className='border border-textInactiveColor p-4'>
>>>>>>> f0891c80561a95c2d46f89010526ca1850264475
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Order sequence analysis
      </Text>
      <div className='space-y-6'>
<<<<<<< HEAD
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
=======
        <div>
          <Text variant='uppercase' className='text-xs mb-2'>Order Count by Sequence</Text>
          <ResponsiveContainer width='100%' height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray='3 3' stroke='#333' />
              <XAxis dataKey='orderNumber' stroke='#999' tick={{ fill: '#999' }} />
              <YAxis stroke='#999' tick={{ fill: '#999' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value: number) => [formatNumber(value), 'Orders']}
              />
              <Bar dataKey='orderCount' fill='#fff' />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <Text variant='uppercase' className='text-xs mb-2'>Avg Order Value by Sequence</Text>
          <ResponsiveContainer width='100%' height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray='3 3' stroke='#333' />
              <XAxis dataKey='orderNumber' stroke='#999' tick={{ fill: '#999' }} />
              <YAxis stroke='#999' tick={{ fill: '#999' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value: number) => [formatCurrency(value), 'AOV']}
              />
              <Line type='monotone' dataKey='avgOrderValue' stroke='#fff' strokeWidth={2} dot={{ fill: '#fff' }} />
>>>>>>> f0891c80561a95c2d46f89010526ca1850264475
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
