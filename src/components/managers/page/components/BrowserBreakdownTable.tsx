import type { BrowserBreakdownRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface BrowserBreakdownTableProps {
  browserBreakdown: BrowserBreakdownRow[] | undefined;
}

export const BrowserBreakdownTable: FC<BrowserBreakdownTableProps> = ({ browserBreakdown }) => {
  if (!browserBreakdown || browserBreakdown.length === 0) return null;

  const aggregated = browserBreakdown.reduce((acc, row) => {
    const key = row.browser || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        browser: key,
        sessions: 0,
        users: 0,
        conversions: 0,
      };
    }
    acc[key].sessions += row.sessions || 0;
    acc[key].users += row.users || 0;
    acc[key].conversions += row.conversions || 0;
    return acc;
  }, {} as Record<string, {
    browser: string;
    sessions: number;
    users: number;
    conversions: number;
  }>);

  const topBrowsers = Object.values(aggregated).sort((a, b) => b.sessions - a.sessions);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Browser breakdown
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Browser</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Sessions</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Users</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Conversions</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Conv Rate</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topBrowsers.map((row, idx) => {
              const convRate = row.sessions > 0 ? (row.conversions / row.sessions) * 100 : 0;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text className='font-bold'>{row.browser}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.sessions)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.users)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.conversions)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{convRate.toFixed(2)}%</Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
