import type { ReturnByProductRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface ReturnByProductTableProps {
  returnByProduct: ReturnByProductRow[] | undefined;
}

export const ReturnByProductTable: FC<ReturnByProductTableProps> = ({ returnByProduct }) => {
  if (!returnByProduct || returnByProduct.length === 0) return null;

  const sorted = [...returnByProduct].sort((a, b) => (b.returnRate || 0) - (a.returnRate || 0)).slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Return rate by product
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Total Sold</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Returned</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Return Rate</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Return Value</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const returnRate = (row.returnRate || 0) * 100;
              const isHigh = returnRate > 30;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text className='truncate max-w-[150px]' title={row.productName || ''}>
                      {row.productName || `#${row.productId}`}
                    </Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.totalSold || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.totalReturned || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className={isHigh ? 'text-error font-bold' : ''}>
                      {returnRate.toFixed(1)}%
                    </Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatCurrency(parseDecimal(row.returnValue))}</Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>High return rates (&gt;30%) indicate quality or fit issues</Text>
      </div>
    </div>
  );
};
