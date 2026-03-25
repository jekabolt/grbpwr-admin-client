import type { ProductEngagementMetric } from 'api/proto-http/admin';
import { FC, useMemo, useState } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import Text from 'ui/components/text';
import { ProductNameLink } from './ProductNameLink';

const METRIC_KEYS = [
  'imageViews',
  'zoomEvents',
  'scroll75',
  'scroll100',
  'avgTimeOnPageSeconds',
] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

const METRIC_LABELS: Record<MetricKey, string> = {
  imageViews: 'Image Views',
  zoomEvents: 'Zoom Events',
  scroll75: 'Scroll 75%',
  scroll100: 'Scroll 100%',
  avgTimeOnPageSeconds: 'Avg Time (s)',
};

/** Proto JSON often sends int64 as strings; API may use snake_case. */
const METRIC_SNAKE: Record<MetricKey, string> = {
  imageViews: 'image_views',
  zoomEvents: 'zoom_events',
  scroll75: 'scroll_75',
  scroll100: 'scroll_100',
  avgTimeOnPageSeconds: 'avg_time_on_page_seconds',
};

function toFiniteNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function getMetricValue(row: ProductEngagementMetric, key: MetricKey): number {
  const r = row as Record<string, unknown>;
  const raw = r[key] ?? r[METRIC_SNAKE[key]];
  return toFiniteNumber(raw);
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
    const rows = productEngagement ?? [];
    if (rows.length === 0) return { chartData: [], products: [] };

    const maxValues = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Record<MetricKey, number>;

    for (const row of rows) {
      for (const k of METRIC_KEYS) {
        const v = getMetricValue(row, k);
        if (v > maxValues[k]) maxValues[k] = v;
      }
    }

    const safeMax = (k: MetricKey) => Math.max(1, maxValues[k]);

    const chartData = METRIC_KEYS.map((key) => {
      const subject = METRIC_LABELS[key];
      const point: Record<string, string | number> = { subject };
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
        Normalized 0–100 vs highest-performing product. Compare visual engagement (Image Views, Zoom)
        vs scroll depth (75%, 100%) vs time on page.
      </p>

      <div className='mb-3 flex flex-wrap items-center gap-2'>
        <span className='text-xs font-medium'>Products:</span>
        {products.slice(0, 15).map((row, idx) => {
          const isSelected = selectedIndices.includes(idx);
          return (
            <div
              key={row.productId ?? idx}
              className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-textInactiveColor hover:border-textInactiveColor/70'
              }`}
            >
              <input
                type='checkbox'
                checked={isSelected}
                onChange={() => toggleProduct(idx)}
                className='shrink-0'
                aria-label={`Compare ${row.productName || row.productId}`}
              />
              <ProductNameLink
                productId={row.productId}
                productName={row.productName}
                maxWidth='120px'
                className='text-xs'
              />
            </div>
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
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickCount={5} />
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
