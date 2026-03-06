import type { DeadStockRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface DeadStockTableProps {
  deadStock: DeadStockRow[] | undefined;
}

export const DeadStockTable: FC<DeadStockTableProps> = ({ deadStock }) => {
  if (!deadStock || deadStock.length === 0) return null;

  const topDeadStock = deadStock.slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Dead stock (&gt;180 days)
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
                <Text variant='uppercase' className='text-[10px]'>Days w/o Sale</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Stock Value</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topDeadStock.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <Text className='truncate max-w-[120px]' title={row.productName || ''}>
                    {row.productName || `#${row.productId}`}
                  </Text>
                </td>
                <td className='p-2'>
                  <Text>{row.sizeName || `Size #${row.sizeId}`}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.quantity || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='text-error font-bold'>{(row.daysWithoutSale || 0).toFixed(0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatCurrency(parseDecimal(row.stockValue))}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Inventory with no sales &gt;180 days - liquidate or write off</Text>
      </div>
    </div>
  );
};
