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

  const aggregated = oosImpact.reduce((acc, metric) => {
    const key = `${metric.productId}-${metric.sizeId}`;
    if (!acc[key]) {
      acc[key] = {
        productId: metric.productId,
        productName: metric.productName,
        sizeId: metric.sizeId,
        sizeName: metric.sizeName,
        productPrice: metric.productPrice,
        currency: metric.currency,
        clickCount: 0,
        estimatedLostRevenue: 0,
      };
    }
    acc[key].clickCount += metric.clickCount || 0;
    acc[key].estimatedLostRevenue += parseDecimal(metric.estimatedLostRevenue);
    return acc;
  }, {} as Record<string, {
    productId: string | undefined;
    productName: string | undefined;
    sizeId: number | undefined;
    sizeName: string | undefined;
    productPrice: any;
    currency: string | undefined;
    clickCount: number;
    estimatedLostRevenue: number;
  }>);

  const topOOS = Object.values(aggregated)
    .sort((a, b) => b.estimatedLostRevenue - a.estimatedLostRevenue)
    .slice(0, 20);

  if (topOOS.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Out-of-stock impact
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Size</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>OOS Clicks</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Price</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Est. Lost Revenue</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topOOS.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='120px' />
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
                <td className='p-2 text-right'>
                  <Text className='text-error font-bold'>{formatCurrency(row.estimatedLostRevenue)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Estimated lost revenue from out-of-stock clicks - prioritize restocking</Text>
      </div>
    </div>
  );
};
