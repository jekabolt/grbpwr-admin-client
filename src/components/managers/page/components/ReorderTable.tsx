import type { InventoryHealthRow } from 'api/proto-http/admin';
import { FC, useMemo } from 'react';
import Text from 'ui/components/text';
import { DAYS_ON_HAND_NO_SALES_SENTINEL, formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface ReorderTableProps {
  inventoryHealth: InventoryHealthRow[] | undefined;
}

function daysOfCover(row: InventoryHealthRow): string {
  const d = row.daysOnHand ?? 0;
  if (d >= DAYS_ON_HAND_NO_SALES_SENTINEL || (row.avgDailySales ?? 0) <= 0) return '—';
  return d.toFixed(0);
}

/**
 * The buy-more list: SKUs the backend flagged needs_reorder against an operator-set target.
 * Understock, the mirror of the overstock table. Only meaningful for SKUs with a target set —
 * a generic days-of-cover flag would be misleading for one-off limited drops.
 */
export const ReorderTable: FC<ReorderTableProps> = ({ inventoryHealth }) => {
  const rows = useMemo(
    () =>
      (inventoryHealth ?? [])
        .filter((r) => r.hasTarget && r.needsReorder)
        .sort((a, b) => (a.daysOnHand ?? 0) - (b.daysOnHand ?? 0))
        .slice(0, 30),
    [inventoryHealth],
  );

  if (rows.length === 0) return null;

  return (
    <div className='border-2 border-warning/60 p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Reorder now ({rows.length})
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Product
                </Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Size
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  On Hand
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Reorder Pt
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Days of Cover
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Sold / Day
                </Text>
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
                    maxWidth='120px'
                  />
                </td>
                <td className='p-2'>
                  <Text>{row.sizeName || `Size #${row.sizeId}`}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.quantity || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='text-textInactiveColor'>
                    {formatNumber(row.reorderPoint || 0)}
                  </Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{daysOfCover(row)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{(row.avgDailySales || 0).toFixed(2)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>
          At or below their reorder point — restock before they sell out. Lowest cover first.
        </Text>
      </div>
    </div>
  );
};
