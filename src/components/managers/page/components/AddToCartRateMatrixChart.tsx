import type { AddToCartRateAnalysis, AddToCartRateProductRow } from 'api/proto-http/admin';
import { FC } from 'react';
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import Text from 'ui/components/text';
import { formatNumber } from '../utils';

type Quadrant = 'stars' | 'hidden_gems' | 'underperformers' | 'duds';

function getQuadrant(
  viewCount: number,
  cartRate: number,
  avgViewCount: number,
  avgCartRate: number,
): Quadrant {
  const aboveAvgViews = viewCount >= avgViewCount;
  const aboveAvgRate = cartRate >= avgCartRate;
  if (aboveAvgViews && aboveAvgRate) return 'stars';
  if (!aboveAvgViews && aboveAvgRate) return 'hidden_gems';
  if (aboveAvgViews && !aboveAvgRate) return 'underperformers';
  return 'duds';
}

const QUADRANT_COLORS: Record<Quadrant, string> = {
  stars: '#22c55e', // green - best sellers
  hidden_gems: '#3b82f6', // blue - low traffic, high conversion
  underperformers: '#ef4444', // red - high traffic, low conversion (revenue leak)
  duds: '#94a3b8', // slate - low traffic, low conversion
};

const QUADRANT_LABELS: Record<Quadrant, string> = {
  stars: 'Stars',
  hidden_gems: 'Hidden Gems',
  underperformers: 'Underperformers',
  duds: 'Duds',
};

interface AddToCartRateMatrixChartProps {
  addToCartRateAnalysis: AddToCartRateAnalysis | undefined;
}

export const AddToCartRateMatrixChart: FC<AddToCartRateMatrixChartProps> = ({
  addToCartRateAnalysis,
}) => {
  if (!addToCartRateAnalysis?.products?.length) return null;

  const products = addToCartRateAnalysis.products;
  const avgViewCount = addToCartRateAnalysis.avgViewCount ?? 0;
  const avgCartRate = addToCartRateAnalysis.avgCartRate ?? 0;
  const avgCartRatePct = avgCartRate * 100;

  const chartData = products.map((p: AddToCartRateProductRow) => {
    const viewCount = p.viewCount ?? 0;
    const cartRate = (p.cartRate ?? 0) * 100;
    const quadrant = getQuadrant(viewCount, cartRate, avgViewCount, avgCartRatePct);
    return {
      viewCount,
      cartRatePct: cartRate,
      productName: p.productName || `#${p.productId}`,
      productId: p.productId,
      addToCartCount: p.addToCartCount ?? 0,
      quadrant,
    };
  });

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Add to cart actionability matrix
      </Text>
      <div className='mb-3 flex flex-wrap gap-4 text-xs'>
        {(['stars', 'hidden_gems', 'underperformers', 'duds'] as Quadrant[]).map((q) => (
          <span key={q} className='flex items-center gap-1.5'>
            <span
              className='w-3 h-3 rounded-full shrink-0'
              style={{ backgroundColor: QUADRANT_COLORS[q] }}
            />
            {QUADRANT_LABELS[q]}
          </span>
        ))}
      </div>
      <ResponsiveContainer width='100%' height={400}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
          <XAxis
            type='number'
            dataKey='viewCount'
            name='Product views'
            tickFormatter={(v) => formatNumber(v)}
            domain={['auto', 'auto']}
          />
          <YAxis
            type='number'
            dataKey='cartRatePct'
            name='ATC rate'
            unit='%'
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as {
                productName: string;
                viewCount: number;
                addToCartCount: number;
                cartRatePct: number;
                quadrant: Quadrant;
              };
              return (
                <div className='bg-white border border-textInactiveColor p-3 shadow-lg text-xs'>
                  <div className='font-bold mb-2'>{d.productName}</div>
                  <div className='mb-1'>
                    Views: {formatNumber(d.viewCount)} · ATC: {formatNumber(d.addToCartCount)}
                  </div>
                  <div className='mb-1'>ATC rate: {d.cartRatePct.toFixed(1)}%</div>
                  <div
                    className='font-medium'
                    style={{ color: QUADRANT_COLORS[d.quadrant] }}
                  >
                    {QUADRANT_LABELS[d.quadrant]}
                  </div>
                </div>
              );
            }}
          />
          <ReferenceLine
            x={avgViewCount}
            stroke='#666'
            strokeDasharray='5 5'
            strokeWidth={1.5}
          />
          <ReferenceLine
            y={avgCartRatePct}
            stroke='#666'
            strokeDasharray='5 5'
            strokeWidth={1.5}
          />
          <Scatter name='Products' data={chartData} fill='#333'>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={QUADRANT_COLORS[entry.quadrant]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>
          X-axis: Product views. Y-axis: ATC rate (%). Dashed lines: store averages.
        </Text>
        <Text>
          Underperformers (bottom right): high traffic, low conversion — fix design, price, or photos.
          Hidden Gems (top left): low traffic, high conversion — boost marketing.
        </Text>
      </div>
    </div>
  );
};
