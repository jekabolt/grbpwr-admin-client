import type {
  ProductEngagementBubbleMatrix,
  ProductEngagementBubbleRow,
  ProductEngagementMetricsPct,
} from 'api/proto-http/admin';
import { FC, useMemo, useState } from 'react';
import Text from 'ui/components/text';
import { ProductNameLink } from './ProductNameLink';

const METRIC_KEYS = ['zoomRatePct', 'scroll75RatePct', 'scroll100RatePct', 'avgTimeOnPageSeconds'] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

const METRIC_LABELS: Record<MetricKey, string> = {
  zoomRatePct: 'Zoom rate %',
  scroll75RatePct: 'Scroll 75% rate',
  scroll100RatePct: 'Scroll 100% rate',
  avgTimeOnPageSeconds: 'Avg time (s)',
};

const OVERALL_KEYS: Record<MetricKey, keyof ProductEngagementMetricsPct> = {
  zoomRatePct: 'avgZoomRatePct',
  scroll75RatePct: 'avgScroll75RatePct',
  scroll100RatePct: 'avgScroll100RatePct',
  avgTimeOnPageSeconds: 'avgTimeOnPageSeconds',
};

const ABOVE_AVG_COLOR = '#ef4444';
const BELOW_AVG_COLOR = '#94a3b8';

function getVal(row: ProductEngagementBubbleRow, key: MetricKey): number {
  const v = row[key];
  return typeof v === 'number' ? v : 0;
}

function getOverallVal(overall: ProductEngagementMetricsPct | undefined, key: MetricKey): number {
  if (!overall) return 0;
  const v = overall[OVERALL_KEYS[key]];
  return typeof v === 'number' ? v : 0;
}

interface ProductEngagementBubbleMatrixChartProps {
  productEngagementBubbleMatrix: ProductEngagementBubbleMatrix | undefined;
}

export const ProductEngagementBubbleMatrixChart: FC<ProductEngagementBubbleMatrixChartProps> = ({
  productEngagementBubbleMatrix,
}) => {
  const [hovered, setHovered] = useState<{ rowIdx: number; metricKey: MetricKey } | null>(null);

  const rows = productEngagementBubbleMatrix?.rows ?? [];
  const overall = productEngagementBubbleMatrix?.overall;

  const maxVal = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      for (const k of METRIC_KEYS) {
        const v = getVal(row, k);
        if (v > max) max = v;
      }
    }
    for (const k of METRIC_KEYS) {
      const v = getOverallVal(overall, k);
      if (v > max) max = v;
    }
    return max || 100;
  }, [rows, overall]);

  const bubbleSize = (val: number) => Math.max(4, Math.min(24, (val / maxVal) * 24));

  if (rows.length === 0) return null;

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
          <div
            className='grid gap-2 mb-2'
            style={{ gridTemplateColumns: `120px repeat(${METRIC_KEYS.length}, minmax(80px, 1fr))` }}
          >
            <div className='text-xs font-medium text-textInactiveColor' />
            {METRIC_KEYS.map((k) => (
              <div key={k} className='text-xs font-medium text-center'>
                {METRIC_LABELS[k]}
              </div>
            ))}
          </div>
          {rows.map((row, rowIdx) => (
            <div
              key={row.productId ?? rowIdx}
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
                const val = getVal(row, metricKey);
                const avg = getOverallVal(overall, metricKey);
                const isAboveAvg = avg > 0 && val >= avg;
                const color = isAboveAvg ? ABOVE_AVG_COLOR : BELOW_AVG_COLOR;
                const radius = bubbleSize(val);
                const isHovered = hovered?.rowIdx === rowIdx && hovered?.metricKey === metricKey;
                const label =
                  metricKey === 'avgTimeOnPageSeconds' ? `${val.toFixed(1)}s` : `${val.toFixed(1)}%`;
                const avgLabel =
                  metricKey === 'avgTimeOnPageSeconds' ? `${avg.toFixed(1)}s` : `${avg.toFixed(1)}%`;
                return (
                  <div
                    key={metricKey}
                    className='flex justify-center items-center h-12'
                    onMouseEnter={() => setHovered({ rowIdx, metricKey })}
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
                      title={`${row.productName ?? row.productId}: ${METRIC_LABELS[metricKey]} ${label} (avg ${avgLabel})`}
                    >
                      {isHovered && (
                        <div className='absolute -top-8 left-1/2 -translate-x-1/2 z-10 bg-white border border-textInactiveColor px-2 py-1 shadow-lg text-xs whitespace-nowrap'>
                          {label}
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
                <Text variant='uppercase' className='text-[10px]'>
                  Product
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Image views
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Zoom events
                </Text>
              </th>
              {METRIC_KEYS.map((k) => (
                <th key={k} className='text-right p-2'>
                  <Text variant='uppercase' className='text-[10px]'>
                    {METRIC_LABELS[k]}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.productId ?? idx}
                className='border-b border-textInactiveColor/50 hover:bg-bgSecondary'
              >
                <td className='p-2'>
                  <ProductNameLink
                    productId={row.productId}
                    productName={row.productName}
                    maxWidth='140px'
                  />
                </td>
                <td className='p-2 text-right'>{row.totalImageViews ?? 0}</td>
                <td className='p-2 text-right'>{row.totalZoomEvents ?? 0}</td>
                {METRIC_KEYS.map((k) => (
                  <td key={k} className='p-2 text-right'>
                    {k === 'avgTimeOnPageSeconds'
                      ? `${getVal(row, k).toFixed(1)}s`
                      : `${getVal(row, k).toFixed(1)}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>
          Columns: engagement metrics as % of image views (except time on page). Red = above store
          average. Grey = below.
        </Text>
      </div>
    </div>
  );
};
