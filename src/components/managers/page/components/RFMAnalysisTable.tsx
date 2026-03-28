import type { RFMSegmentRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface RFMAnalysisTableProps {
  rfmAnalysis: RFMSegmentRow[] | undefined;
}

export const RFMAnalysisTable: FC<RFMAnalysisTableProps> = ({ rfmAnalysis }) => {
  if (!rfmAnalysis || rfmAnalysis.length === 0) return null;

  const sorted = [...rfmAnalysis]
    .sort(
      (a, b) =>
        (b.recencyScore || 0) + (b.frequencyScore || 0) + (b.monetaryScore || 0) -
        ((a.recencyScore || 0) + (a.frequencyScore || 0) + (a.monetaryScore || 0)),
    )
    .slice(0, 30);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        RFM analysis
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Email</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Label</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Recency</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Frequency</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Monetary</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2 max-w-[180px] truncate' title={row.email || ''}>
                  <Text>{row.email || '—'}</Text>
                </td>
                <td className='p-2'>
                  <Text>{row.rfmLabel || '—'}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.recencyScore || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.frequencyScore || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.monetaryScore || 0)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>
          Recency-Frequency-Monetary scoring — higher scores indicate more recent, frequent, or
          high-value customers
        </Text>
      </div>
    </div>
  );
};
