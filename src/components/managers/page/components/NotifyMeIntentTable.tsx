import type { NotifyMeIntentRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface NotifyMeIntentTableProps {
  notifyMeIntent: NotifyMeIntentRow[] | undefined;
}

export const NotifyMeIntentTable: FC<NotifyMeIntentTableProps> = ({ notifyMeIntent }) => {
  if (!notifyMeIntent || notifyMeIntent.length === 0) {
    return (
      <div className='border border-textInactiveColor p-4'>
        <Text variant='uppercase' className='font-bold mb-4 block'>
          Notify me intent
        </Text>
        <div className='py-8 text-center'>
          <Text className='text-textInactiveColor'>No restock demand signals in this period</Text>
        </div>
        <div className='mt-3 text-textBaseSize text-textInactiveColor space-y-1'>
          <Text>
            "Notify me" / back-in-stock intent signals — high demand items currently unavailable
          </Text>
          <Text>Snapshot for selected period — no prior-period breakdown in this view.</Text>
        </div>
      </div>
    );
  }

  const aggregated = notifyMeIntent.reduce(
    (acc, row) => {
      const key = `${row.productId}-${row.action}`;
      if (!acc[key]) {
        acc[key] = {
          productId: row.productId,
          productName: row.productName,
          action: row.action || '—',
          count: 0,
        };
      }
      acc[key].count += row.count || 0;
      return acc;
    },
    {} as Record<
      string,
      { productId?: string; productName?: string; action: string; count: number }
    >,
  );

  const rows = Object.values(aggregated)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Notify me intent
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
                  Action
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Count
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
                    maxWidth='150px'
                  />
                </td>
                <td className='p-2'>
                  <Text>{row.action}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.count)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-textBaseSize text-textInactiveColor space-y-1'>
        <Text>
          "Notify me" / back-in-stock intent signals — high demand items currently unavailable
        </Text>
        <Text>Snapshot for selected period — no prior-period breakdown in this view.</Text>
      </div>
    </div>
  );
};
