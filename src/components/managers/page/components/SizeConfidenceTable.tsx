import type { SizeConfidenceMetric } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface SizeConfidenceTableProps {
  sizeConfidence: SizeConfidenceMetric[] | undefined;
}

export const SizeConfidenceTable: FC<SizeConfidenceTableProps> = ({ sizeConfidence }) => {
  if (!sizeConfidence || sizeConfidence.length === 0) return null;

  const aggregated = sizeConfidence.reduce((acc, metric) => {
    const key = metric.productId ?? 'unknown';
    if (!acc[key]) {
      acc[key] = {
        productId: metric.productId,
        productName: metric.productName,
        sizeGuideViews: 0,
        sizeSelections: 0,
      };
    } else if (metric.productName && !acc[key].productName) {
      acc[key].productName = metric.productName;
    }
    acc[key].sizeGuideViews += metric.sizeGuideViews || 0;
    acc[key].sizeSelections += metric.sizeSelections || 0;
    return acc;
  }, {} as Record<string, { productId: string | undefined; productName: string | undefined; sizeGuideViews: number; sizeSelections: number }>);

  const data = Object.values(aggregated).slice(0, 20);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Size guide engagement
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Size Guide Views</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Size Selections</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Guide/Selection Ratio</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const ratio =
                row.sizeSelections === 0 && row.sizeGuideViews === 0
                  ? null // CASE 3: No data
                  : row.sizeSelections > 0 && row.sizeGuideViews === 0
                    ? null // CASE 2: Guide not used (distinct signal)
                    : row.sizeSelections > 0
                      ? row.sizeGuideViews / row.sizeSelections // CASE 1: Normal ratio
                      : null; // Edge case: guide views but no selections
              const isHighUncertainty = ratio !== null && ratio > 0.5;
              const isGuideNotUsed = row.sizeSelections > 0 && row.sizeGuideViews === 0;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='150px' />
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.sizeGuideViews)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.sizeSelections)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    {ratio === null ? (
                      isGuideNotUsed ? (
                        <Text className='text-warning'>—</Text>
                      ) : (
                        <Text className='text-textInactiveColor'>—</Text>
                      )
                    ) : (
                      <Text className={isHighUncertainty ? 'text-error' : ''}>{ratio.toFixed(2)}</Text>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>
          High ratios (&gt;0.5) indicate customer uncertainty. Amber &quot;—&quot; means guide not consulted
          (sizes selected without viewing the guide). Gray &quot;—&quot; means no ratio (no activity or guide
          views without selections).
        </Text>
      </div>
    </div>
  );
};
