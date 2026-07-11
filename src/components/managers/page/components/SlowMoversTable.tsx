import type { SlowMoverRow } from 'api/proto-http/admin';
import { FC, useMemo, useState } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface SlowMoversTableProps {
  slowMovers: SlowMoverRow[] | undefined;
}

function isNeverSoldGhost(row: SlowMoverRow): boolean {
  const hasLastSale = Boolean(row.lastSaleDate);
  const units = row.unitsSold ?? 0;
  return !hasLastSale && units === 0;
}

export const SlowMoversTable: FC<SlowMoversTableProps> = ({ slowMovers }) => {
  const [showNoSalesProducts, setShowNoSalesProducts] = useState(false);

  if (!slowMovers || slowMovers.length === 0) return null;

  const topSlowMovers = useMemo(() => {
    const filtered = showNoSalesProducts
      ? slowMovers
      : slowMovers.filter((row) => !isNeverSoldGhost(row));
    return filtered.slice(0, 20);
  }, [slowMovers, showNoSalesProducts]);

  const hiddenGhostCount = useMemo(() => slowMovers.filter(isNeverSoldGhost).length, [slowMovers]);
  // Margin tells you how much room there is to mark a slow mover down before it stops paying.
  const anyCosted = useMemo(() => topSlowMovers.some((r) => r.hasCost), [topSlowMovers]);

  return (
    <div className='border border-textInactiveColor p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2 mb-4'>
        <Text variant='uppercase' className='font-bold block'>
          Slow movers
        </Text>
        {hiddenGhostCount > 0 && (
          <button
            type='button'
            onClick={() => setShowNoSalesProducts((v) => !v)}
            className='text-textBaseSize underline underline-offset-2 text-textInactiveColor hover:text-textColor'
          >
            {showNoSalesProducts
              ? 'Hide products with no sales'
              : `Show products with no sales (${hiddenGhostCount})`}
          </button>
        )}
      </div>
      {topSlowMovers.length === 0 ? (
        <p className='text-textBaseSize text-textInactiveColor'>
          No slow movers in this merchandising view (all rows are products with no recorded sales).
          Turn on &quot;Show products with no sales&quot; to include them.
        </p>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full text-textBaseSize'>
            <thead>
              <tr className='border-b border-textInactiveColor'>
                <th className='text-left p-2'>
                  <Text variant='uppercase' className='text-textBaseSize'>
                    Product
                  </Text>
                </th>
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-textBaseSize'>
                    Revenue
                  </Text>
                </th>
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-textBaseSize'>
                    Margin
                  </Text>
                </th>
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-textBaseSize'>
                    Units Sold
                  </Text>
                </th>
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-textBaseSize'>
                    Days in Stock
                  </Text>
                </th>
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-textBaseSize'>
                    Last Sale
                  </Text>
                </th>
              </tr>
            </thead>
            <tbody>
              {topSlowMovers.map((row, idx) => {
                const lastSaleDate = row.lastSaleDate ? new Date(row.lastSaleDate) : null;
                const lastSaleStr = lastSaleDate
                  ? lastSaleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'Never';
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
                      <Text>{formatCurrency(parseDecimal(row.revenue))}</Text>
                    </td>
                    <td
                      className='p-2 text-right'
                      title={
                        row.hasCost
                          ? `Gross margin ${formatCurrency(parseDecimal(row.grossMargin))}`
                          : 'No product cost set'
                      }
                    >
                      {row.hasCost && row.grossMarginPct != null ? (
                        <Text>{row.grossMarginPct.toFixed(0)}%</Text>
                      ) : (
                        <Text variant='inactive'>N/A</Text>
                      )}
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatNumber(row.unitsSold || 0)}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      {/* Age, not a fault — every product accrues days in stock. The signal is
                          low units/revenue, not the age itself, so don't paint it red. */}
                      <Text>{(row.daysInStock || 0).toFixed(0)}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{lastSaleStr}</Text>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className='mt-3 text-textBaseSize text-textInactiveColor space-y-1'>
        <Text>
          Products with low sales velocity — consider promotions or markdown. Margin is the room to
          discount before a unit stops paying for itself.
        </Text>
        {!anyCosted && <Text>Set product costs to see margin (markdown headroom) here.</Text>}
        {!showNoSalesProducts && hiddenGhostCount > 0 && (
          <Text>Default view excludes products with no sales (e.g. test or seed SKUs).</Text>
        )}
      </div>
    </div>
  );
};
