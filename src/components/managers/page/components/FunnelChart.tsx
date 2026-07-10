import type { FunnelSection } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface FunnelChartProps {
  funnel: FunnelSection | undefined;
  compareEnabled?: boolean;
}

// Collapsed to 3 trustworthy steps — at boutique traffic the 10-step GA4 funnel is
// single-digit noise per micro-step. View → Add-to-Cart → Purchase is enough to see leaks.
const FUNNEL_STEPS = [
  { key: 'viewItemUsers', label: 'View Item' },
  { key: 'addToCartUsers', label: 'Add to Cart' },
  { key: 'purchaseUsers', label: 'Purchase' },
] as const;

export const FunnelChart: FC<FunnelChartProps> = ({ funnel, compareEnabled = false }) => {
  if (!funnel?.aggregate) return null;

  const aggregate = funnel.aggregate;
  const maxUsers = aggregate.viewItemUsers || 1;
  const caveat = funnel.caveat?.trim();

  return (
    <div className='border border-textInactiveColor p-4'>
      <div className='mb-4'>
        <Text variant='uppercase' className='font-bold block'>
          Conversion funnel
        </Text>
        {compareEnabled && (
          <Text className='text-[10px] text-textInactiveColor mt-1 block'>
            Prior period comparison is not available for this funnel yet.
          </Text>
        )}
      </div>
      {caveat && (
        <div className='mb-4 border-b border-textInactiveColor/40 pb-3'>
          <Text className='text-[9px] italic text-textInactiveColor leading-snug' title={caveat}>
            {caveat}
          </Text>
        </div>
      )}
      <div className='space-y-2'>
        {FUNNEL_STEPS.map(({ key, label }, idx) => {
          const users = aggregate[key as keyof typeof aggregate] as number | undefined;
          if (users === undefined) return null;

          const percentage = maxUsers > 0 ? (users / maxUsers) * 100 : 0;
          // First step is the base (100%); drop-off is relative to it for later steps.
          const dropOff = idx > 0 && maxUsers > 0 ? ((maxUsers - users) / maxUsers) * 100 : 0;

          return (
            <div key={key} className='space-y-1'>
              <div className='flex justify-between items-center text-xs'>
                <Text className='uppercase'>{label}</Text>
                <div className='flex gap-3'>
                  <Text className='font-bold'>{formatNumber(users)}</Text>
                  <Text className='text-textInactiveColor'>{percentage.toFixed(1)}%</Text>
                  {dropOff > 0 && <Text className='text-error'>-{dropOff.toFixed(1)}%</Text>}
                </div>
              </div>
              <div className='h-6 bg-bgSecondary relative overflow-hidden'>
                <div
                  className='h-full bg-textColor transition-all'
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
