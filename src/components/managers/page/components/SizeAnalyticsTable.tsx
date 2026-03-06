import type { SizeAnalyticsRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface SizeAnalyticsTableProps {
  sizeAnalytics: SizeAnalyticsRow[] | undefined;
}

export const SizeAnalyticsTable: FC<SizeAnalyticsTableProps> = ({ sizeAnalytics }) => {
  if (!sizeAnalytics || sizeAnalytics.length === 0) return null;

  const topSizes = sizeAnalytics.slice(0, 30);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Size distribution
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Size</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Units Sold</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Revenue</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>% of Product</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topSizes.map((row, idx) => {
              const pctOfProduct = (row.pctOfProduct || 0) * 100;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text className='truncate max-w-[120px]' title={row.productName || ''}>
                      {row.productName || `#${row.productId}`}
                    </Text>
                  </td>
                  <td className='p-2'>
                    <Text className='font-bold'>{row.sizeName || `Size #${row.sizeId}`}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.unitsSold || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatCurrency(parseDecimal(row.revenue))}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{pctOfProduct.toFixed(1)}%</Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
