import type { NotFoundMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface NotFoundTableProps {
  notFound: NotFoundMetric[] | undefined;
}

export const NotFoundTable: FC<NotFoundTableProps> = ({ notFound }) => {
  if (!notFound || notFound.length === 0) return null;

  const aggregated = notFound.reduce((acc, metric) => {
    const key = metric.pagePath || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        pagePath: key,
        hitCount: 0,
      };
    }
    acc[key].hitCount += metric.hitCount || 0;
    return acc;
  }, {} as Record<string, { pagePath: string; hitCount: number }>);

  const top404s = Object.values(aggregated).sort((a, b) => b.hitCount - a.hitCount).slice(0, 15);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        404 pages
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Page Path</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Hit Count</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {top404s.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <Text className='font-mono text-[10px]' title={row.pagePath}>
                    {row.pagePath}
                  </Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold text-error'>{formatNumber(row.hitCount)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Fix broken links or add redirects for high-traffic 404s</Text>
      </div>
    </div>
  );
};
