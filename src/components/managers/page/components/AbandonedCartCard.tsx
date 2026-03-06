import type { AbandonedCartRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface AbandonedCartCardProps {
  abandonedCart: AbandonedCartRow[] | undefined;
}

export const AbandonedCartCard: FC<AbandonedCartCardProps> = ({ abandonedCart }) => {
  if (!abandonedCart || abandonedCart.length === 0) return null;

  const latest = abandonedCart[abandonedCart.length - 1];
  const cartsStarted = latest.cartsStarted || 0;
  const checkoutsStarted = latest.checkoutsStarted || 0;
  const abandonmentRate = latest.abandonmentRate || 0;
  const avgMinutesToCheckout = latest.avgMinutesToCheckout || 0;
  const avgMinutesToAbandon = latest.avgMinutesToAbandon || 0;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-3 block'>
        Abandoned cart metrics
      </Text>
      <div className='grid grid-cols-2 gap-4'>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Carts started
          </Text>
          <Text className='font-bold'>{formatNumber(cartsStarted)}</Text>
        </div>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Checkouts started
          </Text>
          <Text className='font-bold'>{formatNumber(checkoutsStarted)}</Text>
        </div>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Abandonment rate
          </Text>
          <Text className='font-bold text-error'>{(abandonmentRate * 100).toFixed(1)}%</Text>
        </div>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Avg min to checkout
          </Text>
          <Text className='font-bold'>{avgMinutesToCheckout.toFixed(1)}</Text>
        </div>
        <div className='col-span-2'>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Avg min to abandon
          </Text>
          <Text className='font-bold'>{avgMinutesToAbandon.toFixed(1)}</Text>
        </div>
      </div>
    </div>
  );
};
