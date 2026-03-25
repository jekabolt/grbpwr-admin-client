import type { CategoryLoyaltyRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface CategoryLoyaltyTableProps {
  categoryLoyalty: CategoryLoyaltyRow[] | undefined;
}

export const CategoryLoyaltyTable: FC<CategoryLoyaltyTableProps> = ({ categoryLoyalty }) => {
  if (!categoryLoyalty || categoryLoyalty.length === 0) return null;

  const sorted = [...categoryLoyalty]
    .sort((a, b) => (b.customerCount || 0) - (a.customerCount || 0))
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Category loyalty
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>First category</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Second category</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Customers</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <Text>{row.firstCategory || '—'}</Text>
                </td>
                <td className='p-2'>
                  <Text>{row.secondCategory || '—'}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.customerCount || 0)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Cross-category purchasing patterns — which categories customers buy together</Text>
      </div>
    </div>
  );
};
