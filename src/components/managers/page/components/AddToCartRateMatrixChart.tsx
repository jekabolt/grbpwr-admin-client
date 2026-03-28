import type { AddToCartRateAnalysis, AddToCartRateProductRow } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { formatNumber, toPercentage } from '../utils';
import { ProductNameLink } from './ProductNameLink';

type Quadrant = 'stars' | 'hidden_gems' | 'underperformers' | 'duds';

function getQuadrant(
  viewCount: number,
  cartRatePct: number,
  avgViewCount: number,
  avgCartRatePct: number,
): Quadrant {
  const aboveAvgViews = viewCount >= avgViewCount;
  const aboveAvgRate = cartRatePct >= avgCartRatePct;
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
  const navigate = useNavigate();
  if (!addToCartRateAnalysis?.products?.length) return null;

  const products = addToCartRateAnalysis.products;
  const avgViewCount = addToCartRateAnalysis.avgViewCount ?? 0;

  const handlePointClick = (payload: { productId?: string }) => {
    const id = payload?.productId;
    if (id) {
      const numId = parseInt(id, 10);
      if (!isNaN(numId)) {
        navigate(`${BASE_PATH}/products/${numId}`);
      }
    }
  };
  const avgCartRatePct = toPercentage(addToCartRateAnalysis.avgCartRate ?? 0);

  const chartData = products.map((p: AddToCartRateProductRow) => {
    const viewCount = p.viewCount ?? 0;
    const cartRatePct = toPercentage(p.cartRate ?? 0);
    const quadrant = getQuadrant(viewCount, cartRatePct, avgViewCount, avgCartRatePct);
    return {
      viewCount,
      cartRatePct,
      productName: p.productName || `#${p.productId}`,
      productId: p.productId,
      addToCartCount: p.addToCartCount ?? 0,
      quadrant,
    };
  });

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Shopper engagement per product
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
            name='Add to cart rate'
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
                    Views: {formatNumber(d.viewCount)} · Added to cart: {formatNumber(d.addToCartCount)}
                  </div>
                  <div className='mb-1'>Add to cart rate: {d.cartRatePct.toFixed(1)}%</div>
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
          <Scatter
            name='Products'
            data={chartData}
            fill='#333'
            shape={(props: {
              cx?: number;
              cy?: number;
              payload?: { productId?: string; quadrant?: Quadrant };
              fill?: string;
            }) => {
              const { cx, cy, payload, fill = '#333' } = props;
              if (cx == null || cy == null) return null;
              const color = payload?.quadrant ? QUADRANT_COLORS[payload.quadrant] : fill;
              return (
                <g
                  onClick={() => payload && handlePointClick(payload)}
                  style={{ cursor: 'pointer' }}
                  role='button'
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      payload && handlePointClick(payload);
                    }
                  }}
                >
                  <circle cx={cx} cy={cy} r={6} fill={color} />
                </g>
              );
            }}
          >
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={QUADRANT_COLORS[entry.quadrant]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className='mt-4 overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Product</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Views</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Add to Cart</Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>Cart rate %</Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>Quadrant</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((entry, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor/50 hover:bg-bgSecondary'>
                <td className='p-2'>
                  <ProductNameLink
                    productId={entry.productId}
                    productName={entry.productName}
                    maxWidth='150px'
                  />
                </td>
                <td className='p-2 text-right'>{formatNumber(entry.viewCount)}</td>
                <td className='p-2 text-right'>{formatNumber(entry.addToCartCount)}</td>
                <td className='p-2 text-right'>{entry.cartRatePct.toFixed(1)}%</td>
                <td className='p-2'>
                  <span
                    className='font-medium'
                    style={{ color: QUADRANT_COLORS[entry.quadrant] }}
                  >
                    {QUADRANT_LABELS[entry.quadrant]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='mt-3 text-xs text-textInactiveColor space-y-1'>
        <Text>
          X-axis: Product views. Y-axis: Add to cart rate (%). Dashed lines: store averages.
        </Text>
        <Text>
          Underperformers (bottom right): high traffic, low conversion — fix design, price, or photos.
          Hidden Gems (top left): low traffic, high conversion — boost marketing.
        </Text>
      </div>
    </div>
  );
};
