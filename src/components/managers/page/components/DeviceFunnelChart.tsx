import type { DeviceFunnelMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface DeviceFunnelChartProps {
  deviceFunnel: DeviceFunnelMetric[] | undefined;
}

export const DeviceFunnelChart: FC<DeviceFunnelChartProps> = ({ deviceFunnel }) => {
  if (!deviceFunnel || deviceFunnel.length === 0) return null;

  const aggregated = deviceFunnel.reduce((acc, metric) => {
    const key = metric.deviceCategory || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        device: key,
        sessions: 0,
        addToCart: 0,
        checkout: 0,
        purchase: 0,
      };
    }
    acc[key].sessions += metric.sessions || 0;
    acc[key].addToCart += metric.addToCartUsers || 0;
    acc[key].checkout += metric.checkoutUsers || 0;
    acc[key].purchase += metric.purchaseUsers || 0;
    return acc;
  }, {} as Record<string, {
    device: string;
    sessions: number;
    addToCart: number;
    checkout: number;
    purchase: number;
  }>);

  const data = Object.values(aggregated);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Device funnel
      </Text>
      <ResponsiveContainer width='100%' height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray='3 3' stroke='#333' />
          <XAxis dataKey='device' stroke='#999' tick={{ fill: '#999' }} />
          <YAxis stroke='#999' tick={{ fill: '#999' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
            labelStyle={{ color: '#fff' }}
            formatter={(value: number) => formatNumber(value)}
          />
          <Legend />
          <Bar dataKey='sessions' fill='#888' name='Sessions' />
          <Bar dataKey='addToCart' fill='#aaa' name='Add to Cart' />
          <Bar dataKey='checkout' fill='#ccc' name='Checkout' />
          <Bar dataKey='purchase' fill='#fff' name='Purchase' />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
