import type { FunnelSection } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface FunnelChartProps {
  funnel: FunnelSection | undefined;
}

const FUNNEL_STEPS = [
  { key: 'sessionStartUsers', label: 'Session Start' },
  { key: 'viewItemListUsers', label: 'View Item List' },
  { key: 'selectItemUsers', label: 'Select Item' },
  { key: 'viewItemUsers', label: 'View Item' },
  { key: 'sizeSelectedUsers', label: 'Size Selected' },
  { key: 'addToCartUsers', label: 'Add to Cart' },
  { key: 'beginCheckoutUsers', label: 'Begin Checkout' },
  { key: 'addShippingInfoUsers', label: 'Add Shipping' },
  { key: 'addPaymentInfoUsers', label: 'Add Payment' },
  { key: 'purchaseUsers', label: 'Purchase' },
] as const;

function fmtCount(n: number | undefined): string {
  return n === undefined ? '—' : formatNumber(n);
}

export const FunnelChart: FC<FunnelChartProps> = ({ funnel }) => {
  if (!funnel?.aggregate) return null;

  const aggregate = funnel.aggregate;
  const maxUsers = aggregate.sessionStartUsers || 1;

  const showOrdersReconcile =
    funnel.dbOrdersCount !== undefined || aggregate.purchaseUsers !== undefined;
  const showSessionsReconcile =
    funnel.ga4Sessions !== undefined || aggregate.sessionStartUsers !== undefined;
  const caveat = funnel.caveat?.trim();

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Conversion funnel
      </Text>
      {(showOrdersReconcile || showSessionsReconcile || caveat) && (
        <div className='mb-4 space-y-1.5 border-b border-textInactiveColor/40 pb-3'>
          {showOrdersReconcile && (
            <Text className='text-[10px] text-textInactiveColor leading-snug'>
              DB Orders: {fmtCount(funnel.dbOrdersCount)} | GA4 Purchases:{' '}
              {fmtCount(aggregate.purchaseUsers)}
            </Text>
          )}
          {showSessionsReconcile && (
            <Text className='text-[10px] text-textInactiveColor leading-snug'>
              GA4 Sessions: {fmtCount(funnel.ga4Sessions)} | BQ Sessions:{' '}
              {fmtCount(aggregate.sessionStartUsers)}
            </Text>
          )}
          {caveat && (
            <Text className='text-[9px] italic text-textInactiveColor leading-snug' title={caveat}>
              {caveat}
            </Text>
          )}
        </div>
      )}
      <div className='space-y-2'>
        {FUNNEL_STEPS.map(({ key, label }) => {
          const users = aggregate[key as keyof typeof aggregate] as number | undefined;
          if (users === undefined) return null;
          
          const percentage = maxUsers > 0 ? (users / maxUsers) * 100 : 0;
          const dropOff = key !== 'sessionStartUsers' 
            ? maxUsers > 0 ? ((maxUsers - users) / maxUsers) * 100 : 0
            : 0;

          return (
            <div key={key} className='space-y-1'>
              <div className='flex justify-between items-center text-xs'>
                <Text className='uppercase'>{label}</Text>
                <div className='flex gap-3'>
                  <Text className='font-bold'>{formatNumber(users)}</Text>
                  <Text className='text-textInactiveColor'>{percentage.toFixed(1)}%</Text>
                  {dropOff > 0 && (
                    <Text className='text-error'>-{dropOff.toFixed(1)}%</Text>
                  )}
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
