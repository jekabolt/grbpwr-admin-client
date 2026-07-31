import type { GetMetricsResponse, MarginByStyleRow } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { generatePath, Link } from 'react-router-dom';
import { Section } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { marginExtremes, valuationSummary } from '../productSignals';
import { formatCurrency, formatCurrencyCompact, parseDecimal } from '../utils';
import { ActPill, ColHead, VerdictColumns, VerdictList, VerdictRow } from './VerdictList';

/** Style name → tech-card link (bold 12px, matches stub `.nm`), or plain text with a reason when
 *  there is no primary style (tech_card_id = 0/undefined). */
const StyleName: FC<{ row: MarginByStyleRow }> = ({ row }) => {
  const label = row.styleNumber || row.name || (row.techCardId ? `TC-${row.techCardId}` : '—');
  if (row.techCardId) {
    return (
      <Link
        to={generatePath(ROUTES.singleTechCard, { id: String(row.techCardId) })}
        className='underline-offset-2 hover:underline'
      >
        {label}
      </Link>
    );
  }
  return <span title='No tech card linked to this style'>{label}</span>;
};

/** MONEY decision: how much cash is tied in stock (with coverage + concentration), and which
 *  styles make vs lose money after COGS. Buckets + two verdict lists, matching products-final. */
export const MoneySummary: FC<{ metricsResponse: GetMetricsResponse }> = ({ metricsResponse }) => {
  const val = valuationSummary(metricsResponse.inventoryValuation);
  const { top, bottom, anyCosted } = marginExtremes(metricsResponse.marginByStyle);

  if (!val && !anyCosted) return null;

  const verdict =
    val && val.uncostedProducts > 0
      ? `${val.uncostedProducts} product${val.uncostedProducts === 1 ? '' : 's'} have no cost — the margins below cover only the costed ones.`
      : val && val.deadValue > 0
        ? `${formatCurrencyCompact(val.total)} tied up in stock; ${formatCurrency(val.deadValue)} of it is dead stock.`
        : 'Which styles make vs lose money after costs.';

  return (
    <Section title='Money' question='— cash in stock & which styles make vs lose margin'>
      <Text className='block font-bold leading-snug'>{verdict}</Text>
      <div className='space-y-3'>
        {val && (
          <StatGrid min={130}>
            <Stat
              label='Cash in stock'
              value={formatCurrencyCompact(val.total)}
              sub={`at cost${val.uncostedProducts > 0 ? ` · ${val.uncostedProducts} uncosted` : ''}`}
            />
            <Stat
              label='In dead stock'
              value={formatCurrency(val.deadValue)}
              sub={
                val.total > 0
                  ? `${((val.deadValue / val.total) * 100).toFixed(0)}% of it`
                  : 'unsold'
              }
              tone={val.deadValue > 0 ? 'down' : 'default'}
            />
            <Stat
              label='Concentration'
              value={val.top3Share > 0 ? `${val.top3Share.toFixed(0)}%` : '—'}
              sub='top 3 products'
            />
          </StatGrid>
        )}

        {anyCosted && (
          <VerdictColumns>
            <div>
              <ColHead>Best margin €</ColHead>
              <VerdictList>
                {top.map((r, i) => (
                  <VerdictRow
                    key={`t-${r.techCardId ?? r.styleNumber ?? i}`}
                    name={<StyleName row={r} />}
                    act={
                      <ActPill tone='good'>{formatCurrency(parseDecimal(r.grossMargin))}</ActPill>
                    }
                  />
                ))}
              </VerdictList>
            </div>
            {bottom.length > 0 && (
              <div>
                <ColHead crit>Losing / thin margin</ColHead>
                <VerdictList>
                  {bottom.map((r, i) => {
                    const m = parseDecimal(r.grossMargin);
                    const pct = r.grossMarginPct ?? 0;
                    const crit = m < 0 || pct < 10;
                    const label = m < 0 ? `−${formatCurrency(Math.abs(m))}` : `${pct.toFixed(0)}%`;
                    return (
                      <VerdictRow
                        key={`b-${r.techCardId ?? r.styleNumber ?? i}`}
                        name={<StyleName row={r} />}
                        act={<ActPill tone={crit ? 'crit' : 'neutral'}>{label}</ActPill>}
                      />
                    );
                  })}
                </VerdictList>
              </div>
            )}
          </VerdictColumns>
        )}
      </div>
    </Section>
  );
};
