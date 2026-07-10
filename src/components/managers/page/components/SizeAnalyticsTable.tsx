import type { SizeAnalyticsRow } from 'api/proto-http/admin';
import type {
  BarSeriesOption,
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts';
import { FC, useMemo } from 'react';
import Text from 'ui/components/text';
import {
  ChartCard,
  EChart,
  categoryAxis,
  chartColors,
  gridBase,
  legendBase,
  tooltipBase,
  valueAxis,
} from '../charts';
import { formatCurrency, formatNumber, normalizeSharesTo100, parseDecimal } from '../utils';
import { ProductNameLink } from './ProductNameLink';

interface SizeAnalyticsTableProps {
  sizeAnalytics: SizeAnalyticsRow[] | undefined;
}

/** Validated categorical palette (dataviz reference, fixed order). Sizes are an
 *  arbitrary string-sorted union across products, so a categorical set fits. */
const sizeColor = (idx: number) => chartColors.categorical[idx % chartColors.categorical.length];

/** Renders a miniature horizontal bar for % of Product cell (10 segments) */
function PercentBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const filled = Math.round((pct / 100) * 10);
  return (
    <div className='flex items-center gap-2 min-w-[110px]'>
      <div className='flex gap-0.5 w-20'>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className='h-2 flex-1 min-w-[3px] rounded-sm'
            style={{ backgroundColor: i < filled ? chartColors.ink : '#e5e5e5' }}
          />
        ))}
      </div>
      <Text className='text-right shrink-0 w-11'>{pct.toFixed(1)}%</Text>
    </div>
  );
}

function pctRowKey(
  productId: number | undefined,
  sizeId: number | undefined,
  sizeName: string | undefined,
): string {
  const label = (sizeName || `Size #${sizeId ?? ''}`).trim();
  return `${productId ?? 0}:${sizeId ?? 0}:${label}`;
}

