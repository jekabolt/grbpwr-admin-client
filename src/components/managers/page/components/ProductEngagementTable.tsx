import type { ProductEngagementMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

interface ProductEngagementTableProps {
  productEngagement: ProductEngagementMetric[] | undefined;
}

export const ProductEngagementTable: FC<ProductEngagementTableProps> = ({ productEngagement }) => {
  if (!productEngagement || productEngagement.length === 0) return null;

  const topEngaged = productEngagement.slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Product engagement
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Image Views</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Zoom Events</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Time on Page (s)</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Image Swipes</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Size Guide</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Details Expanded</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Notify Me</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topEngaged.map((row, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                <td className='p-2'>
                  <Text className='truncate max-w-[150px]' title={row.productName || ''}>
                    {row.productName || `#${row.productId}`}
                  </Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.imageViews || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.zoomEvents || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{row.timeOnPageSeconds != null ? row.timeOnPageSeconds.toFixed(1) : '-'}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.imageSwipes || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.sizeGuideClicks || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.expandedDetails || 0)}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text>{formatNumber(row.notifyMeIntent || 0)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
