import type { ScrollDepthRow } from 'api/proto-http/admin';
import { FC } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface ScrollDepthChartProps {
  scrollDepth: ScrollDepthRow[] | undefined;
}

export const ScrollDepthChart: FC<ScrollDepthChartProps> = ({ scrollDepth }) => {
  if (!scrollDepth || scrollDepth.length === 0) return null;

  const aggregated = scrollDepth.reduce((acc, row) => {
    const key = row.pageType || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        pageType: key,
        scroll25: 0,
        scroll50: 0,
        scroll75: 0,
        scroll100: 0,
        totalUsers: 0,
      };
    }
    acc[key].scroll25 += row.scroll25 || 0;
    acc[key].scroll50 += row.scroll50 || 0;
    acc[key].scroll75 += row.scroll75 || 0;
    acc[key].scroll100 += row.scroll100 || 0;
    acc[key].totalUsers += row.totalUsers || 0;
    return acc;
  }, {} as Record<string, {
    pageType: string;
    scroll25: number;
    scroll50: number;
    scroll75: number;
    scroll100: number;
    totalUsers: number;
  }>);

  const data = Object.values(aggregated).map((row) => ({
    pageType: row.pageType,
    '25%': row.totalUsers > 0 ? (row.scroll25 / row.totalUsers) * 100 : 0,
    '50%': row.totalUsers > 0 ? (row.scroll50 / row.totalUsers) * 100 : 0,
    '75%': row.totalUsers > 0 ? (row.scroll75 / row.totalUsers) * 100 : 0,
    '100%': row.totalUsers > 0 ? (row.scroll100 / row.totalUsers) * 100 : 0,
  }));

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Scroll depth by page type
      </Text>
      <ResponsiveContainer width='100%' height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray='3 3' stroke='#333' />
          <XAxis dataKey='pageType' stroke='#999' tick={{ fill: '#999' }} />
          <YAxis stroke='#999' tick={{ fill: '#999' }} label={{ value: '% of Users', angle: -90, position: 'insideLeft', fill: '#999' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
            labelStyle={{ color: '#fff' }}
            formatter={(value: number) => `${value.toFixed(1)}%`}
          />
          <Legend />
          <Bar dataKey='25%' fill='#666' />
          <Bar dataKey='50%' fill='#888' />
          <Bar dataKey='75%' fill='#aaa' />
          <Bar dataKey='100%' fill='#fff' />
        </BarChart>
      </ResponsiveContainer>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Low scroll depth indicates weak above-the-fold content</Text>
      </div>
    </div>
  );
};
