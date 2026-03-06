import type { AddToCartRateAnalysis, AddToCartRateGlobalRow } from 'api/proto-http/admin';
import { FC } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Text from 'ui/components/text';

interface AddToCartRateTrendChartProps {
  addToCartRateAnalysis: AddToCartRateAnalysis | undefined;
}

export const AddToCartRateTrendChart: FC<AddToCartRateTrendChartProps> = ({
  addToCartRateAnalysis,
}) => {
  const globalTrend = addToCartRateAnalysis?.globalTrend;
  if (!globalTrend?.length) return null;

  const chartData = globalTrend.map((row: AddToCartRateGlobalRow) => ({
    date: row.date ? new Date(row.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
    globalCartRatePct: ((row.globalCartRate ?? 0) * 100),
    totalViews: row.totalViews ?? 0,
    totalAddToCarts: row.totalAddToCarts ?? 0,
  }));

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Global ATC rate trend
      </Text>
      <ResponsiveContainer width='100%' height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
          <XAxis dataKey='date' tick={{ fontSize: 10 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
          />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'ATC rate']}
            labelFormatter={(label) => `Date: ${label}`}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className='bg-white border border-textInactiveColor p-3 shadow-lg text-xs'>
                  <div className='font-bold mb-2'>{d.date}</div>
                  <div className='mb-1'>ATC rate: {d.globalCartRatePct.toFixed(1)}%</div>
                  <div className='text-textInactiveColor'>
                    Views: {d.totalViews.toLocaleString()} · Add to carts: {d.totalAddToCarts.toLocaleString()}
                  </div>
                </div>
              );
            }}
          />
          <Line
            type='monotone'
            dataKey='globalCartRatePct'
            stroke='#333'
            strokeWidth={2}
            dot={{ fill: '#333', r: 3 }}
            name='ATC rate'
          />
        </LineChart>
      </ResponsiveContainer>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>
          Store-wide add-to-cart rate over time. A sudden drop may indicate low-intent traffic; a spike may reflect a successful campaign or collection drop.
        </Text>
      </div>
    </div>
  );
};
