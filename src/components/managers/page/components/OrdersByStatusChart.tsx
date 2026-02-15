import type { BusinessMetrics } from 'api/proto-http/admin';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FC } from 'react';
import Text from 'ui/components/text';

interface OrdersByStatusChartProps {
  metrics: BusinessMetrics | undefined;
}

const COLORS = ['#000', '#333', '#666', '#999', '#bbb', '#ddd'];

export const OrdersByStatusChart: FC<OrdersByStatusChartProps> = ({ metrics }) => {
  const data =
    metrics?.ordersByStatus?.map((s) => ({
      name: (s.statusName ?? 'Unknown').replace(/ORDER_STATUS_ENUM_/g, '').replace(/_/g, ' '),
      value: s.count ?? 0,
    })) ?? [];

  if (data.length === 0) return null;

  return (
    <div className='space-y-4'>
      <Text variant='uppercase' className='font-bold'>
        Orders by status
      </Text>
      <div className='border border-textInactiveColor p-4 min-h-[280px]'>
        <ResponsiveContainer width='100%' height={220}>
          <PieChart>
            <Pie
              data={data}
              cx='50%'
              cy='50%'
              innerRadius={40}
              outerRadius={80}
              paddingAngle={2}
              dataKey='value'
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => [value, 'Orders']} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
