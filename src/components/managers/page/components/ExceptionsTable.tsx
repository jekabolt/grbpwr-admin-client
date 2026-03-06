import type { ExceptionMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface ExceptionsTableProps {
  exceptions: ExceptionMetric[] | undefined;
}

export const ExceptionsTable: FC<ExceptionsTableProps> = ({ exceptions }) => {
  if (!exceptions || exceptions.length === 0) return null;

  const aggregated = exceptions.reduce((acc, metric) => {
    const key = `${metric.pagePath}-${metric.description}`;
    if (!acc[key]) {
      acc[key] = {
        pagePath: metric.pagePath,
        description: metric.description,
        exceptionCount: 0,
      };
    }
    acc[key].exceptionCount += metric.exceptionCount || 0;
    return acc;
  }, {} as Record<string, {
    pagePath: string | undefined;
    description: string | undefined;
    exceptionCount: number;
  }>);

  const topExceptions = Object.values(aggregated).sort((a, b) => b.exceptionCount - a.exceptionCount).slice(0, 15);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        JavaScript exceptions
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Page</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Description</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Count</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topExceptions.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <Text className='truncate max-w-[150px] font-mono text-[10px]' title={row.pagePath || ''}>
                    {row.pagePath || '-'}
                  </Text>
                </td>
                <td className='p-2'>
                  <Text className='truncate max-w-[200px]' title={row.description || ''}>
                    {row.description || '-'}
                  </Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold text-error'>{formatNumber(row.exceptionCount)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Critical errors - investigate and fix immediately</Text>
      </div>
    </div>
  );
};
