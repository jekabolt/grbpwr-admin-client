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

  const hiddenGhostCount = useMemo(
    () => slowMovers.filter(isNeverSoldGhost).length,
    [slowMovers],
  );

  return (
    <div className='border border-textInactiveColor p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2 mb-4'>
        <Text variant='uppercase' className='font-bold block'>
          Products with no traction
        </Text>
        {hiddenGhostCount > 0 && (
          <button
            type='button'
            onClick={() => setShowNoSalesProducts((v) => !v)}
            className='text-xs underline underline-offset-2 text-textInactiveColor hover:text-textColor'
          >
            {showNoSalesProducts ? 'Hide products with no sales' : `Show products with no sales (${hiddenGhostCount})`}
          </button>
        )}
      </div>
      {topSlowMovers.length === 0 ? (
        <p className='text-xs text-textInactiveColor'>
          No slow movers in this merchandising view (all rows are products with no recorded sales). Turn on
          &quot;Show products with no sales&quot; to include them.
        </p>
      ) : (
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
                    Revenue
                  </Text>
                </th>
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-[10px]'>
                    Units Sold
                  </Text>
                </th>
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-[10px]'>
                    Days in Stock
                  </Text>
                </th>
                <th className='text-right p-2'>
                  <Text variant='uppercase' className='text-[10px]'>
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
                      <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='150px' />
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatCurrency(parseDecimal(row.revenue))}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      <Text>{formatNumber(row.unitsSold || 0)}</Text>
                    </td>
                    <td className='p-2 text-right'>
                      <Text className='text-error'>{(row.daysInStock || 0).toFixed(0)}</Text>
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
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>Products with low sales velocity — consider promotions or markdown.</Text>
        {!showNoSalesProducts && hiddenGhostCount > 0 && (
          <Text>Default view excludes products with no sales (e.g. test or seed SKUs).</Text>
        )}
      </div>
    </div>
  );
};
