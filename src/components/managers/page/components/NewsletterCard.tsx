import type { NewsletterMetricRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface NewsletterCardProps {
  newsletter: NewsletterMetricRow[] | undefined;
}

export const NewsletterCard: FC<NewsletterCardProps> = ({ newsletter }) => {
  if (!newsletter || newsletter.length === 0) return null;

  const totals = newsletter.reduce(
    (acc, row) => ({
      signupCount: acc.signupCount + (row.signupCount || 0),
      uniqueUsers: acc.uniqueUsers + (row.uniqueUsers || 0),
    }),
    { signupCount: 0, uniqueUsers: 0 }
  );

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
    </div>
  );
};
