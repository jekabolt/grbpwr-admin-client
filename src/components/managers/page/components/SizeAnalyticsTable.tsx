import type { SizeAnalyticsRow } from 'api/proto-http/admin';
import { FC, useMemo } from 'react';
import { ProductNameLink } from './ProductNameLink';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, normalizeSharesTo100, parseDecimal } from '../utils';

interface SizeAnalyticsTableProps {
  sizeAnalytics: SizeAnalyticsRow[] | undefined;
}

/** Size colors for stacked bar chart (distinct, accessible palette) */
const SIZE_COLORS = [
  '#4f46e5', // indigo
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0d9488', // teal
  '#ea580c', // orange
  '#2563eb', // blue
  '#65a30d', // lime
  '#9333ea', // purple
];

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
            style={{
              backgroundColor: i < filled ? '#4f46e5' : 'rgba(255,255,255,0.15)',
            }}
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
  const { chartData, sizeKeys, topSizes, normalizedPctByProductSize } = useMemo(() => {
    if (!sizeAnalytics || sizeAnalytics.length === 0) {
      return {
        chartData: [],
        sizeKeys: [] as string[],
        topSizes: [],
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
          normalizedPctByProductSize.set(
            pctRowKey(p.productId, agg.sizeId, k),
            normalized[i] ?? 0,
          );
        }
      });
    }

    const chartData = Array.from(byProduct.entries())
      .map(([, p]) => {
        const entry: Record<string, string | number> = {
          product: p.productName,
          productId: p.productId,
        };
        const rowShares = sizeKeys.map((k) => p.sizes.get(k)?.raw ?? 0);
        const normalized = normalizeSharesTo100(rowShares);
        sizeKeys.forEach((k, i) => {
          entry[k] = normalized[i] ?? 0;
        });
        return entry;
      })
      .slice(0, 20);

    return {
      chartData,
      sizeKeys,
      topSizes: sizeAnalytics.slice(0, 50),
      normalizedPctByProductSize,
    };
  }, [sizeAnalytics]);

  if (!sizeAnalytics || sizeAnalytics.length === 0) return null;

  return (
    <div className='border border-textInactiveColor p-4 space-y-6'>
      <Text variant='uppercase' className='font-bold block'>
        Size distribution
      </Text>

      {/* 100% Stacked Bar Chart */}
      {chartData.length > 0 && sizeKeys.length > 0 && (
        <div className='min-h-[280px]'>
          <ResponsiveContainer width='100%' height={Math.max(280, chartData.length * 32)}>
            <BarChart
              data={chartData}
              layout='vertical'
              margin={{ top: 10, right: 50, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray='3 3' stroke='#333' />
              <XAxis
                type='number'
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
              />
              <YAxis
                type='category'
                dataKey='product'
                width={140}
                tick={{ fontSize: 10 }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as Record<string, string | number>;
                  return (
                    <div className='bg-white border border-textInactiveColor p-3 shadow-lg text-xs'>
                      <div className='font-bold mb-2'>{d.product}</div>
                      {sizeKeys
                        .filter((k) => (d[k] as number) > 0)
                        .map((k) => (
                          <div key={k} className='flex justify-between gap-4'>
                            <span>{k}</span>
                            <span>{(d[k] as number).toFixed(1)}%</span>
                          </div>
                        ))}
                    </div>
                  );
                }}
              />
              <Legend />
              {sizeKeys.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId='a'
                  fill={SIZE_COLORS[idx % SIZE_COLORS.length]}
                  name={key}
                  radius={idx === sizeKeys.length - 1 ? [0, 2, 2, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Enhanced Data Table with inline % bar */}
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
                    <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='120px' />
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
