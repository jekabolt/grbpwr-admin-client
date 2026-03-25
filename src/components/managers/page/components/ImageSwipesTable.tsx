import type { ImageSwipeRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface ImageSwipesTableProps {
  imageSwipes: ImageSwipeRow[] | undefined;
}

export const ImageSwipesTable: FC<ImageSwipesTableProps> = ({ imageSwipes }) => {
  if (!imageSwipes || imageSwipes.length === 0) return null;

  const aggregated = imageSwipes.reduce(
    (acc, row) => {
      const key = `${row.productId}-${row.swipeDirection}`;
      if (!acc[key]) {
        acc[key] = {
          productId: row.productId,
          productName: row.productName,
          swipeDirection: row.swipeDirection || '—',
          swipeCount: 0,
        };
      }
      acc[key].swipeCount += row.swipeCount || 0;
      return acc;
    },
    {} as Record<string, { productId?: string; productName?: string; swipeDirection: string; swipeCount: number }>,
  );

  const rows = Object.values(aggregated)
    .sort((a, b) => b.swipeCount - a.swipeCount)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Image swipes
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Direction</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Swipes</Text>
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
                  <Text>{row.swipeDirection}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.swipeCount)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Gallery swipe interactions — indicates visual engagement with product imagery</Text>
      </div>
    </div>
  );
};
