import type { OOSImpactMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface OOSImpactTableProps {
  oosImpact: OOSImpactMetric[] | undefined;
}

export const OOSImpactTable: FC<OOSImpactTableProps> = ({ oosImpact }) => {
  if (!oosImpact || oosImpact.length === 0) return null;

  const aggregated = oosImpact.reduce(
    (acc, metric) => {
      const key = `${metric.productId}-${metric.sizeId}`;
      if (!acc[key]) {
        acc[key] = {
          productId: metric.productId,
          productName: metric.productName,
          sizeId: metric.sizeId,
          sizeName: metric.sizeName,
          productPrice: metric.productPrice,
          clickCount: 0,
        };
      }
      acc[key].clickCount += metric.clickCount || 0;
      return acc;
    },
    {} as Record<
      string,
      {
        productId: string | undefined;
        productName: string | undefined;
        sizeId: number | undefined;
        sizeName: string | undefined;
        productPrice: any;
        clickCount: number;
      }
    >,
  );

  // Rank by demand (clicks on an out-of-stock size), not a fabricated clicks×price € figure —
  // an OOS click is intent, not a guaranteed lost sale, so multiplying by price invents precision.
  const topOOS = Object.values(aggregated)
    .sort((a, b) => b.clickCount - a.clickCount)
    .slice(0, 20);

  if (topOOS.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Out-of-stock demand
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Product
                </Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Size
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  OOS Clicks
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-textBaseSize'>
                  Price
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topOOS.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='120px'
                  />
                </td>
                <td className='p-2'>
                  <Text>{row.sizeName || `Size #${row.sizeId}`}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.clickCount)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatCurrency(parseDecimal(row.productPrice))}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-textBaseSize text-labelColor'>
        <Text>Clicks on out-of-stock sizes — most-wanted first. Restock priority.</Text>
      </div>
    </div>
  );
};
