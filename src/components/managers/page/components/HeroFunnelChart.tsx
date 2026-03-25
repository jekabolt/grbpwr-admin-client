import type { HeroFunnelMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface HeroFunnelChartProps {
  heroFunnel: HeroFunnelMetric[] | undefined;
}

type Totals = { heroClickUsers: number; viewItemUsers: number; purchaseUsers: number };

const STEPS: { key: keyof Totals; label: string }[] = [
  { key: 'heroClickUsers', label: 'Hero Click' },
  { key: 'viewItemUsers', label: 'View Item' },
  { key: 'purchaseUsers', label: 'Purchase' },
];

function rowDateMs(date: string | undefined): number {
  if (!date) return -Infinity;
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms : -Infinity;
}

type HeroFunnelDisplay = {
  totals: Totals;
  latestDayLabel: string | null;
};

function pickHeroFunnelDisplay(rows: HeroFunnelMetric[]): HeroFunnelDisplay {
  const totals = rows.reduce<Totals>(
    (acc, row) => ({
      heroClickUsers: acc.heroClickUsers + (row.heroClickUsers ?? 0),
      viewItemUsers: acc.viewItemUsers + (row.viewItemUsers ?? 0),
      purchaseUsers: acc.purchaseUsers + (row.purchaseUsers ?? 0),
    }),
    { heroClickUsers: 0, viewItemUsers: 0, purchaseUsers: 0 },
  );

  const dated = rows.filter((r) => rowDateMs(r.date) > -Infinity);
  const showWarning = dated.length > 1;

  return {
    totals,
    latestDayLabel: showWarning
      ? 'Note: Daily unique users summed — may over-count repeat visitors across days'
      : null,
  };
}

export const HeroFunnelChart: FC<HeroFunnelChartProps> = ({ heroFunnel }) => {
  if (!heroFunnel || heroFunnel.length === 0) return null;

  const { totals, latestDayLabel } = pickHeroFunnelDisplay(heroFunnel);

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
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>Hero banner click → product view → purchase conversion path</Text>
        {latestDayLabel && <Text className='text-warning'>{latestDayLabel}</Text>}
      </div>
    </div>
  );
};
