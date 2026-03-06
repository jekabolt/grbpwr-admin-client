import type { FormErrorMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface FormErrorsTableProps {
  formErrors: FormErrorMetric[] | undefined;
}

export const FormErrorsTable: FC<FormErrorsTableProps> = ({ formErrors }) => {
  if (!formErrors || formErrors.length === 0) return null;

  const aggregated = formErrors.reduce((acc, metric) => {
    const key = metric.fieldName || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        fieldName: key,
        errorCount: 0,
      };
    }
    acc[key].errorCount += metric.errorCount || 0;
    return acc;
  }, {} as Record<string, { fieldName: string; errorCount: number }>);

  const topErrors = Object.values(aggregated).sort((a, b) => b.errorCount - a.errorCount).slice(0, 15);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Form errors
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Field Name</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Error Count</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topErrors.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <Text className='font-mono'>{row.fieldName}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold text-error'>{formatNumber(row.errorCount)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Form validation errors - investigate UX improvements</Text>
      </div>
    </div>
  );
};
