import type { AddToCartRateAnalysis, AddToCartRateProductRow } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import Text from 'ui/components/text';
import { EChart, chartColors, gridBase, tooltipBase, valueAxis } from '../charts';
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

// Semantic marks, validated on the white surface (dataviz status palette).
const QUADRANT_COLORS: Record<Quadrant, string> = {
  stars: chartColors.status.good, // best sellers
  hidden_gems: chartColors.status.info, // low traffic, high conversion
  underperformers: chartColors.status.critical, // high traffic, low conversion (revenue leak)
  duds: chartColors.status.muted, // low traffic, low conversion
};

const QUADRANT_LABELS: Record<Quadrant, string> = {
  stars: 'Stars',
  hidden_gems: 'Hidden Gems',
  underperformers: 'Underperformers',
  duds: 'Duds',
};

interface ScatterPoint {
  value: [number, number];
  name: string;
  productId?: string;
  viewCount: number;
  addToCartCount: number;
  cartRatePct: number;
  quadrant: Quadrant;
  itemStyle: { color: string };
}

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
  const avgCartRatePct = toPercentage(addToCartRateAnalysis.avgCartRate ?? 0);

  const goToProduct = (productId?: string) => {
    if (!productId) return;
    const numId = parseInt(productId, 10);
    if (!isNaN(numId)) navigate(`${BASE_PATH}/products/${numId}`);
  };

  const chartData: ScatterPoint[] = products.map((p: AddToCartRateProductRow) => {
    const viewCount = p.viewCount ?? 0;
    const cartRatePct = toPercentage(p.cartRate ?? 0);
    const quadrant = getQuadrant(viewCount, cartRatePct, avgViewCount, avgCartRatePct);
    return {
      value: [viewCount, cartRatePct],
      name: p.productName || `#${p.productId}`,
      productId: p.productId,
      viewCount,
      addToCartCount: p.addToCartCount ?? 0,
      cartRatePct,
      quadrant,
      itemStyle: { color: QUADRANT_COLORS[quadrant] },
    };
  });

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const p = Array.isArray(raw) ? raw[0] : raw;
    const d = p?.data as ScatterPoint | undefined;
    if (!d) return '';
    return `<div style="font-size:11px;line-height:1.6">
      <div style="font-weight:700;margin-bottom:4px">${d.name}</div>
      <div>Views: ${formatNumber(d.viewCount)} · Added to cart: ${formatNumber(d.addToCartCount)}</div>
      <div>Add to cart rate: ${d.cartRatePct.toFixed(1)}%</div>
      <div style="font-weight:600;color:${QUADRANT_COLORS[d.quadrant]}">${QUADRANT_LABELS[d.quadrant]}</div>
    </div>`;
  };

  const option: EChartsOption = {
    grid: { ...gridBase, top: 16, right: 24, bottom: 28 },
    tooltip: { ...tooltipBase, trigger: 'item', formatter: tooltipFormatter },
    xAxis: valueAxis({
      name: 'Product views',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: chartColors.inkSecondary, fontSize: 10 },
      axisLabel: {
        formatter: (v: number) => formatNumber(v),
        color: chartColors.inkSecondary,
        fontSize: 10,
      },
      splitLine: { show: false },
    }) as EChartsOption['xAxis'],
    yAxis: valueAxis({
      name: 'Add to cart rate',
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { color: chartColors.inkSecondary, fontSize: 10 },
      axisLabel: {
        formatter: (v: number) => `${v.toFixed(1)}%`,
        color: chartColors.inkSecondary,
        fontSize: 10,
      },
    }),
    series: [
      {
        type: 'scatter',
        data: chartData,
        symbolSize: 12,
        emphasis: { scale: 1.3 },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: chartColors.inkSecondary, type: 'dashed', width: 1 },
          label: { show: false },
          data: [{ xAxis: avgViewCount }, { yAxis: avgCartRatePct }],
        },
      },
    ],
  };

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Add-to-cart performance by product
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
      <EChart
        option={option}
        height={400}
        onEvents={{ click: (p) => goToProduct((p.data as ScatterPoint | undefined)?.productId) }}
      />
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
                  Views
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Add to Cart
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Cart rate %
                </Text>
              </th>
              <th className='text-left p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Quadrant
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((entry, idx) => (
              <tr key={idx} className='border-b border-textInactiveColor/50 hover:bg-bgSecondary'>
                <td className='p-2'>
                  <ProductNameLink
                    productId={entry.productId}
                    productName={entry.name}
                    maxWidth='150px'
                  />
                </td>
                <td className='p-2 text-right'>{formatNumber(entry.viewCount)}</td>
                <td className='p-2 text-right'>{formatNumber(entry.addToCartCount)}</td>
                <td className='p-2 text-right'>{entry.cartRatePct.toFixed(1)}%</td>
                <td className='p-2'>
                  <span className='font-medium' style={{ color: QUADRANT_COLORS[entry.quadrant] }}>
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
          Underperformers (bottom right): high traffic, low conversion — fix design, price, or
          photos. Hidden Gems (top left): low traffic, high conversion — boost marketing.
        </Text>
      </div>
    </div>
  );
};
