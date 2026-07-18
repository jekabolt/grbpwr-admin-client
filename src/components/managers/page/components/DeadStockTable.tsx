import type { DeadStockRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface DeadStockTableProps {
  deadStock: DeadStockRow[] | undefined;
}

export const DeadStockTable: FC<DeadStockTableProps> = ({ deadStock }) => {
  if (!deadStock || deadStock.length === 0) return null;

  // Most capital tied up first — that's what to liquidate to free cash, not the oldest SKU.
  const topDeadStock = [...deadStock]
    .sort((a, b) => parseDecimal(b.stockValue) - parseDecimal(a.stockValue))
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Dead stock (&gt;180 days)
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Product
                </Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Size
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Qty
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Days w/o Sale
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Stock Value
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topDeadStock.map((row, idx) => (
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
                  <Text>{formatNumber(row.quantity || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  {/* Every row here is >180 days by definition — bold for scanning, not red
                      (red on all rows is just noise; the € tied up is the real signal). */}
                  <Text className='font-bold'>{(row.daysWithoutSale || 0).toFixed(0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatCurrency(parseDecimal(row.stockValue))}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-textBaseSize text-labelColor space-y-1'>
        <Text>
          Inventory with no sales &gt;180 days — liquidate or write off. Sorted by € tied up.
        </Text>
        <Text>Stock value is at listed (retail) price, not cost.</Text>
      </div>
    </div>
  );
};
