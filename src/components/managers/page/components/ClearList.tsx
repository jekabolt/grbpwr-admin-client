import type { GetMetricsResponse } from 'api/proto-http/admin';
import { FC } from 'react';
import { Section } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { buildClearSignals, clearBuckets } from '../productSignals';
import { formatCurrency, formatNumber } from '../utils';
import { ActionList } from './ActionList';

/** CLEAR / CUT decision: a buckets summary (how much / how many) above the ranked list of
 *  the biggest frozen-cash offenders. Null when nothing is stuck. */
export const ClearList: FC<{ metricsResponse: GetMetricsResponse }> = ({ metricsResponse }) => {
  const { items, total } = buildClearSignals(metricsResponse, 4);
  const b = clearBuckets(metricsResponse);
  const nothing =
    items.length === 0 && b.dead.count === 0 && b.slowCount === 0 && b.weakDrops.length === 0;
  if (nothing) return null;

  return (
    <Section title='Clear / cut' question='— where cash is frozen in stock that is not selling'>
      <Text className='block font-bold leading-snug'>
        {b.dead.value > 0
          ? `${formatCurrency(b.dead.value)} tied up in stock with no recent sales — mark down or pull.`
          : 'Stock that is not moving — mark down or pull to release the cash.'}
      </Text>
      <StatGrid min={130} className='mb-3'>
        <Stat
          label='Dead · >90d no sale'
          value={formatCurrency(b.dead.value)}
          sub={`${b.dead.count} product${b.dead.count === 1 ? '' : 's'}`}
          tone='down'
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
      </StatGrid>

      {items.length > 0 && <ActionList items={items} total={total} />}
    </Section>
  );
};
