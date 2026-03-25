import type { SizeRunEfficiencyRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface SizeRunEfficiencyTableProps {
  sizeRunEfficiency: SizeRunEfficiencyRow[] | undefined;
}

export const SizeRunEfficiencyTable: FC<SizeRunEfficiencyTableProps> = ({ sizeRunEfficiency }) => {
  if (!sizeRunEfficiency || sizeRunEfficiency.length === 0) return null;

  const sorted = [...sizeRunEfficiency]
    .sort((a, b) => (a.efficiencyPct || 0) - (b.efficiencyPct || 0))
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Size run efficiency
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Total sizes</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Sold through</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Efficiency</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const pct = row.efficiencyPct || 0;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <ProductNameLink
                      productId={row.productId}
                      productName={row.productName}
                      maxWidth='150px'
                    />
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.totalSizes || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.soldThroughSizes || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className={pct < 50 ? 'text-error font-bold' : 'font-bold'}>
                      {pct.toFixed(1)}%
                    </Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>
          Percentage of available sizes that sold — low efficiency may indicate overbuying on
          certain sizes
        </Text>
      </div>
    </div>
  );
};
