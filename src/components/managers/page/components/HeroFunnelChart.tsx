<<<<<<< HEAD
import type { HeroFunnelSection } from 'api/proto-http/admin';
=======
import type { HeroFunnelMetric } from 'api/proto-http/admin';
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface HeroFunnelChartProps {
<<<<<<< HEAD
  heroFunnel: HeroFunnelSection | undefined;
}

const STEPS: { key: 'heroClickUsers' | 'viewItemUsers' | 'purchaseUsers'; label: string }[] = [
=======
  heroFunnel: HeroFunnelMetric[] | undefined;
}

const STEPS: { key: keyof Totals; label: string }[] = [
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964
  { key: 'heroClickUsers', label: 'Hero Click' },
  { key: 'viewItemUsers', label: 'View Item' },
  { key: 'purchaseUsers', label: 'Purchase' },
];

<<<<<<< HEAD
export const HeroFunnelChart: FC<HeroFunnelChartProps> = ({ heroFunnel }) => {
  const agg = heroFunnel?.aggregate;
  if (!agg) return null;

  const totals = {
    heroClickUsers: agg.heroClickUsers ?? 0,
    viewItemUsers: agg.viewItemUsers ?? 0,
    purchaseUsers: agg.purchaseUsers ?? 0,
  };
=======
type Totals = { heroClickUsers: number; viewItemUsers: number; purchaseUsers: number };

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
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964

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
<<<<<<< HEAD
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Hero banner click → product view → purchase conversion path</Text>
=======
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>Hero banner click → product view → purchase conversion path</Text>
        {latestDayLabel && <Text className='text-warning'>{latestDayLabel}</Text>}
>>>>>>> 6f967a554fd452e6126117481150c4091aa2b964
      </div>
    </div>
  );
};
