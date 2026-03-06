import type { SlowMoverRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface SlowMoversTableProps {
  slowMovers: SlowMoverRow[] | undefined;
}

export const SlowMoversTable: FC<SlowMoversTableProps> = ({ slowMovers }) => {
  if (!slowMovers || slowMovers.length === 0) return null;

  const topSlowMovers = slowMovers.slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Slow movers
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Revenue</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Units Sold</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Days in Stock</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Last Sale</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topSlowMovers.map((row, idx) => {
              const lastSaleDate = row.lastSaleDate ? new Date(row.lastSaleDate) : null;
              const lastSaleStr = lastSaleDate 
                ? lastSaleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Never';
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text className='truncate max-w-[150px]' title={row.productName || ''}>
                      {row.productName || `#${row.productId}`}
                    </Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatCurrency(parseDecimal(row.revenue))}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.unitsSold || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className='text-error'>{(row.daysInStock || 0).toFixed(0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{lastSaleStr}</Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Products with low sales velocity - consider promotions or markdown</Text>
      </div>
    </div>
  );
};
