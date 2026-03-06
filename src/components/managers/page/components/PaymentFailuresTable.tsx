import type { PaymentFailureMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface PaymentFailuresTableProps {
  paymentFailures: PaymentFailureMetric[] | undefined;
}

export const PaymentFailuresTable: FC<PaymentFailuresTableProps> = ({ paymentFailures }) => {
  if (!paymentFailures || paymentFailures.length === 0) return null;

  const aggregated = paymentFailures.reduce((acc, metric) => {
    const key = `${metric.errorCode}-${metric.paymentType}`;
    if (!acc[key]) {
      acc[key] = {
        errorCode: metric.errorCode,
        paymentType: metric.paymentType,
        failureCount: 0,
        totalFailedValue: 0,
      };
    }
    acc[key].failureCount += metric.failureCount || 0;
    acc[key].totalFailedValue += parseDecimal(metric.totalFailedValue);
    return acc;
  }, {} as Record<string, {
    errorCode: string | undefined;
    paymentType: string | undefined;
    failureCount: number;
    totalFailedValue: number;
  }>);

  const topFailures = Object.values(aggregated).sort((a, b) => b.totalFailedValue - a.totalFailedValue).slice(0, 15);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Payment failures
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Error Code</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Payment Type</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Failures</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Failed Value</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topFailures.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <Text className='font-mono text-[10px]'>{row.errorCode || '-'}</Text>
                </td>
                <td className='p-2'>
                  <Text>{row.paymentType || '-'}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.failureCount)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='text-error font-bold'>{formatCurrency(row.totalFailedValue)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Lost revenue due to payment failures - coordinate with payment provider</Text>
      </div>
    </div>
  );
};
