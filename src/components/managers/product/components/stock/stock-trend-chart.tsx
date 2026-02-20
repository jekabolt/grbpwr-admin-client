import type { common_StockChange } from 'api/proto-http/admin';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

interface StockTrendChartProps {
  changes: common_StockChange[];
  productId?: number;
  sizeLabel: string;
  onDownloadCsv: () => void;
  isLoading?: boolean;
}

export function StockTrendChart({
  changes,
  productId,
  sizeLabel,
  onDownloadCsv,
  isLoading,
}: StockTrendChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...changes].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    });
    return sorted.map((c) => ({
      date: c.createdAt
        ? new Date(c.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: '2-digit',
          })
        : '',
      quantity: Number(c.quantityAfter?.value ?? 0),
      fullDate: c.createdAt ? new Date(c.createdAt).toLocaleString() : '',
    }));
  }, [changes]);

  const hasData = chartData.length > 0;

  return (
    <div className='shrink-0 rounded border border-textInactiveColor bg-bgColor p-4'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase' className='font-bold'>
          Product Stock Trend
        </Text>
        <Button
          type='button'
          variant='secondary'
          onClick={onDownloadCsv}
          disabled={!hasData || isLoading}
        >
          Download CSV
        </Button>
      </div>

      <Text variant='uppercase'>
        Product {productId != null ? productId : '—'}; Size: {sizeLabel}
      </Text>
      <div className='min-h-[220px] w-full'>
        {!hasData ? (
          <div className='flex h-[220px] items-center justify-center'>
            <Text variant='uppercase' className='text-textInactiveColor'>
              {isLoading ? 'Loading…' : 'No data to display'}
            </Text>
          </div>
        ) : (
          <ResponsiveContainer width='100%' height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id='stockTrendFill' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor='#93c5fd' stopOpacity={0.6} />
                  <stop offset='100%' stopColor='#93c5fd' stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' className='stroke-textInactiveColor/50' />
              <XAxis dataKey='date' tick={{ fontSize: 10 }} className='text-textInactiveColor' />
              <YAxis
                tick={{ fontSize: 10 }}
                className='text-textInactiveColor'
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value: number | undefined) => [value ?? 0, 'Quantity']}
                labelFormatter={(_, payload) =>
                  (Array.isArray(payload) && payload[0]?.payload?.fullDate) ?? ''
                }
              />
              <Area
                type='monotone'
                dataKey='quantity'
                stroke='#93c5fd'
                strokeWidth={2}
                fill='url(#stockTrendFill)'
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
