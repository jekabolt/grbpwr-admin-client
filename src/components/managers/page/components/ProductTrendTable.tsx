import type { ProductTrendRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface ProductTrendTableProps {
  productTrend: ProductTrendRow[] | undefined;
}

function currentRevenue(p: ProductTrendRow): number {
  return parseDecimal(p.currentRevenue);
}

function previousRevenue(p: ProductTrendRow): number {
  return parseDecimal(p.previousRevenue);
}

const ProductTrendRowsTable: FC<{ rows: ProductTrendRow[] }> = ({ rows }) => (
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
              Current
            </Text>
          </th>
          <th className='text-right p-2'>
            <Text variant='uppercase' className='text-[10px]'>
              Previous
            </Text>
          </th>
          <th className='text-right p-2'>
            <Text variant='uppercase' className='text-[10px]'>
              Change
            </Text>
          </th>
          <th className='text-right p-2'>
            <Text variant='uppercase' className='text-[10px]'>
              Units
            </Text>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const changePct = row.changePct || 0;
          return (
            <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
              <td className='p-2'>
                <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='150px' />
              </td>
              <td className='p-2 text-right'>
                <Text>{formatCurrency(parseDecimal(row.currentRevenue))}</Text>
              </td>
              <td className='p-2 text-right'>
                <Text>{formatCurrency(parseDecimal(row.previousRevenue))}</Text>
              </td>
              <td className='p-2 text-right'>
                <Text className='text-error'>{changePct.toFixed(1)}%</Text>
              </td>
              <td className='p-2 text-right'>
                <Text>
                  {formatNumber(row.previousUnits || 0)} → {formatNumber(row.currentUnits || 0)}
                </Text>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const ProductTrendTable: FC<ProductTrendTableProps> = ({ productTrend }) => {
  if (!productTrend || productTrend.length === 0) return null;

  const declining = productTrend
    .filter((p) => (p.changePct || 0) < 0 && currentRevenue(p) > 0)
    .sort((a, b) => (a.changePct || 0) - (b.changePct || 0))
    .slice(0, 10);

  const noSales = productTrend
    .filter(
      (p) =>
        currentRevenue(p) <= 0 && (previousRevenue(p) > 0 || (p.previousUnits || 0) > 0),
    )
    .sort((a, b) => previousRevenue(b) - previousRevenue(a))
    .slice(0, 10);

  if (declining.length === 0 && noSales.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      {declining.length > 0 && (
        <div className={noSales.length > 0 ? 'mb-6' : ''}>
          <Text variant='uppercase' className='font-bold mb-4 block'>
            Declining
          </Text>
          <ProductTrendRowsTable rows={declining} />
        </div>
      )}
      {noSales.length > 0 && (
        <div>
          <Text variant='uppercase' className='font-bold mb-4 block'>
            No sales
          </Text>
          <ProductTrendRowsTable rows={noSales} />
        </div>
      )}
    </div>
  );
};
