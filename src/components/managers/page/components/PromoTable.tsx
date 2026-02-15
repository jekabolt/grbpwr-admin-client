import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, parseDecimal } from '../utils';

interface PromoTableProps {
  metrics: BusinessMetrics | undefined;
}

export const PromoTable: FC<PromoTableProps> = ({ metrics }) => {
  const promos = metrics?.revenueByPromo ?? [];
  if (promos.length === 0) return null;

  return (
    <div className='space-y-4'>
      <Text variant='uppercase' className='font-bold'>
        Revenue by promo
      </Text>
      <div className='border border-textInactiveColor overflow-x-auto'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2 uppercase'>Code</th>
              <th className='text-right p-2 uppercase'>Orders</th>
              <th className='text-right p-2 uppercase'>Revenue</th>
              <th className='text-right p-2 uppercase'>Avg discount</th>
            </tr>
          </thead>
          <tbody>
            {promos.map((p, i) => (
              <tr key={i} className='border-b border-textInactiveColor last:border-0'>
                <td className='p-2 font-mono'>{p.promoCode ?? '-'}</td>
                <td className='p-2 text-right'>{p.ordersCount ?? 0}</td>
                <td className='p-2 text-right'>{formatCurrency(parseDecimal(p.revenue))}</td>
                <td className='p-2 text-right'>{formatCurrency(parseDecimal(p.avgDiscount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
