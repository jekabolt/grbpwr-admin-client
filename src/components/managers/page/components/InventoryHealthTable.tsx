import type { InventoryHealthRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface InventoryHealthTableProps {
  inventoryHealth: InventoryHealthRow[] | undefined;
}

export const InventoryHealthTable: FC<InventoryHealthTableProps> = ({ inventoryHealth }) => {
  if (!inventoryHealth || inventoryHealth.length === 0) return null;

  const atRisk = inventoryHealth.filter((row) => (row.daysOnHand || 0) > 60).slice(0, 20);

  if (atRisk.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Inventory health (at risk)
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
                <Text variant='uppercase' className='text-[10px]'>Qty</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Avg Daily Sales</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Days on Hand</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {atRisk.map((row, idx) => {
              const daysOnHand = row.daysOnHand || 0;
              const isVeryHigh = daysOnHand > 90;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='120px' />
                  </td>
                  <td className='p-2'>
                    <Text>{row.sizeName || `Size #${row.sizeId}`}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.quantity || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{(row.avgDailySales || 0).toFixed(2)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className={isVeryHigh ? 'text-error font-bold' : ''}>
                      {daysOnHand.toFixed(0)}
                    </Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Items with &gt;60 days on hand. &gt;90 days highlighted (consider discount/bundling)</Text>
      </div>
    </div>
  );
};
