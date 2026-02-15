import type { BusinessMetrics } from 'api/proto-http/admin';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, parseDecimal } from '../utils';

interface ProductChartsProps {
  metrics: BusinessMetrics | undefined;
}

export const ProductCharts: FC<ProductChartsProps> = ({ metrics }) => {
  if (!metrics) return null;

  const revenueData =
    metrics.topProductsByRevenue?.slice(0, 10).map((p) => ({
      name: (p.productName || `#${p.productId}`).slice(0, 20),
      value: parseDecimal(p.value),
      count: p.count ?? 0,
    })) ?? [];

  const quantityData =
    metrics.topProductsByQuantity?.slice(0, 10).map((p) => ({
      name: (p.productName || `#${p.productId}`).slice(0, 20),
      value: p.count ?? 0,
      revenue: parseDecimal(p.value),
    })) ?? [];

  const categoryData =
    metrics.revenueByCategory?.map((c) => ({
      name: (c.categoryName || `#${c.categoryId}`).slice(0, 20),
      value: parseDecimal(c.value),
      count: c.count ?? 0,
    })) ?? [];

  return (
    <div className='space-y-6'>
      <Text variant='uppercase' className='font-bold'>
        Products & categories
      </Text>
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {revenueData.length > 0 && (
          <div className='border border-textInactiveColor p-4 min-h-[280px]'>
            <Text variant='uppercase' className='font-bold mb-4 block'>
              Top products by revenue
            </Text>
            <ResponsiveContainer width='100%' height={220}>
              <BarChart data={revenueData} layout='vertical' margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
                <XAxis type='number' tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type='category' dataKey='name' width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                <Bar dataKey='value' fill='#000' radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {quantityData.length > 0 && (
          <div className='border border-textInactiveColor p-4 min-h-[280px]'>
            <Text variant='uppercase' className='font-bold mb-4 block'>
              Top products by quantity
            </Text>
            <ResponsiveContainer width='100%' height={220}>
              <BarChart data={quantityData} layout='vertical' margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
                <XAxis type='number' dataKey='value' tick={{ fontSize: 10 }} />
                <YAxis type='category' dataKey='name' width={80} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey='value' fill='#000' radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {categoryData.length > 0 && (
          <div className='border border-textInactiveColor p-4 min-h-[280px]'>
            <Text variant='uppercase' className='font-bold mb-4 block'>
              Revenue by category
            </Text>
            <ResponsiveContainer width='100%' height={220}>
              <BarChart data={categoryData} layout='vertical' margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
                <XAxis type='number' tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type='category' dataKey='name' width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                <Bar dataKey='value' fill='#000' radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
