import type { CohortRetentionRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface CohortRetentionTableProps {
  cohortRetention: CohortRetentionRow[] | undefined;
}

export const CohortRetentionTable: FC<CohortRetentionTableProps> = ({ cohortRetention }) => {
  if (!cohortRetention || cohortRetention.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Cohort retention
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Cohort</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Size</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>M1</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>M2</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>M3</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>M4</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>M5</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>M6</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {cohortRetention.map((row, idx) => {
              const cohortDate = row.cohortMonth ? new Date(row.cohortMonth) : null;
              const cohortLabel = cohortDate 
                ? cohortDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
                : 'Unknown';
              
              const cohortSize = row.cohortSize || 0;
              const m1Pct = cohortSize > 0 ? ((row.m1 || 0) / cohortSize) * 100 : 0;
              const m2Pct = cohortSize > 0 ? ((row.m2 || 0) / cohortSize) * 100 : 0;
              const m3Pct = cohortSize > 0 ? ((row.m3 || 0) / cohortSize) * 100 : 0;
              const m4Pct = cohortSize > 0 ? ((row.m4 || 0) / cohortSize) * 100 : 0;
              const m5Pct = cohortSize > 0 ? ((row.m5 || 0) / cohortSize) * 100 : 0;
              const m6Pct = cohortSize > 0 ? ((row.m6 || 0) / cohortSize) * 100 : 0;

              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text>{cohortLabel}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className='font-bold'>{formatNumber(cohortSize)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{row.m1 !== undefined ? `${formatNumber(row.m1)} (${m1Pct.toFixed(0)}%)` : '-'}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{row.m2 !== undefined ? `${formatNumber(row.m2)} (${m2Pct.toFixed(0)}%)` : '-'}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{row.m3 !== undefined ? `${formatNumber(row.m3)} (${m3Pct.toFixed(0)}%)` : '-'}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{row.m4 !== undefined ? `${formatNumber(row.m4)} (${m4Pct.toFixed(0)}%)` : '-'}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{row.m5 !== undefined ? `${formatNumber(row.m5)} (${m5Pct.toFixed(0)}%)` : '-'}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{row.m6 !== undefined ? `${formatNumber(row.m6)} (${m6Pct.toFixed(0)}%)` : '-'}</Text>
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
