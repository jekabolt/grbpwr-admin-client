import type { RevenueParetoRow } from 'api/proto-http/admin';
import { FC } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Text from 'ui/components/text';
import { formatCurrency, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface RevenueParetoChartProps {
  revenuePareto: RevenueParetoRow[] | undefined;
}

export const RevenueParetoChart: FC<RevenueParetoChartProps> = ({ revenuePareto }) => {
  if (!revenuePareto || revenuePareto.length === 0) return null;

  const data = revenuePareto.map((row) => ({
    rank: row.rank || 0,
    productId: row.productId,
    productName: row.productName || `#${row.productId}`,
    productNameShort: (row.productName || `#${row.productId}`).slice(0, 15),
    revenue: parseDecimal(row.revenue),
    cumulativePct: (row.cumulativePct || 0) * 100,
  }));

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Revenue pareto (80/20)
      </Text>
      <ResponsiveContainer width='100%' height={300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray='3 3' stroke='#333' />
          <XAxis 
            dataKey='rank' 
            stroke='#999' 
            tick={{ fill: '#999' }}
            label={{ value: 'Product Rank', position: 'insideBottom', offset: -5, fill: '#999' }}
          />
          <YAxis 
            stroke='#999' 
            tick={{ fill: '#999' }}
            label={{ value: 'Cumulative Revenue %', angle: -90, position: 'insideLeft', fill: '#999' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
            labelStyle={{ color: '#fff' }}
            formatter={(value: number, name: string) => {
              if (name === 'cumulativePct') return [`${value.toFixed(1)}%`, 'Cumulative %'];
              if (name === 'revenue') return [formatCurrency(value), 'Revenue'];
              return [value, name];
            }}
          />
          <Area 
            type='monotone' 
            dataKey='cumulativePct' 
            stroke='#fff' 
            fill='rgba(255,255,255,0.2)' 
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className='mt-4 overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-1'>
                <Text variant='uppercase' className='text-[10px]'>Rank</Text>
              </th>
              <th className='text-left p-1'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-1'>
                <Text variant='uppercase' className='text-[10px]'>Revenue</Text>
              </th>
              <th className='text-right p-1'>
                <Text variant='uppercase' className='text-[10px]'>Cumulative %</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 15).map((row) => (
              <tr key={row.rank} className='border-b border-textInactiveColor/50 hover:bg-bgSecondary'>
                <td className='p-1'>{row.rank}</td>
                <td className='p-1'>
                  <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='140px' />
                </td>
                <td className='p-1 text-right'>{formatCurrency(row.revenue)}</td>
                <td className='p-1 text-right'>{row.cumulativePct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Shows cumulative revenue % by product rank (identifies 80/20 rule)</Text>
      </div>
    </div>
  );
};
