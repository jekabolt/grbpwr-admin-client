import type { GetMetricsResponse } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { buildClearSignals, clearBuckets } from '../productSignals';
import { formatCurrency, formatNumber } from '../utils';
import { ActionList } from './ActionList';

const Stat: FC<{ label: string; value: string; sub: string; crit?: boolean }> = ({
  label,
  value,
  sub,
  crit,
}) => (
  <div className='border-r border-textInactiveColor px-3 py-2 last:border-r-0'>
    <Text variant='uppercase' className='text-labelColor block text-[10px]'>
      {label}
    </Text>
    <Text className={`text-lg font-bold tabular-nums ${crit ? 'text-error' : ''}`}>{value}</Text>
    <Text variant='uppercase' className='text-labelColor block text-[10px]'>
      {sub}
    </Text>
  </div>
);

/** CLEAR / CUT decision: a buckets summary (how much / how many) above the ranked list of
 *  the biggest frozen-cash offenders. Null when nothing is stuck. */
export const ClearList: FC<{ metricsResponse: GetMetricsResponse }> = ({ metricsResponse }) => {
  const { items, total } = buildClearSignals(metricsResponse, 4);
  const b = clearBuckets(metricsResponse);
  const nothing =
    items.length === 0 && b.dead.count === 0 && b.slowCount === 0 && b.weakDrops.length === 0;
  if (nothing) return null;

  return (
    <div className='border border-textInactiveColor bg-bgSecondary/20 p-4'>
      <Text variant='uppercase' className='block font-bold'>
        Clear / cut — free up cash
      </Text>
      <Text className='text-labelColor text-textBaseSize mb-3 block'>
        {b.dead.value > 0
          ? `${formatCurrency(b.dead.value)} tied up in stock with no recent sales — mark down or pull.`
          : 'Stock that is not moving — mark down or pull to release the cash.'}
      </Text>

      <div className='mb-3 grid grid-cols-3 border border-textInactiveColor bg-bgSecondary/30'>
        <Stat
          label='Dead · >90d no sale'
          value={formatCurrency(b.dead.value)}
          sub={`${b.dead.count} product${b.dead.count === 1 ? '' : 's'}`}
          crit
        />
        <Stat
          label='Slow · low velocity'
          value={formatNumber(b.slowCount)}
          sub={`product${b.slowCount === 1 ? '' : 's'}`}
        />
        <Stat
          label='Weak drops'
          value={formatNumber(b.weakDrops.length)}
          sub={b.weakDrops[0] ? `${b.weakDrops[0].name} ${b.weakDrops[0].pct.toFixed(0)}%` : '—'}
        />
      </div>

      {items.length > 0 && <ActionList items={items} total={total} />}
    </div>
  );
};
