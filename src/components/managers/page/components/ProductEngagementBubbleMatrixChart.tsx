import type {
  ProductEngagementBubbleMatrix,
  ProductEngagementBubbleRow,
  ProductEngagementMetricsPct,
} from 'api/proto-http/admin';
import { FC, useMemo, useState } from 'react';
import Text from 'ui/components/text';
import { ProductNameLink } from './ProductNameLink';

const METRIC_KEYS = [
  'imageSwipes',
  'zoomEvents',
  'expandedDetails',
  'sizeGuideClicks',
  'notifyMeIntent',
] as const;

const METRIC_LABELS: Record<(typeof METRIC_KEYS)[number], string> = {
  imageSwipes: 'Image swipes',
  zoomEvents: 'Zoom events',
  expandedDetails: 'Details expansion',
  sizeGuideClicks: 'Size guide',
  notifyMeIntent: 'Notify me',
};

const ABOVE_AVG_COLOR = '#ef4444'; // red - outperforming
const BELOW_AVG_COLOR = '#94a3b8'; // grey - below average

function getPct(m: ProductEngagementMetricsPct | undefined, key: (typeof METRIC_KEYS)[number]): number {
  const v = m?.[key];
  return typeof v === 'number' ? v : 0;
}

interface ProductEngagementBubbleMatrixChartProps {
  productEngagementBubbleMatrix: ProductEngagementBubbleMatrix | undefined;
}

export const ProductEngagementBubbleMatrixChart: FC<ProductEngagementBubbleMatrixChartProps> = ({
  productEngagementBubbleMatrix,
}) => {
  const [hovered, setHovered] = useState<{ productIdx: number; metricKey: (typeof METRIC_KEYS)[number] } | null>(
    null,
  );

  const products = productEngagementBubbleMatrix?.products ?? [];
  const storeAverages = productEngagementBubbleMatrix?.storeAverages ?? {};

  const maxPct = useMemo(() => {
    let max = 0;
    for (const p of products) {
      const m = p.metricsAsPctOfViews;
      for (const k of METRIC_KEYS) {
        const v = getPct(m, k);
        if (v > max) max = v;
      }
    }
    for (const k of METRIC_KEYS) {
      const v = getPct(storeAverages, k);
      if (v > max) max = v;
    }
    return max || 100;
  }, [products, storeAverages]);

  const bubbleSize = (pct: number) => {
    const radius = Math.max(4, Math.min(24, (pct / maxPct) * 24));
    return radius;
  };

  if (products.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Product engagement bubble matrix
      </Text>
      <div className='mb-3 flex flex-wrap gap-4 text-xs'>
        <span className='flex items-center gap-1.5'>
          <span
            className='w-3 h-3 rounded-full shrink-0'
            style={{ backgroundColor: ABOVE_AVG_COLOR }}
          />
          Above store average
        </span>
        <span className='flex items-center gap-1.5'>
          <span
            className='w-3 h-3 rounded-full shrink-0'
            style={{ backgroundColor: BELOW_AVG_COLOR }}
          />
          Below store average
        </span>
      </div>
      <div className='overflow-x-auto'>
        <div className='min-w-[600px]'>
          {/* Header row: metric names */}
          <div className='grid gap-2 mb-2' style={{ gridTemplateColumns: `120px repeat(${METRIC_KEYS.length}, minmax(80px, 1fr))` }}>
            <div className='text-xs font-medium text-textInactiveColor' />
            {METRIC_KEYS.map((k) => (
              <div key={k} className='text-xs font-medium text-center'>
                {METRIC_LABELS[k]}
              </div>
            ))}
          </div>
          {/* Data rows: product × metric bubbles */}
          {products.map((row: ProductEngagementBubbleRow, productIdx: number) => (
            <div
              key={row.productId ?? productIdx}
              className='grid gap-2 py-1.5 border-b border-textInactiveColor/30 last:border-0 items-center'
              style={{ gridTemplateColumns: `120px repeat(${METRIC_KEYS.length}, minmax(80px, 1fr))` }}
            >
              <ProductNameLink
                productId={row.productId}
                productName={row.productName}
                maxWidth='110px'
                className='text-xs'
              />
              {METRIC_KEYS.map((metricKey) => {
                const pct = getPct(row.metricsAsPctOfViews, metricKey);
                const avg = getPct(storeAverages, metricKey);
                const isAboveAvg = avg > 0 && pct >= avg;
                const color = isAboveAvg ? ABOVE_AVG_COLOR : BELOW_AVG_COLOR;
                const radius = bubbleSize(pct);
                const isHovered =
                  hovered?.productIdx === productIdx && hovered?.metricKey === metricKey;
                return (
                  <div
                    key={metricKey}
                    className='flex justify-center items-center h-12'
                    onMouseEnter={() => setHovered({ productIdx, metricKey })}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <div
                      className='relative flex items-center justify-center rounded-full transition-transform hover:scale-110'
                      style={{
                        width: radius * 2,
                        height: radius * 2,
                        backgroundColor: color,
                        minWidth: 8,
                        minHeight: 8,
                      }}
                      title={`${row.productName ?? row.productId}: ${METRIC_LABELS[metricKey]} ${pct.toFixed(1)}% (avg ${avg.toFixed(1)}%)`}
                    >
                      {isHovered && (
                        <div className='absolute -top-8 left-1/2 -translate-x-1/2 z-10 bg-white border border-textInactiveColor px-2 py-1 shadow-lg text-xs whitespace-nowrap'>
                          {pct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className='mt-4 overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              {METRIC_KEYS.map((k) => (
                <th key={k} className='text-right p-2'>
                  <Text variant='uppercase' className='text-[10px]'>{METRIC_LABELS[k]}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((row: ProductEngagementBubbleRow, idx) => (
              <tr key={row.productId ?? idx} className='border-b border-textInactiveColor/50 hover:bg-bgSecondary'>
                <td className='p-2'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='140px'
                  />
                </td>
                {METRIC_KEYS.map((k) => (
                  <td key={k} className='p-2 text-right'>
                    {getPct(row.metricsAsPctOfViews, k).toFixed(1)}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>
          Columns: user journey from photo engagement (swipes/zoom) to intent (size guide, notify me).
        </Text>
        <Text>
          Bubble size = % of viewers. Red = above store average. Grey = below. Scan for anomalies.
        </Text>
      </div>
    </div>
  );
};
