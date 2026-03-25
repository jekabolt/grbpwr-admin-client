import type { NewsletterMetricRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface NewsletterCardProps {
  newsletter: NewsletterMetricRow[] | undefined;
}

type Totals = { signupCount: number; uniqueUsers: number };

function rowDateMs(date: string | undefined): number {
  if (!date) return -Infinity;
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms : -Infinity;
}

type NewsletterDisplay = {
  totals: Totals;
  latestDayLabel: string | null;
};

function pickNewsletterDisplay(rows: NewsletterMetricRow[]): NewsletterDisplay {
  const totals = rows.reduce<Totals>(
    (acc, row) => ({
      signupCount: acc.signupCount + (row.signupCount ?? 0),
      uniqueUsers: acc.uniqueUsers + (row.uniqueUsers ?? 0),
    }),
    { signupCount: 0, uniqueUsers: 0 },
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

export const NewsletterCard: FC<NewsletterCardProps> = ({ newsletter }) => {
  if (!newsletter || newsletter.length === 0) return null;

  const { totals, latestDayLabel } = pickNewsletterDisplay(newsletter);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-3 block'>
        Newsletter signups
      </Text>
      <div className='grid grid-cols-2 gap-4'>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Total signups
          </Text>
          <Text className='font-bold text-2xl'>{formatNumber(totals.signupCount)}</Text>
        </div>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Unique users
          </Text>
          <Text className='font-bold text-2xl'>{formatNumber(totals.uniqueUsers)}</Text>
        </div>
      </div>
      {latestDayLabel && (
        <div className='mt-3 text-xs text-textInactiveColor'>
          <Text className='text-warning'>{latestDayLabel}</Text>
        </div>
      )}
    </div>
  );
};
