import type { TimeOnPageRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface TimeOnPageTableProps {
  timeOnPage: TimeOnPageRow[] | undefined;
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toFixed(0)}s`;
}

export const TimeOnPageTable: FC<TimeOnPageTableProps> = ({ timeOnPage }) => {
  if (!timeOnPage || timeOnPage.length === 0) return null;

  const aggregated = timeOnPage.reduce(
    (acc, row) => {
      const path = row.pagePath || 'unknown';
      if (!acc[path]) acc[path] = { totalVisible: 0, totalTotal: 0, totalScore: 0, views: 0 };
      acc[path].totalVisible += (row.avgVisibleTimeSeconds || 0) * (row.pageViews || 1);
      acc[path].totalTotal += (row.avgTotalTimeSeconds || 0) * (row.pageViews || 1);
      acc[path].totalScore += (row.avgEngagementScore || 0) * (row.pageViews || 1);
      acc[path].views += row.pageViews || 0;
      return acc;
    },
    {} as Record<string, { totalVisible: number; totalTotal: number; totalScore: number; views: number }>,
  );

  const rows = Object.entries(aggregated)
    .map(([path, d]) => ({
      path,
      avgVisible: d.views > 0 ? d.totalVisible / d.views : 0,
      avgTotal: d.views > 0 ? d.totalTotal / d.views : 0,
      avgScore: d.views > 0 ? d.totalScore / d.views : 0,
      pageViews: d.views,
    }))
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Time on page
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Page path</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Visible time</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Total time</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Engagement</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Views</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2 max-w-[200px]'>
                  <Text className='font-mono text-[10px] truncate block' title={row.path}>
                    {row.path}
                  </Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatSeconds(row.avgVisible)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatSeconds(row.avgTotal)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{row.avgScore.toFixed(2)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.pageViews)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Average time users spend on each page — higher engagement score = more interaction</Text>
      </div>
    </div>
  );
};
