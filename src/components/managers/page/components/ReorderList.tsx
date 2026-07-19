import type { GetMetricsResponse } from 'api/proto-http/admin';
import { FC, ReactNode } from 'react';
import Text from 'ui/components/text';
import { buildReorderGroups } from '../productSignals';
import { formatCurrency, formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';
import { ProductSection } from './ProductSection';

// Link only numeric DB colorway ids; OOS / notify-me rows carry BigQuery string ids that
// aren't colorway ids, so linking them would land on a blank product page.
const Name: FC<{ id?: number | string; name: string }> = ({ id, name }) =>
  typeof id === 'number' && id > 0 ? (
    <ProductNameLink productId={id} productName={name} maxWidth='100%' />
  ) : (
    <Text className='truncate'>{name}</Text>
  );

const GroupHead: FC<{ title: string; total: ReactNode; crit?: boolean }> = ({
  title,
  total,
  crit,
}) => (
  <div
    className={`mb-1.5 flex items-baseline justify-between border-b border-textInactiveColor pb-1 text-textBaseSize uppercase ${crit ? 'text-error' : 'text-labelColor'}`}
  >
    <span>{title}</span>
    <span className='text-textColor font-bold tabular-nums'>{total}</span>
  </div>
);

const Buy: FC<{ children: ReactNode }> = ({ children }) => (
  <span className='shrink-0 justify-self-end border border-textColor px-2 py-0.5 text-textBaseSize font-bold whitespace-nowrap uppercase'>
    {children}
  </span>
);

/** REORDER decision, triaged by urgency: losing sales now (OOS, with lost-€ bars) →
 *  about to stock out (below reorder point) → demand waiting (notify-me). */
export const ReorderList: FC<{ metricsResponse: GetMetricsResponse }> = ({ metricsResponse }) => {
  const g = buildReorderGroups(metricsResponse);
  if (g.lineCount === 0) return null;
  const waiting = g.demand.reduce((s, x) => s + x.count, 0);

  return (
    <ProductSection
      title='Reorder'
      subtitle='— what to restock, how much, why'
      verdict={
        <>
          Restock {g.lineCount} line{g.lineCount === 1 ? '' : 's'}
          {g.lostSum > 0 && ` — about ${formatCurrency(g.lostSum)} of demand is going unsold`}.
        </>
      }
    >
      {g.oos.length > 0 && (
        <div className='mb-3'>
          <GroupHead
            crit
            title='Losing sales now · out of stock'
            total={formatCurrency(g.lostSum)}
          />
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
          <GroupHead
            title='About to stock out · below reorder point'
            total={`${g.reorder.length} SKU${g.reorder.length === 1 ? '' : 's'}`}
          />
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
          <GroupHead
            title='Demand waiting · notify-me'
            total={`${formatNumber(waiting)} ${waiting === 1 ? 'person' : 'people'}`}
          />
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
    </ProductSection>
  );
};
