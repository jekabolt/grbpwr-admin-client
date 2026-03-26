import type { UserJourneyMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber, humanizeGa4JourneyPath } from '../utils';

interface UserJourneysTableProps {
  userJourneys: UserJourneyMetric[] | undefined;
}

export const UserJourneysTable: FC<UserJourneysTableProps> = ({ userJourneys }) => {
  if (!userJourneys || userJourneys.length === 0) return null;

  const aggregated = userJourneys.reduce(
    (acc, row) => {
      const path = row.journeyPath || 'unknown';
      if (!acc[path]) acc[path] = { sessionCount: 0, conversions: 0 };
      acc[path].sessionCount += row.sessionCount || 0;
      acc[path].conversions += row.conversions || 0;
      return acc;
    },
    {} as Record<string, { sessionCount: number; conversions: number }>,
  );

  const rows = Object.entries(aggregated)
    .map(([path, data]) => ({
      path,
      ...data,
      conversionRate: data.sessionCount > 0 ? (data.conversions / data.sessionCount) * 100 : 0,
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        How customers browse
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Steps</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Sessions</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Conversions</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Conv. rate</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2 max-w-[280px]'>
                  <Text className='text-[10px] leading-snug block' title={row.path}>
                    {humanizeGa4JourneyPath(row.path)}
                  </Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.sessionCount)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.conversions)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{row.conversionRate.toFixed(1)}%</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Most common navigation paths and their conversion rates</Text>
      </div>
    </div>
  );
};
