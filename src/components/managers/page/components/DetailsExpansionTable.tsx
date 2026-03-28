import type { DetailsExpansionRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface DetailsExpansionTableProps {
  detailsExpansion: DetailsExpansionRow[] | undefined;
}

export const DetailsExpansionTable: FC<DetailsExpansionTableProps> = ({ detailsExpansion }) => {
  if (!detailsExpansion || detailsExpansion.length === 0) return null;

  const aggregated = detailsExpansion.reduce(
    (acc, row) => {
      const key = `${row.productId}-${row.sectionName}`;
      if (!acc[key]) {
        acc[key] = {
          productId: row.productId,
          productName: row.productName,
          sectionName: row.sectionName || '—',
          expandCount: 0,
        };
      }
      acc[key].expandCount += row.expandCount || 0;
      return acc;
    },
    {} as Record<string, { productId?: string; productName?: string; sectionName: string; expandCount: number }>,
  );

  const rows = Object.values(aggregated)
    .sort((a, b) => b.expandCount - a.expandCount)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        What info are shoppers looking for?
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Section</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Expansions</Text>
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
                  <Text>{row.sectionName}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.expandCount)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Accordion / detail section expansions on product pages — shows what info users seek</Text>
      </div>
    </div>
  );
};
