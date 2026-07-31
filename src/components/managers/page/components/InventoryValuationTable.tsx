import type { InventoryValuation, InventoryValuationRow } from 'api/proto-http/admin';
import { FC } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface InventoryValuationTableProps {
  inventoryValuation: InventoryValuation | undefined;
}

const RowTable: FC<{ title: string; rows: InventoryValuationRow[] }> = ({ title, rows }) => (
  <div>
    <GroupLabel flush>{title}</GroupLabel>
    <div className='overflow-x-auto'>
      <table className='w-full text-textBaseSize'>
        <thead>
          <tr className='border-b border-hairline'>
            <th className='text-left p-2'>Product</th>
            <th className='text-right p-2'>On hand</th>
            <th className='text-right p-2'>Unit cost</th>
            <th className='text-right p-2'>Value</th>
            <th className='text-right p-2'>Sold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId} className='border-b border-hairline hover:bg-bgSecondary'>
              <td className='p-2'>
                <ProductNameLink
                  productId={r.productId}
                  productName={r.productName}
                  maxWidth='200px'
                />
              </td>
              <td className='p-2 text-right'>{formatNumber(r.onHand ?? 0)}</td>
              <td className='p-2 text-right'>{formatCurrency(parseDecimal(r.unitCost))}</td>
              <td className='p-2 text-right'>{formatCurrency(parseDecimal(r.value))}</td>
              <td className='p-2 text-right'>{formatNumber(r.soldUnits ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// Capital frozen in stock + dead stock + write-offs. Costing-gated: without costing:read the
// backend omits it, so a null object hides the whole report.
export const InventoryValuationTable: FC<InventoryValuationTableProps> = ({
  inventoryValuation,
}) => {
  if (!inventoryValuation) return null;
  const iv = inventoryValuation;
  const hasValue = !!iv.totalStockValue?.value;
  const topByValue = iv.topByValue ?? [];
  const deadStock = iv.deadStock ?? [];
  if (!hasValue && topByValue.length === 0 && deadStock.length === 0) return null;

  const coverage = iv.coveragePct ?? 0;

  return (
    <div className='space-y-6'>
      <GroupLabel flush>Inventory valuation</GroupLabel>

      <StatGrid min={130}>
        <Stat
          label='Stock value'
          value={formatCurrency(parseDecimal(iv.totalStockValue))}
          sub={`${coverage.toFixed(0)}% of units costed`}
        />
        <Stat
          label='On hand'
          value={formatNumber(iv.totalOnHandUnits ?? 0)}
          sub={`${formatNumber(iv.costedOnHandUnits ?? 0)} costed`}
        />
        <Stat
          label='Uncosted stock'
          value={formatNumber(iv.uncostedStockUnits ?? 0)}
          sub={`${formatNumber(iv.uncostedStockProducts ?? 0)} products`}
        />
        <Stat
          label='Write-offs'
          value={formatCurrency(parseDecimal(iv.writeOffsValue))}
          sub={`${formatNumber(iv.writeOffsUnits ?? 0)} units`}
        />
      </StatGrid>

      {topByValue.length > 0 && <RowTable title='Top by value' rows={topByValue.slice(0, 15)} />}
      {deadStock.length > 0 && (
        <RowTable title='Dead stock (no recent sales)' rows={deadStock.slice(0, 15)} />
      )}
    </div>
  );
};
