import type { BusinessMetrics } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface ProductChartsProps {
  metrics: BusinessMetrics | undefined;
}

export const ProductCharts: FC<ProductChartsProps> = ({ metrics }) => {
  const navigate = useNavigate();
  if (!metrics) return null;

  const revenueData =
    metrics.topProductsByRevenue?.slice(0, 10).map((p) => ({
      name: (p.productName || `#${p.productId}`).slice(0, 20),
      value: parseDecimal(p.value),
      count: p.count ?? 0,
      productId: p.productId,
    })) ?? [];

  const quantityData =
    metrics.topProductsByQuantity?.slice(0, 10).map((p) => ({
      name: (p.productName || `#${p.productId}`).slice(0, 20),
      value: p.count ?? 0,
      revenue: parseDecimal(p.value),
      productId: p.productId,
    })) ?? [];

  // Revenue rank with margin, so a top seller that's actually low-margin is visible.
  const revenueMarginRows =
    metrics.topProductsByRevenue?.slice(0, 10).map((p) => ({
      productId: p.productId,
      productName: p.productName,
      revenue: parseDecimal(p.value),
      units: p.count ?? 0,
      marginPct: p.grossMarginPct,
      hasCost: p.hasCost ?? false,
    })) ?? [];
  const anyCosted = revenueMarginRows.some((r) => r.hasCost);

  const handleProductBarClick = (data: { productId?: number }) => {
    const id = data?.productId;
    if (id != null && !isNaN(id)) {
      navigate(`${BASE_PATH}/products/${id}`);
    }
  };

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
              <BarChart
                data={revenueData}
                layout='vertical'
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
                <XAxis
                  type='number'
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <YAxis type='category' dataKey='name' width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                <Bar
                  dataKey='value'
                  fill='#000'
                  radius={[0, 2, 2, 0]}
                  onClick={(data) => data && handleProductBarClick(data)}
                  cursor='pointer'
                />
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
              <BarChart
                data={quantityData}
                layout='vertical'
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
                <XAxis type='number' dataKey='value' tick={{ fontSize: 10 }} />
                <YAxis type='category' dataKey='name' width={80} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar
                  dataKey='value'
                  fill='#000'
                  radius={[0, 2, 2, 0]}
                  onClick={(data) => data && handleProductBarClick(data)}
                  cursor='pointer'
                />
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
              <BarChart
                data={categoryData}
                layout='vertical'
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
                <XAxis
                  type='number'
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <YAxis type='category' dataKey='name' width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                <Bar dataKey='value' fill='#000' radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {revenueMarginRows.length > 0 && (
        <div className='border border-textInactiveColor p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2 mb-3'>
            <Text variant='uppercase' className='font-bold block'>
              Top products — revenue vs margin
            </Text>
            {!anyCosted && (
              <Text variant='inactive' size='small'>
                add product cost to see margin
              </Text>
            )}
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead>
                <tr className='border-b border-textInactiveColor'>
                  <th className='text-left p-2'>
                    <Text variant='uppercase' className='text-[10px]'>
                      Product
                    </Text>
                  </th>
                  <th className='text-right p-2'>
                    <Text variant='uppercase' className='text-[10px]'>
                      Revenue
                    </Text>
                  </th>
                  <th className='text-right p-2'>
                    <Text variant='uppercase' className='text-[10px]'>
                      Units
                    </Text>
                  </th>
                  <th className='text-right p-2'>
                    <Text variant='uppercase' className='text-[10px]'>
                      Margin
                    </Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {revenueMarginRows.map((row, idx) => (
                  <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                    <td className='p-2'>
                      <ProductNameLink
                        productId={row.productId}
                        productName={row.productName}
                        maxWidth='150px'
                      />
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatCurrency(row.revenue)}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatNumber(row.units)}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      {row.hasCost && row.marginPct != null ? (
                        <Text>{row.marginPct.toFixed(0)}%</Text>
                      ) : (
                        <Text variant='inactive'>N/A</Text>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
