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
          Money — cash in stock &amp; margin by style
        </Text>
        <Text className='text-labelColor text-textBaseSize block'>
          What the warehouse is worth and which styles actually earn after costs.
        </Text>
      </div>

      {val && (
        <div className='space-y-1'>
          <Text className='text-2xl font-bold tabular-nums leading-none'>
            {formatCurrencyCompact(val.total)}{' '}
            <span className='text-labelColor text-textBaseSize font-normal uppercase'>
              frozen in stock
            </span>
          </Text>
          <Text className='text-labelColor text-textBaseSize block'>
            valued over {val.coveragePct.toFixed(0)}% of units
            {val.uncostedProducts > 0 && ` · ${val.uncostedProducts} products have no cost set`}
          </Text>
          {val.top3Share > 0 && (
            <Text className='text-labelColor text-textBaseSize block'>
              top 3 = {val.top3Share.toFixed(0)}% of the value
              {val.top3Names.length > 0 && ` (${val.top3Names.join(', ')})`}
            </Text>
          )}
          {val.deadValue > 0 && (
            <Text className='text-labelColor text-textBaseSize block'>
              {formatCurrency(val.deadValue)} of it is dead stock (unsold in the window)
            </Text>
          )}
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
