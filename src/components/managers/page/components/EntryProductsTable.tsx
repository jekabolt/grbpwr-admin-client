import type { EntryProductMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface EntryProductsTableProps {
  entryProducts: EntryProductMetric[] | undefined;
}

export const EntryProductsTable: FC<EntryProductsTableProps> = ({ entryProducts }) => {
  if (!entryProducts || entryProducts.length === 0) return null;

  const sorted = [...entryProducts]
    .sort((a, b) => (b.purchaseCount || 0) - (a.purchaseCount || 0))
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        First purchase products
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Purchases</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Revenue</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='180px'
                  />
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.purchaseCount || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatCurrency(parseDecimal(row.totalRevenue))}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>First products customers purchase — gateway items driving new acquisitions</Text>
      </div>
    </div>
  );
};
