import type { NotifyMeIntentRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface NotifyMeIntentTableProps {
  notifyMeIntent: NotifyMeIntentRow[] | undefined;
}

export const NotifyMeIntentTable: FC<NotifyMeIntentTableProps> = ({ notifyMeIntent }) => {
  if (!notifyMeIntent || notifyMeIntent.length === 0) return null;

  const aggregated = notifyMeIntent.reduce(
    (acc, row) => {
      const key = `${row.productId}-${row.action}`;
      if (!acc[key]) {
        acc[key] = {
          productId: row.productId,
          productName: row.productName,
          action: row.action || '—',
          count: 0,
          totalRate: 0,
          entries: 0,
        };
      }
      acc[key].count += row.count || 0;
      acc[key].totalRate += row.conversionRate || 0;
      acc[key].entries += 1;
      return acc;
    },
    {} as Record<string, { productId?: string; productName?: string; action: string; count: number; totalRate: number; entries: number }>,
  );

  const rows = Object.values(aggregated)
    .map((r) => ({
      ...r,
      avgConversionRate: r.entries > 0 ? r.totalRate / r.entries : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Notify me intent
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Action</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Count</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Conv. rate</Text>
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
                    maxWidth='150px'
                  />
                </td>
                <td className='p-2'>
                  <Text>{row.action}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.count)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{row.avgConversionRate.toFixed(1)}%</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>
          "Notify me" / back-in-stock intent signals — high demand items currently unavailable
        </Text>
      </div>
    </div>
  );
};
