import type { ReturnBySizeRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface ReturnBySizeTableProps {
  returnBySize: ReturnBySizeRow[] | undefined;
}

export const ReturnBySizeTable: FC<ReturnBySizeTableProps> = ({ returnBySize }) => {
  if (!returnBySize || returnBySize.length === 0) return null;

  const sorted = [...returnBySize].sort((a, b) => (b.returnRate || 0) - (a.returnRate || 0));

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Return rate by size
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Size</Text>
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const returnRate = (row.returnRate || 0) * 100;
              const isHigh = returnRate > 20;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text className='font-bold'>{row.sizeName || `Size #${row.sizeId}`}</Text>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>High return rates (&gt;20%) may indicate sizing issues for specific sizes</Text>
      </div>
    </div>
  );
};
