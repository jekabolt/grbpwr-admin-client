import type { ProductZoomRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface ProductZoomTableProps {
  productZoom: ProductZoomRow[] | undefined;
}

export const ProductZoomTable: FC<ProductZoomTableProps> = ({ productZoom }) => {
  if (!productZoom || productZoom.length === 0) return null;

  const aggregated = productZoom.reduce(
    (acc, row) => {
      const key = `${row.productId}-${row.zoomMethod}`;
      if (!acc[key]) {
        acc[key] = {
          productId: row.productId,
          productName: row.productName,
          zoomMethod: row.zoomMethod || '—',
          zoomCount: 0,
        };
      }
      acc[key].zoomCount += row.zoomCount || 0;
      return acc;
    },
    {} as Record<string, { productId?: string; productName?: string; zoomMethod: string; zoomCount: number }>,
  );

  const rows = Object.values(aggregated)
    .sort((a, b) => b.zoomCount - a.zoomCount)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Product zoom
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Method</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Zoom count</Text>
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
                  <Text>{row.zoomMethod}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.zoomCount)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Image zoom interactions — pinch, double-tap, or click-to-zoom on product images</Text>
      </div>
    </div>
  );
};