export const SizeAnalyticsTable: FC<SizeAnalyticsTableProps> = ({ sizeAnalytics }) => {
  const { products, sizeKeys, topSizes, normalizedPctByProductSize } = useMemo(() => {
    if (!sizeAnalytics || sizeAnalytics.length === 0) {
      return {
        products: [] as { product: string; productId: number; shares: number[] }[],
        sizeKeys: [] as string[],
        topSizes: [] as SizeAnalyticsRow[],
        normalizedPctByProductSize: new Map<string, number>(),
      };
    }

    /** Per product: size label → aggregated raw `pctOfProduct` (proto scale may be 0–1, 0–100, or worse). */
    const byProduct = new Map<
      string,
      {
        productId: number;
        productName: string;
        sizes: Map<string, { sizeId: number; raw: number }>;
      }
    >();

    for (const row of sizeAnalytics) {
      const name = (row.productName || `#${row.productId}`).trim();
      const sizeName = row.sizeName || `Size #${row.sizeId}`;
      const raw = row.pctOfProduct ?? 0;

      if (!byProduct.has(name)) {
        byProduct.set(name, {
          productId: row.productId ?? 0,
          productName: name,
          sizes: new Map(),
        });
      }
      const p = byProduct.get(name)!;
      const prev = p.sizes.get(sizeName);
      if (prev) {
        prev.raw += raw;
      } else {
        p.sizes.set(sizeName, { sizeId: row.sizeId ?? 0, raw });
      }
    }

    const allSizeNames = new Set<string>();
    for (const p of byProduct.values()) {
      for (const k of p.sizes.keys()) allSizeNames.add(k);
    }
    const sizeKeys = Array.from(allSizeNames).sort();

    const normalizedPctByProductSize = new Map<string, number>();
    for (const p of byProduct.values()) {
      const rowShares = sizeKeys.map((k) => p.sizes.get(k)?.raw ?? 0);
      const normalized = normalizeSharesTo100(rowShares);
      sizeKeys.forEach((k, i) => {
        const agg = p.sizes.get(k);
        if (agg) {
          normalizedPctByProductSize.set(pctRowKey(p.productId, agg.sizeId, k), normalized[i] ?? 0);
        }
      });
    }

    const products = Array.from(byProduct.values())
      .map((p) => {
        const rowShares = sizeKeys.map((k) => p.sizes.get(k)?.raw ?? 0);
        return {
          product: p.productName,
          productId: p.productId,
          shares: normalizeSharesTo100(rowShares),
        };
      })
      .slice(0, 20);

    return {
      products,
      sizeKeys,
      topSizes: sizeAnalytics.slice(0, 50),
      normalizedPctByProductSize,
    };
  }, [sizeAnalytics]);

  if (!sizeAnalytics || sizeAnalytics.length === 0) return null;

  const hasChart = products.length > 0 && sizeKeys.length > 0;

  const tooltipFormatter = (raw: TooltipComponentFormatterCallbackParams) => {
    const items = Array.isArray(raw) ? raw : [raw];
    const label = items[0]?.name ?? '';
    const rows = items
      .filter((it) => Number(it.value ?? 0) > 0)
      .map(
        (it) =>
          `<div style="display:flex;justify-content:space-between;gap:16px">${it.marker ?? ''}${it.seriesName}<span>${Number(it.value ?? 0).toFixed(1)}%</span></div>`,
      )
      .join('');
    return `<div style="font-size:11px;line-height:1.6"><div style="font-weight:700;margin-bottom:4px">${label}</div>${rows}</div>`;
  };

  const series: BarSeriesOption[] = sizeKeys.map((key, idx) => ({
    name: key,
    type: 'bar',
    stack: 'total',
    data: products.map((p) => p.shares[idx] ?? 0),
    itemStyle: {
      color: sizeColor(idx),
      borderColor: chartColors.surface,
      borderWidth: 1,
    },
    barMaxWidth: 22,
  }));

  const option: EChartsOption = {
    grid: { ...gridBase, left: 12, right: 40, top: 12, bottom: 28 },
    legend: { ...legendBase },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: tooltipFormatter,
    },
    xAxis: valueAxis({
      max: 100,
      axisLabel: {
        formatter: (v: number) => `${v.toFixed(0)}%`,
        color: chartColors.inkSecondary,
        fontSize: 10,
      },
    }) as EChartsOption['xAxis'],
    yAxis: categoryAxis({
      data: products.map((p) => p.product),
      inverse: true,
      axisLabel: {
        width: 130,
        overflow: 'truncate',
        color: chartColors.inkSecondary,
        fontSize: 10,
      },
    }) as EChartsOption['yAxis'],
    series,
  };

  return (
    <div className='border border-textInactiveColor p-4 space-y-6'>
      <Text variant='uppercase' className='font-bold block'>
        Size distribution
      </Text>

      {/* 100% stacked bar chart */}
      {hasChart && <EChart option={option} height={Math.max(280, products.length * 32 + 40)} />}

      {/* Enhanced data table with inline % bar */}
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
                  Size
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Units Sold
                </Text>
              </th>
              <th className='text-right p-2'>
                <Text variant='uppercase' className='text-[10px]'>
                  Revenue
                </Text>
              </th>
              <th className='text-left p-2 min-w-[120px]'>
                <Text variant='uppercase' className='text-[10px]'>
                  % of Product
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {topSizes.map((row, idx) => {
              const pctOfProduct =
                normalizedPctByProductSize.get(
                  pctRowKey(row.productId, row.sizeId, row.sizeName),
                ) ?? 0;
              return (
                <tr key={idx} className='border-b border-textInactiveColor hover:bg-bgSecondary'>
                  <td className='p-2'>
                    <ProductNameLink
                      productId={row.productId}
                      productName={row.productName}
                      maxWidth='120px'
                    />
                  </td>
                  <td className='p-2'>
                    <Text className='font-bold'>{row.sizeName || `Size #${row.sizeId}`}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatNumber(row.unitsSold || 0)}</Text>
                  </td>
                  <td className='p-2 text-right'>
                    <Text>{formatCurrency(parseDecimal(row.revenue))}</Text>
                  </td>
                  <td className='p-2'>
                    <PercentBar value={pctOfProduct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
