import type { ReturnByProductRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';

interface ReturnByProductTableProps {
  returnByProduct: ReturnByProductRow[] | undefined;
}

export const ReturnByProductTable: FC<ReturnByProductTableProps> = ({ returnByProduct }) => {
  if (!returnByProduct || returnByProduct.length === 0) return null;

  const sorted = [...returnByProduct]
    .sort((a, b) => (b.totalReturnRate || 0) - (a.totalReturnRate || 0))
    .slice(0, 20);

  const allReasonKeys = Array.from(
    new Set(sorted.flatMap((row) => Object.keys(row.reasons ?? {}))),
  );

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
                <Text variant='uppercase' className='text-[10px]'>Return Rate</Text>
              </th>
              {allReasonKeys.map((reason) => (
                <th key={reason} className='text-right p-2'>
                  <Text variant='uppercase' className='text-[10px]'>{reason.replace(/_/g, ' ')}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const rate = row.totalReturnRate ?? 0;
              const isHigh = rate > 30;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text className='truncate max-w-[150px]' title={row.productName || ''}>
                      {row.productName || '—'}
                    </Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className={isHigh ? 'text-error font-bold' : ''}>
                      {rate.toFixed(1)}%
                    </Text>
                  </td>
                  {allReasonKeys.map((reason) => (
                    <td key={reason} className='p-2 text-right'>
                      <Text>{((row.reasons?.[reason] ?? 0) * 100).toFixed(1)}%</Text>
                    </td>
                  ))}
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
