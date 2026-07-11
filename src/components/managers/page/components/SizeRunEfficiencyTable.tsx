import type { SizeRunEfficiencyRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface SizeRunEfficiencyTableProps {
  sizeRunEfficiency: SizeRunEfficiencyRow[] | undefined;
}

// A product needs a real size run before "how many sizes sold" says anything — 1 of 2 sizes is
// 50% on no information.
const MIN_SIZES = 3;

export const SizeRunEfficiencyTable: FC<SizeRunEfficiencyTableProps> = ({ sizeRunEfficiency }) => {
  if (!sizeRunEfficiency || sizeRunEfficiency.length === 0) return null;

  // Backend now ships unit buy/sell quantities → real sell-through (units sold ÷ units bought),
  // not just the coarse "how many distinct sizes sold at least once" coverage proxy.
  const hasUnitData = sizeRunEfficiency.some((r) => (r.unitsBought ?? 0) > 0);

  const sorted = [...sizeRunEfficiency]
    .filter((r) => (r.totalSizes || 0) >= MIN_SIZES)
    // Worst sell-through first — those are the overbought runs to act on.
    .sort((a, b) =>
      hasUnitData
        ? (a.sellThroughPct || 0) - (b.sellThroughPct || 0)
        : (a.efficiencyPct || 0) - (b.efficiencyPct || 0),
    )
    .slice(0, 20);

  if (sorted.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Which sizes are selling
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Product
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Sizes sold
                </Text>
              </th>
              {hasUnitData && (
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-[10px]'>
                    Units sold / bought
                  </Text>
                </th>
              )}
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  {hasUnitData ? 'Sell-through %' : 'Size coverage %'}
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const totalSizes = row.totalSizes || 0;
              const bought = row.unitsBought ?? 0;
              // Prefer true unit sell-through; fall back to the size-coverage proxy when a row
              // has no buy quantity (e.g. stock predates cost/receiving data).
              const showTrue = hasUnitData && bought > 0;
              const pct = showTrue ? row.sellThroughPct || 0 : row.efficiencyPct || 0;
              // Low sell-through on a wide run = real overbuy; single-digit runs are too small to judge.
              const isPoor = pct < 50 && totalSizes >= 4;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <ProductNameLink
                      productId={row.productId}
                      productName={row.productName}
                      maxWidth='150px'
                    />
                  </td>
                  <td className='p-2 text-right'>
                    <Text>
                      {formatNumber(row.soldThroughSizes || 0)}/{formatNumber(totalSizes)}
                    </Text>
                  </td>
                  {hasUnitData && (
                    <td className='p-2 text-right'>
                      {bought > 0 ? (
                        <Text>
                          {formatNumber(row.unitsSold ?? 0)}/{formatNumber(bought)}
                        </Text>
                      ) : (
                        <Text variant='inactive'>—</Text>
                      )}
                    </td>
                  )}
                  <td className='p-2 text-right'>
                    <Text className={isPoor ? 'text-error font-bold' : 'font-bold'}>
                      {pct.toFixed(1)}%{!showTrue && hasUnitData ? '*' : ''}
                    </Text>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        {hasUnitData ? (
          <>
            <Text>
              True sell-through = units sold ÷ units bought. Low on a wide size run = likely
              overbought — the sizes to cut next buy.
            </Text>
            {sorted.some((r) => (r.unitsBought ?? 0) === 0) && (
              <Text>* Size-coverage proxy shown where unit buy quantities aren&apos;t recorded.</Text>
            )}
          </>
        ) : (
          <Text>
            Share of distinct sizes that sold at least once (of {MIN_SIZES}+ sizes offered) — a
            coarse proxy while unit buy quantities aren&apos;t recorded yet.
          </Text>
        )}
      </div>
    </div>
  );
};
