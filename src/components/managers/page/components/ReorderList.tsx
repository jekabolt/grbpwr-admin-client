import type { GetMetricsResponse } from 'api/proto-http/admin';
import { FC, ReactNode } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { buildReorderGroups } from '../productSignals';
import { formatCurrency, formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

// Link only numeric DB colorway ids; OOS / notify-me rows carry BigQuery string ids that
// aren't colorway ids, so linking them would land on a blank product page.
const Name: FC<{ id?: number | string; name: string }> = ({ id, name }) =>
  typeof id === 'number' && id > 0 ? (
    <ProductNameLink productId={id} productName={name} maxWidth='100%' />
  ) : (
    <Text className='truncate'>{name}</Text>
  );

const Buy: FC<{ children: ReactNode }> = ({ children }) => (
  <Text
    component='span'
    size='control'
    variant='uppercase'
    tracking='label'
    className='shrink-0 justify-self-end border border-textColor px-2 py-0.5 font-bold whitespace-nowrap'
  >
    {children}
  </Text>
);

/** REORDER decision, triaged by urgency: losing sales now (OOS, with lost-€ bars) →
 *  about to stock out (below reorder point) → demand waiting (notify-me). */
export const ReorderList: FC<{ metricsResponse: GetMetricsResponse }> = ({ metricsResponse }) => {
  const g = buildReorderGroups(metricsResponse);
  if (g.lineCount === 0) return null;
  const waiting = g.demand.reduce((s, x) => s + x.count, 0);

  return (
    <Section title='Reorder' question='— what to restock, how much, why'>
      <Text className='block font-bold leading-snug'>
        Restock {g.lineCount} line{g.lineCount === 1 ? '' : 's'}
        {g.lostSum > 0 && ` — about ${formatCurrency(g.lostSum)} of demand is going unsold`}.
      </Text>
      {g.oos.length > 0 && (
        <div className='mb-3'>
          <GroupLabel
            flush
            className='text-error'
            action={
              <Text component='span' size='micro' className='font-bold'>
                {formatCurrency(g.lostSum)}
              </Text>
            }
          >
            Losing sales now · out of stock
          </GroupLabel>
          <ul className='space-y-2'>
            {g.oos.map((r) => (
              <li key={r.key} className='grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1'>
                <div className='min-w-0 font-bold'>
                  <Name id={r.productId} name={r.name} />
                </div>
                <Buy>Reorder</Buy>
                <div className='col-span-2 grid grid-cols-[1fr_auto] items-center gap-2'>
                  <span className='h-2 bg-bgSecondary'>
                    <span
                      className='block h-2 bg-error'
                      style={{ width: `${g.maxLost > 0 ? (r.lost / g.maxLost) * 100 : 0}%` }}
                    />
                  </span>
                  <span className='text-labelColor text-textBaseSize text-right tabular-nums'>
                    {formatCurrency(r.lost)} lost
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {g.reorder.length > 0 && (
        <div className='mb-3'>
          <GroupLabel
            flush
            action={
              <Text component='span' size='micro' className='font-bold'>
                {g.reorder.length} SKU{g.reorder.length === 1 ? '' : 's'}
              </Text>
            }
          >
            About to stock out · below reorder point
          </GroupLabel>
          <ul className='space-y-1'>
            {g.reorder.map((r) => (
              <li key={r.key} className='grid grid-cols-[1fr_auto] items-baseline gap-3'>
                <div className='min-w-0 font-bold'>
                  <Name id={r.productId} name={r.name} />
                  <span className='text-labelColor font-normal'>
                    {' '}
                    · {formatNumber(r.left)} left
                  </span>
                </div>
                <Buy>{r.buy > 0 ? `Buy ~${formatNumber(r.buy)}` : 'Buy'}</Buy>
              </li>
            ))}
          </ul>
        </div>
      )}

      {g.demand.length > 0 && (
        <div>
          <GroupLabel
            flush
            action={
              <Text component='span' size='micro' className='font-bold'>
                {formatNumber(waiting)} {waiting === 1 ? 'person' : 'people'}
              </Text>
            }
          >
            Demand waiting · notify-me
          </GroupLabel>
          <ul className='space-y-1'>
            {g.demand.map((r) => (
              <li key={r.key} className='grid grid-cols-[1fr_auto] items-baseline gap-3'>
                <div className='min-w-0 font-bold'>
                  <Name id={r.productId} name={r.name} />
                  <span className='text-labelColor font-normal'>
                    {' '}
                    · {formatNumber(r.count)} waiting
                  </span>
                </div>
                <Buy>Restock</Buy>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
};
