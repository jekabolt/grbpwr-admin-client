import type { CustomerSegmentRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface CustomerSegmentsTableProps {
  customerSegments: CustomerSegmentRow[] | undefined;
}

export const CustomerSegmentsTable: FC<CustomerSegmentsTableProps> = ({ customerSegments }) => {
  if (!customerSegments || customerSegments.length === 0) return null;

  const sorted = [...customerSegments]
    .sort((a, b) => parseDecimal(b.totalRevenue) - parseDecimal(a.totalRevenue))
    .slice(0, 30);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Customer segments
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Email</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Segment</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Orders</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Total revenue</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Avg order</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2 max-w-[180px] truncate' title={row.email || ''}>
                  <Text>{row.email || '—'}</Text>
                </td>
                <td className='p-2'>
                  <Text>{row.segment || '—'}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.orderCount || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatCurrency(parseDecimal(row.totalRevenue))}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatCurrency(parseDecimal(row.avgOrderValue))}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Top customers ranked by total revenue — segment labels assigned by purchase behaviour</Text>
      </div>
    </div>
  );
};
