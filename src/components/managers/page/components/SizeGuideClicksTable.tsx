import type { SizeGuideClickRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface SizeGuideClicksTableProps {
  sizeGuideClicks: SizeGuideClickRow[] | undefined;
}

export const SizeGuideClicksTable: FC<SizeGuideClicksTableProps> = ({ sizeGuideClicks }) => {
  if (!sizeGuideClicks || sizeGuideClicks.length === 0) return null;

  const aggregated = sizeGuideClicks.reduce(
    (acc, row) => {
      const key = `${row.productId}-${row.pageLocation}`;
      if (!acc[key]) {
        acc[key] = {
          productId: row.productId,
          productName: row.productName,
          pageLocation: row.pageLocation || '—',
          clickCount: 0,
        };
      }
      acc[key].clickCount += row.clickCount || 0;
      return acc;
    },
    {} as Record<string, { productId?: string; productName?: string; pageLocation: string; clickCount: number }>,
  );

  const rows = Object.values(aggregated)
    .sort((a, b) => b.clickCount - a.clickCount)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Size guide usage rate
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Location</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Clicks</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='150px'
                  />
                </td>
                <td className='p-2'>
                  <Text className='font-mono text-[10px]'>{row.pageLocation}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.clickCount)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Size guide usage — high clicks may indicate sizing uncertainty for a product</Text>
      </div>
    </div>
  );
};
