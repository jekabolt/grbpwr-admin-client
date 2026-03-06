import type { AddToCartRateRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface AddToCartRateTableProps {
  addToCartRate: AddToCartRateRow[] | undefined;
}

export const AddToCartRateTable: FC<AddToCartRateTableProps> = ({ addToCartRate }) => {
  if (!addToCartRate || addToCartRate.length === 0) return null;

  const sorted = [...addToCartRate].sort((a, b) => (b.cartRate || 0) - (a.cartRate || 0)).slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Add to cart rates
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Views</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Add to Cart</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Cart Rate</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const cartRate = (row.cartRate || 0) * 100;
              const isLow = cartRate < 5;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text className='truncate max-w-[150px]' title={row.productName || ''}>
                      {row.productName || `#${row.productId}`}
                    </Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.viewCount || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.addToCartCount || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className={isLow ? 'text-error' : ''}>{cartRate.toFixed(1)}%</Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Low cart rates (&lt;5%) highlighted in red may indicate quality/pricing issues</Text>
      </div>
    </div>
  );
};
