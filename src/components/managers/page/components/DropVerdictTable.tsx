import type { SellThroughByDropRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductSection } from './ProductSection';

interface DropVerdictTableProps {
  sellThroughByDrop: SellThroughByDropRow[] | undefined;
}

// Sell-through verdict bands. A drop brand lives or dies on how much of a release clears —
// these are the coarse "reprint / hold / cut" buckets, not precise targets.
function verdict(pct: number): { label: string; cls: string } {
  if (pct >= 75) return { label: 'Strong', cls: 'text-success' };
  if (pct >= 40) return { label: 'OK', cls: 'text-textColor' };
  return { label: 'Weak', cls: 'text-warning' };
}

export const DropVerdictTable: FC<DropVerdictTableProps> = ({ sellThroughByDrop }) => {
  if (!sellThroughByDrop || sellThroughByDrop.length === 0) return null;

  // Biggest drops first — that's where the money and the reprint decision live.
  const rows = [...sellThroughByDrop].sort(
    (a, b) => parseDecimal(b.revenue) - parseDecimal(a.revenue),
  );
  const anyCosted = rows.some((r) => r.hasCost);
  const strong = rows.filter((r) => (r.sellThroughPct ?? 0) >= 75).length;
  const weak = rows.filter((r) => (r.sellThroughPct ?? 0) < 40 && (r.unitsBought ?? 0) > 0).length;
  const verdictText =
    strong || weak
      ? `${strong ? `Reprint ${strong} strong drop${strong === 1 ? '' : 's'}` : ''}${strong && weak ? '; ' : ''}${weak ? `cut or discount ${weak} weak` : ''}.`
      : 'Per-release sell-through — how much of each drop cleared.';

  return (
    <ProductSection
      title='Drops'
      subtitle='— which releases to reprint, hold, or kill'
      verdict={verdictText}
    >
      <Text className='text-textBaseSize text-labelColor mb-3 block'>
        Whole-drop sell-through, so the read is decision-grade even when a single day is only a
        handful of orders.
      </Text>
      <div
        className='grid gap-3'
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}
      >
        {rows.map((row, idx) => {
          const pct = row.sellThroughPct || 0;
          const v = verdict(pct);
          // Card = the decision verb (reprint / hold / cut), a sell-through bar coloured by band,
          // then the supporting numbers. Matches the approved "drop cards" pick.
          const action = pct >= 75 ? 'Reprint' : pct >= 40 ? 'Hold' : 'Cut';
          const barCls = pct >= 75 ? 'bg-success' : pct >= 40 ? 'bg-textColor' : 'bg-warning';
          return (
            <div key={idx} className='border border-textInactiveColor p-3'>
              <div className='flex items-baseline justify-between gap-2'>
                <Text className='truncate font-bold'>{row.collection || 'Untagged'}</Text>
                <Text variant='uppercase' className={`text-textBaseSize font-bold ${v.cls}`}>
                  {action}
                </Text>
              </div>
              <div className='my-2 h-2 bg-bgSecondary'>
                <div className={`h-2 ${barCls}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <Text className='text-labelColor text-textBaseSize block'>
                {pct.toFixed(0)}% sold · {formatCurrency(parseDecimal(row.revenue))}
                {row.daysTo50pct != null ? ` · ${formatNumber(row.daysTo50pct)}d to 50%` : ''}
              </Text>
              {row.hasCost && row.grossMarginPct != null && (
                <Text className='text-labelColor text-textBaseSize block'>
                  {row.grossMarginPct.toFixed(0)}% margin
                </Text>
              )}
            </div>
          );
        })}
      </div>
      <div className='mt-3 text-textBaseSize text-labelColor'>
        <Text>
          Sell-through = units sold ÷ units bought. Strong ≥75% (reprint) · OK ≥40% (hold) · Weak
          below (cut).{!anyCosted && ' Set product costs to see per-drop margin.'}
        </Text>
      </div>
    </ProductSection>
  );
};
