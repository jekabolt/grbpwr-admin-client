import type { InventoryHealthRow } from 'api/proto-http/admin';
import { FC, useMemo, useState } from 'react';
import Text from 'ui/components/text';
import { DAYS_ON_HAND_NO_SALES_SENTINEL, formatDaysOnHand, formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface InventoryHealthTableProps {
  inventoryHealth: InventoryHealthRow[] | undefined;
}

export const InventoryHealthTable: FC<InventoryHealthTableProps> = ({ inventoryHealth }) => {
  const [includeNoSalesInPeriod, setIncludeNoSalesInPeriod] = useState(false);

  const { atRisk, sentinelAtRiskCount, anyOver60 } = useMemo(() => {
    if (!inventoryHealth || inventoryHealth.length === 0) {
      return { atRisk: [] as InventoryHealthRow[], sentinelAtRiskCount: 0, anyOver60: false };
    }
    const base = inventoryHealth.filter((row) => (row.daysOnHand ?? 0) > 60);
    const anyOver60 = base.length > 0;
    const sentinelAtRiskCount = base.filter((row) => (row.daysOnHand ?? 0) >= DAYS_ON_HAND_NO_SALES_SENTINEL)
      .length;
    const filtered = includeNoSalesInPeriod
      ? base
      : base.filter((row) => (row.daysOnHand ?? 0) < DAYS_ON_HAND_NO_SALES_SENTINEL);
    return { atRisk: filtered.slice(0, 20), sentinelAtRiskCount, anyOver60 };
  }, [inventoryHealth, includeNoSalesInPeriod]);

  if (!inventoryHealth || inventoryHealth.length === 0) return null;
  if (!anyOver60) return null;

  if (atRisk.length === 0) {
    return (
      <div className='border border-textInactiveColor p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2 mb-4'>
          <Text variant='uppercase' className='font-bold block'>
            Inventory health (at risk)
          </Text>
          {sentinelAtRiskCount > 0 && (
            <button
              type='button'
              onClick={() => setIncludeNoSalesInPeriod((v) => !v)}
              className='text-xs underline underline-offset-2 text-textInactiveColor hover:text-textColor'
            >
              {includeNoSalesInPeriod
                ? 'Hide no-sales-in-period SKUs'
                : `Include no-sales-in-period SKUs (${sentinelAtRiskCount})`}
            </button>
          )}
        </div>
        <p className='text-xs text-textInactiveColor'>
          No rows in this view — all at-risk SKUs have no sales in the period (infinite days on hand). Use
          &quot;Include no-sales-in-period&quot; to list them.
        </p>
      </div>
    );
  }

  return (
    <div className='border border-textInactiveColor p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2 mb-4'>
        <Text variant='uppercase' className='font-bold block'>
          Inventory health (at risk)
        </Text>
        {sentinelAtRiskCount > 0 && (
          <button
            type='button'
            onClick={() => setIncludeNoSalesInPeriod((v) => !v)}
            className='text-xs underline underline-offset-2 text-textInactiveColor hover:text-textColor'
          >
            {includeNoSalesInPeriod
              ? 'Hide no-sales-in-period SKUs'
              : `Include no-sales-in-period SKUs (${sentinelAtRiskCount})`}
          </button>
        )}
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Product
                </Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Size
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Qty
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Avg Daily Sales
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Days on Hand
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {atRisk.map((row, idx) => {
              const daysOnHand = row.daysOnHand ?? 0;
              const isVeryHigh = daysOnHand > 90 && daysOnHand < DAYS_ON_HAND_NO_SALES_SENTINEL;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='120px' />
                  </td>
                  <td className='p-2'>
                    <Text>{row.sizeName || `Size #${row.sizeId}`}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.quantity || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{(row.avgDailySales || 0).toFixed(2)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text
                      className={isVeryHigh ? 'text-error font-bold' : ''}
                      title={daysOnHand >= DAYS_ON_HAND_NO_SALES_SENTINEL ? '∞' : undefined}
                    >
                      {formatDaysOnHand(row.daysOnHand)}
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
          Items with &gt;60 days on hand. &gt;90 days highlighted (consider discount/bundling). Default view
          hides SKUs with no sales in the period (shown as &quot;No sales&quot; / infinite days on hand).
        </Text>
      </div>
    </div>
  );
};
