import type { GetMetricsResponse, MarginByStyleRow } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { generatePath, Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { marginExtremes, valuationSummary } from '../productSignals';
import { formatCurrency, formatCurrencyCompact, parseDecimal } from '../utils';

/** Style name → tech-card link, or plain text with a reason when there is no primary style
 *  (tech_card_id = 0/undefined). Fixes the old silent dead-end on those aggregate rows. */
const StyleName: FC<{ row: MarginByStyleRow }> = ({ row }) => {
  const label = row.styleNumber || row.name || (row.techCardId ? `TC-${row.techCardId}` : '—');
  if (row.techCardId) {
    return (
      <Link
        to={generatePath(ROUTES.singleTechCard, { id: String(row.techCardId) })}
        className='truncate underline underline-offset-2 hover:text-textColor'
      >
        {label}
      </Link>
    );
  }
  return (
    <Text className='truncate' title='No tech card linked to this style'>
      {label}
    </Text>
  );
};

const MarginRow: FC<{ row: MarginByStyleRow }> = ({ row }) => (
  <li className='flex items-baseline justify-between gap-3 py-1.5'>
    <div className='min-w-0 max-w-[55%] font-bold'>
      <StyleName row={row} />
    </div>
    <Text className='text-textBaseSize text-right'>
      {formatCurrency(parseDecimal(row.grossMargin))}
      <span className='text-labelColor'> · {(row.grossMarginPct ?? 0).toFixed(0)}%</span>
    </Text>
  </li>
);

/** MONEY decision: how much cash is tied in stock (with coverage + concentration), and
 *  which styles make vs lose money after COGS. Summaries, not tables. */
export const MoneySummary: FC<{ metricsResponse: GetMetricsResponse }> = ({ metricsResponse }) => {
  const val = valuationSummary(metricsResponse.inventoryValuation);
  const { top, bottom, anyCosted } = marginExtremes(metricsResponse.marginByStyle);

  if (!val && !anyCosted) return null;

  return (
    <div className='space-y-4 border border-textInactiveColor bg-bgSecondary/20 p-4'>
      <div>
        <Text variant='uppercase' className='block font-bold'>
          Money
        </Text>
        <Text className='text-labelColor text-textBaseSize block'>
          Cash in stock &amp; which styles earn vs lose after costs.
        </Text>
      </div>

      {val && (
        <div className='grid grid-cols-3 border border-textInactiveColor bg-bgSecondary/30'>
          <div className='border-r border-textInactiveColor px-3 py-2'>
            <Text variant='uppercase' className='text-labelColor block text-[10px]'>
              Cash in stock
            </Text>
            <Text className='text-lg font-bold tabular-nums'>
              {formatCurrencyCompact(val.total)}
            </Text>
            <Text variant='uppercase' className='text-labelColor block text-[10px]'>
              at cost{val.uncostedProducts > 0 ? ` · ${val.uncostedProducts} uncosted` : ''}
            </Text>
          </div>
          <div className='border-r border-textInactiveColor px-3 py-2'>
            <Text variant='uppercase' className='text-labelColor block text-[10px]'>
              In dead stock
            </Text>
            <Text
              className={`text-lg font-bold tabular-nums ${val.deadValue > 0 ? 'text-error' : ''}`}
            >
              {formatCurrency(val.deadValue)}
            </Text>
            <Text variant='uppercase' className='text-labelColor block text-[10px]'>
              {val.total > 0
                ? `${((val.deadValue / val.total) * 100).toFixed(0)}% of it`
                : 'unsold'}
            </Text>
          </div>
          <div className='px-3 py-2'>
            <Text variant='uppercase' className='text-labelColor block text-[10px]'>
              Concentration
            </Text>
            <Text className='text-lg font-bold tabular-nums'>
              {val.top3Share > 0 ? `${val.top3Share.toFixed(0)}%` : '—'}
            </Text>
            <Text variant='uppercase' className='text-labelColor block text-[10px]'>
              top 3 products
            </Text>
          </div>
        </div>
      )}

      {anyCosted && (
        <div className='grid gap-4 md:grid-cols-2'>
          <div>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize mb-1 block'>
              Highest margin €
            </Text>
            <ul>
              {top.map((r, i) => (
                <MarginRow key={`t-${r.techCardId ?? r.styleNumber ?? i}`} row={r} />
              ))}
            </ul>
          </div>
          {bottom.length > 0 && (
            <div>
              <Text variant='uppercase' className='text-labelColor text-textBaseSize mb-1 block'>
                Lowest margin €
              </Text>
              <ul>
                {bottom.map((r, i) => (
                  <MarginRow key={`b-${r.techCardId ?? r.styleNumber ?? i}`} row={r} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
