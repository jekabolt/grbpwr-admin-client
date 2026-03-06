import type { CheckoutTimingMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface CheckoutTimingsCardProps {
  checkoutTimings: CheckoutTimingMetric[] | undefined;
}

export const CheckoutTimingsCard: FC<CheckoutTimingsCardProps> = ({ checkoutTimings }) => {
  if (!checkoutTimings || checkoutTimings.length === 0) return null;

  const latest = checkoutTimings[checkoutTimings.length - 1];
  const avgCheckoutSeconds = latest.avgCheckoutSeconds || 0;
  const medianCheckoutSeconds = latest.medianCheckoutSeconds || 0;
  const sessionCount = latest.sessionCount || 0;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-3 block'>
        Checkout timings
      </Text>
      <div className='grid grid-cols-3 gap-4'>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Avg (seconds)
          </Text>
          <Text className='font-bold'>{avgCheckoutSeconds.toFixed(1)}s</Text>
        </div>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Median (seconds)
          </Text>
          <Text className='font-bold'>{medianCheckoutSeconds.toFixed(1)}s</Text>
        </div>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Sessions
          </Text>
          <Text className='font-bold'>{formatNumber(sessionCount)}</Text>
        </div>
      </div>
      {avgCheckoutSeconds > 300 && (
        <div className='mt-3 pt-3 border-t border-textInactiveColor'>
          <Text className='text-error text-xs'>
            Warning: Average checkout time exceeds 5 minutes
          </Text>
        </div>
      )}
    </div>
  );
};
