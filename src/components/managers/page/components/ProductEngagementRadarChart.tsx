import type { ProductEngagementMetric } from 'api/proto-http/admin';
import { FC, useMemo, useState } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import Text from 'ui/components/text';

/** Extended metric fields - backend may return these beyond the base proto */
type ProductEngagementRow = ProductEngagementMetric & {
  timeOnPageSeconds?: number;
  imageSwipes?: number;
  sizeGuideClicks?: number;
  expandedDetails?: number;
  notifyMeIntent?: number;
};

const METRIC_KEYS = [
  'imageViews',
  'zoomEvents',
  'timeOnPageSeconds',
  'imageSwipes',
  'sizeGuideClicks',
  'expandedDetails',
  'notifyMeIntent',
] as const;

const METRIC_LABELS: Record<(typeof METRIC_KEYS)[number], string> = {
  imageViews: 'Image Views',
  zoomEvents: 'Zoom Events',
  timeOnPageSeconds: 'Time on Page (s)',
  imageSwipes: 'Image Swipes',
  sizeGuideClicks: 'Size Guide',
  expandedDetails: 'Details Expanded',
  notifyMeIntent: 'Notify Me',
};

/** Backend may return snake_case (image_views, time_on_page_seconds, etc.) */
function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function getMetricValue(row: Record<string, unknown>, key: (typeof METRIC_KEYS)[number]): number {
  const camel = row[key];
  const snake = row[toSnakeCase(key)];
  const raw = camel ?? snake;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

interface ProductEngagementRadarChartProps {
  productEngagement: ProductEngagementMetric[] | undefined;
}

const MAX_COMPARE = 3;

export const ProductEngagementRadarChart: FC<ProductEngagementRadarChartProps> = ({
  productEngagement,
}) => {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([0]);

  const { chartData, products } = useMemo(() => {
    const rows = (productEngagement ?? []) as ProductEngagementRow[];
    if (rows.length === 0) return { chartData: [], products: [] };

    // Compute max per metric across all products (for 0–100 normalization)
    const maxValues: Record<(typeof METRIC_KEYS)[number], number> = {
      imageViews: 0,
      zoomEvents: 0,
      timeOnPageSeconds: 0,
      imageSwipes: 0,
      sizeGuideClicks: 0,
      expandedDetails: 0,
      notifyMeIntent: 0,
    };

    for (const row of rows) {
      for (const k of METRIC_KEYS) {
        const v = getMetricValue(row, k);
        if (v > maxValues[k]) maxValues[k] = v;
      }
    }

    const safeMax = (k: (typeof METRIC_KEYS)[number]) => Math.max(1, maxValues[k]);

    // Build recharts radar data: one row per metric
    const chartData = METRIC_KEYS.map((key) => {
      const subject = METRIC_LABELS[key];
      const fullMark = 100;
      const point: Record<string, string | number> = { subject, fullMark };
      rows.forEach((row, idx) => {
        const raw = getMetricValue(row, key);
        const normalized = Math.round((raw / safeMax(key)) * 100);
        point[`p${idx}`] = Math.min(100, normalized);
      });
      return point;
    });

    return { chartData, products: rows };
  }, [productEngagement]);

  if (!productEngagement || productEngagement.length === 0) return null;

  const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

  const toggleProduct = (idx: number) => {
    setSelectedIndices((prev) => {
      if (prev.includes(idx)) {
        if (prev.length === 1) return prev;
        return prev.filter((i) => i !== idx);
      }
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, idx].sort((a, b) => a - b);
    });
  };

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Product engagement radar
      </Text>
      <p className='text-xs text-textInactiveColor mb-3'>
        Normalized 0–100 vs highest-performing product in catalog. Compare visual scrutiny (Image
        Swipes, Zoom) vs sizing clarity (Size Guide) vs intent (Notify Me).
      </p>

      <div className='mb-3 flex flex-wrap items-center gap-2'>
        <span className='text-xs font-medium'>Products:</span>
        {products.slice(0, 15).map((row, idx) => {
          const isSelected = selectedIndices.includes(idx);
          return (
            <button
              key={row.productId ?? idx}
              type='button'
              onClick={() => toggleProduct(idx)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-textInactiveColor hover:border-textInactiveColor/70'
              }`}
              title={row.productName || `#${row.productId}`}
            >
              {row.productName || `#${row.productId}`}
            </button>
          );
        })}
        {products.length > 15 && (
          <span className='text-xs text-textInactiveColor'>+{products.length - 15} more</span>
        )}
      </div>

      <div className='h-[380px] w-full'>
        <ResponsiveContainer width='100%' height='100%'>
          <RadarChart
            cx='50%'
            cy='50%'
            outerRadius='70%'
            data={chartData}
            margin={{ top: 20, right: 30, bottom: 20, left: 30 }}
          >
            <PolarGrid stroke='#94a3b8' strokeOpacity={0.4} />
            <PolarAngleAxis
              dataKey='subject'
              tick={{ fontSize: 11, fill: 'currentColor' }}
              tickLine={false}
            />
            {selectedIndices.map((idx, colorIdx) => (
              <Radar
                key={idx}
                name={products[idx]?.productName || `#${products[idx]?.productId}`}
                dataKey={`p${idx}`}
                stroke={COLORS[colorIdx % COLORS.length]}
                fill={COLORS[colorIdx % COLORS.length]}
                fillOpacity={0.25}
                strokeWidth={2}
              />
            ))}
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-primary, #fff)',
                border: '1px solid var(--text-inactive, #94a3b8)',
                borderRadius: 4,
              }}
              formatter={(value: number, name: string) => [`${value} (normalized)`, name]}
              labelFormatter={(label) => label}
            />
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
