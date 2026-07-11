import type { SellThroughByDropRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface DropVerdictTableProps {
  sellThroughByDrop: SellThroughByDropRow[] | undefined;
}

// Sell-through verdict bands. A drop brand lives or dies on how much of a release clears —
// these are the coarse "reprint / hold / cut" buckets, not precise targets.
function verdict(pct: number): { label: string; cls: string } {
  if (pct >= 75) return { label: 'Strong', cls: 'text-green-600' };
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

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-1 block'>
        Drop verdict
      </Text>
      <Text className='text-xs text-textInactiveColor mb-4 block'>
        Per-release sell-through — the drop-brand KPI. Whole-drop totals, so the read is decision-grade
        even when a single day is only a handful of orders.
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Drop
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Products
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Units sold / bought
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Sell-through %
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Days to 50%
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Revenue
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Margin
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Verdict
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const pct = row.sellThroughPct || 0;
              const v = verdict(pct);
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <Text className='font-bold'>{row.collection || 'Untagged'}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.productCount || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>
                      {formatNumber(row.unitsSold || 0)}/{formatNumber(row.unitsBought || 0)}
                    </Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text className={`font-bold ${v.cls}`}>{pct.toFixed(1)}%</Text>
                  </td>
                  <td className='p-2 text-right'>
                    {row.daysTo50pct != null ? (
                      <Text>{formatNumber(row.daysTo50pct)}d</Text>
                    ) : (
                      <Text variant='inactive' title='Has not reached 50% sell-through yet'>
                        —
                      </Text>
                    )}
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatCurrency(parseDecimal(row.revenue))}</Text>
                  </td>
                  <td
                    className='p-2 text-right'
                    title={
                      row.hasCost
                        ? `Gross margin ${formatCurrency(parseDecimal(row.grossMargin))}`
                        : 'No product cost set for this drop'
                    }
                  >
                    {row.hasCost && row.grossMarginPct != null ? (
                      <Text>{row.grossMarginPct.toFixed(0)}%</Text>
                    ) : (
                      <Text variant='inactive'>N/A</Text>
                    )}
                  </td>
                  <td className='p-2 text-right'>
                    <Text variant='uppercase' className={`text-[10px] font-bold ${v.cls}`}>
                      {v.label}
                    </Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>
          Sell-through = units sold ÷ units bought. Days-to-50% is how fast the release cleared its
          first half; blank = not there yet. Strong ≥75% · OK ≥40% · Weak below.
        </Text>
        {!anyCosted && <Text>Set product costs to see per-drop margin.</Text>}
      </div>
    </div>
  );
};
