import type { PaymentRecoveryMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface PaymentRecoveryCardProps {
  paymentRecovery: PaymentRecoveryMetric[] | undefined;
}

type Totals = { failedUsers: number; recoveredUsers: number };

function rowDateMs(date: string | undefined): number {
  if (!date) return -Infinity;
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms : -Infinity;
}

type PaymentRecoveryDisplay = {
  totals: Totals;
  latestDayLabel: string | null;
};

function pickPaymentRecoveryDisplay(rows: PaymentRecoveryMetric[]): PaymentRecoveryDisplay {
  const totals = rows.reduce<Totals>(
    (acc, row) => ({
      failedUsers: acc.failedUsers + (row.failedUsers ?? 0),
      recoveredUsers: acc.recoveredUsers + (row.recoveredUsers ?? 0),
    }),
    { failedUsers: 0, recoveredUsers: 0 },
  );

  const dated = rows.filter((r) => rowDateMs(r.date) > -Infinity);
  const showWarning = dated.length > 1;

  return {
    totals,
    latestDayLabel: showWarning
      ? 'Note: Daily unique users summed — may over-count repeat visitors across days'
      : null,
  };
}

export const PaymentRecoveryCard: FC<PaymentRecoveryCardProps> = ({ paymentRecovery }) => {
  if (!paymentRecovery || paymentRecovery.length === 0) return null;

  const { totals, latestDayLabel } = pickPaymentRecoveryDisplay(paymentRecovery);

  const recoveryRate =
    totals.failedUsers > 0 ? (totals.recoveredUsers / totals.failedUsers) * 100 : 0;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-3 block'>
        Payment recovery
      </Text>
      <div className='grid grid-cols-3 gap-4'>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Failed users
          </Text>
          <Text className='font-bold text-2xl'>{formatNumber(totals.failedUsers)}</Text>
        </div>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Recovered users
          </Text>
          <Text className='font-bold text-2xl'>{formatNumber(totals.recoveredUsers)}</Text>
        </div>
        <div>
          <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
            Recovery rate
          </Text>
          <Text className='font-bold text-2xl'>{recoveryRate.toFixed(1)}%</Text>
        </div>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>Users who failed payment and subsequently completed a purchase</Text>
        {latestDayLabel && <Text className='text-warning'>{latestDayLabel}</Text>}
      </div>
    </div>
  );
};
