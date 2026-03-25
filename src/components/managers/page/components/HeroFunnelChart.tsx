import type { HeroFunnelSection } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface HeroFunnelChartProps {
  heroFunnel: HeroFunnelSection | undefined;
}

const STEPS: { key: 'heroClickUsers' | 'viewItemUsers' | 'purchaseUsers'; label: string }[] = [
  { key: 'heroClickUsers', label: 'Hero Click' },
  { key: 'viewItemUsers', label: 'View Item' },
  { key: 'purchaseUsers', label: 'Purchase' },
];

export const HeroFunnelChart: FC<HeroFunnelChartProps> = ({ heroFunnel }) => {
  const agg = heroFunnel?.aggregate;
  if (!agg) return null;

  const totals = {
    heroClickUsers: agg.heroClickUsers ?? 0,
    viewItemUsers: agg.viewItemUsers ?? 0,
    purchaseUsers: agg.purchaseUsers ?? 0,
  };

  const maxUsers = totals.heroClickUsers || 1;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Hero funnel
      </Text>
      <div className='space-y-2'>
        {STEPS.map(({ key, label }) => {
          const users = totals[key];
          const percentage = maxUsers > 0 ? (users / maxUsers) * 100 : 0;
          const dropOff =
            key !== 'heroClickUsers' && maxUsers > 0
              ? ((maxUsers - users) / maxUsers) * 100
              : 0;

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
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Hero banner click → product view → purchase conversion path</Text>
      </div>
    </div>
  );
};
