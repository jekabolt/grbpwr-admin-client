import type { ImageSwipeRow } from 'api/proto-http/admin';
import { FC, useMemo, useState } from 'react';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface ImageSwipesTableProps {
  imageSwipes: ImageSwipeRow[] | undefined;
}

const SWIPE_OUTLIER_MIN_ABSOLUTE = 100_000;
const SWIPE_OUTLIER_RATIO = 10;
const SWIPE_OUTLIER_SECOND_FLOOR = 10_000;

function detectLikelySwipeOutlier(sortedByCountDesc: { swipeCount: number }[]): boolean {
  if (sortedByCountDesc.length === 0) return false;
  const top = sortedByCountDesc[0].swipeCount;
  if (top >= SWIPE_OUTLIER_MIN_ABSOLUTE) return true;
  if (sortedByCountDesc.length >= 2) {
    const second = sortedByCountDesc[1].swipeCount;
    if (top >= SWIPE_OUTLIER_SECOND_FLOOR && second > 0 && top > second * SWIPE_OUTLIER_RATIO) {
      return true;
    }
  }
  return false;
}

interface AggregatedSwipeRow {
  productId?: string;
  productName?: string;
  swipeDirection: string;
  swipeCount: number;
}

export const ImageSwipesTable: FC<ImageSwipesTableProps> = ({ imageSwipes }) => {
  const [excludeTopOutlier, setExcludeTopOutlier] = useState(true);

  const sortedAggregated = useMemo(() => {
    if (!imageSwipes || imageSwipes.length === 0) return [] as AggregatedSwipeRow[];
    const aggregated = imageSwipes.reduce(
      (acc, row) => {
        const key = `${row.productId}-${row.swipeDirection}`;
        if (!acc[key]) {
          acc[key] = {
            productId: row.productId,
            productName: row.productName,
            swipeDirection: row.swipeDirection || '—',
            swipeCount: 0,
          };
        }
        acc[key].swipeCount += row.swipeCount || 0;
        return acc;
      },
      {} as Record<string, AggregatedSwipeRow>,
    );
    return Object.values(aggregated).sort((a, b) => b.swipeCount - a.swipeCount);
  }, [imageSwipes]);

  const hasLikelyOutlier = useMemo(() => detectLikelySwipeOutlier(sortedAggregated), [sortedAggregated]);

  const rows = useMemo(() => {
    const skipFirst = excludeTopOutlier && hasLikelyOutlier;
    const start = skipFirst ? 1 : 0;
    return sortedAggregated.slice(start, start + 20);
  }, [sortedAggregated, excludeTopOutlier, hasLikelyOutlier]);

  if (!imageSwipes || imageSwipes.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2 mb-4'>
        <Text variant='uppercase' className='font-bold block'>
          Image swipes
        </Text>
        {hasLikelyOutlier && (
          <label className='flex items-center gap-2 text-xs text-textInactiveColor cursor-pointer select-none'>
            <input
              type='checkbox'
              checked={excludeTopOutlier}
              onChange={(e) => setExcludeTopOutlier(e.target.checked)}
              className='accent-textColor'
            />
            Exclude top row (likely bad data)
          </label>
        )}
      </div>
      {hasLikelyOutlier && (
        <p className='mb-3 text-xs text-textInactiveColor'>
          Top swipe count looks inconsistent with the rest (very high total or many times the next row). Counts may
          reflect instrumentation errors — verify in analytics.
        </p>
      )}
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
                  Direction
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Swipes
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.productId ?? '—'}-${row.swipeDirection}`}
                className='border-b border-textInactiveColor hover:bg-bgSecondary'
              >
                <td className='p-2'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='150px'
                  />
                </td>
                <td className='p-2'>
                  <Text>{row.swipeDirection}</Text>
                </td>
                <td className='p-2 text-right'>
                  <Text className='font-bold'>{formatNumber(row.swipeCount)}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Gallery swipe interactions — indicates visual engagement with product imagery</Text>
      </div>
    </div>
  );
};
