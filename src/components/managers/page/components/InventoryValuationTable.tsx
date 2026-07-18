import type { InventoryValuation, InventoryValuationRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface InventoryValuationTableProps {
  inventoryValuation: InventoryValuation | undefined;
}

const Stat: FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className='space-y-1'>
    <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
      {label}
    </Text>
    <Text className='font-bold text-lg'>{value}</Text>
    {hint && (
      <Text variant='uppercase' className='text-labelColor text-textBaseSize'>
        {hint}
      </Text>
    )}
  </div>
);

const RowTable: FC<{ title: string; rows: InventoryValuationRow[] }> = ({ title, rows }) => (
  <div>
    <Text variant='uppercase' size='small' className='font-bold mb-2 block'>
      {title}
    </Text>
    <div className='overflow-x-auto'>
      <table className='w-full text-textBaseSize'>
        <thead>
          <tr className='border-b border-textInactiveColor'>
            <th className='text-left p-2'>Product</th>
            <th className='text-right p-2'>On hand</th>
            <th className='text-right p-2'>Unit cost</th>
            <th className='text-right p-2'>Value</th>
            <th className='text-right p-2'>Sold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.productId}
              className='border-b border-textInactiveColor hover:bg-bgSecondary'
            >
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
    <div className='border border-textInactiveColor p-4 space-y-6'>
      <Text variant='uppercase' className='font-bold block'>
        Inventory valuation
      </Text>

      <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        <Stat
          label='Stock value'
          value={formatCurrency(parseDecimal(iv.totalStockValue))}
          hint={`${coverage.toFixed(0)}% of units costed`}
        />
        <Stat
          label='On hand'
          value={formatNumber(iv.totalOnHandUnits ?? 0)}
          hint={`${formatNumber(iv.costedOnHandUnits ?? 0)} costed`}
        />
        <Stat
          label='Uncosted stock'
          value={formatNumber(iv.uncostedStockUnits ?? 0)}
          hint={`${formatNumber(iv.uncostedStockProducts ?? 0)} products`}
        />
        <Stat
          label='Write-offs'
          value={formatCurrency(parseDecimal(iv.writeOffsValue))}
          hint={`${formatNumber(iv.writeOffsUnits ?? 0)} units`}
        />
      </div>

      {topByValue.length > 0 && <RowTable title='Top by value' rows={topByValue.slice(0, 15)} />}
      {deadStock.length > 0 && (
        <RowTable title='Dead stock (no recent sales)' rows={deadStock.slice(0, 15)} />
      )}
    </div>
  );
};
