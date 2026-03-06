import type { ReturnByProductRow } from 'api/proto-http/admin';
import { FC } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Text from 'ui/components/text';

interface ReturnByProductChartProps {
  returnByProduct: ReturnByProductRow[] | undefined;
}

// Reason keys in display order (proto: wrong_size, not_as_described, defective, changed_mind, other)
const REASON_KEYS = ['wrong_size', 'not_as_described', 'defective', 'changed_mind', 'other'] as const;
const REASON_LABELS: Record<string, string> = {
  wrong_size: 'Wrong size',
  not_as_described: 'Not as described',
  defective: 'Defective',
  changed_mind: 'Changed mind',
  other: 'Other',
};
const REASON_COLORS: Record<string, string> = {
  wrong_size: '#f59e0b',   // amber
  not_as_described: '#8b5cf6', // violet
  defective: '#dc2626',    // red
  changed_mind: '#6b7280', // gray
  other: '#9ca3af',       // light gray
};

export const ReturnByProductChart: FC<ReturnByProductChartProps> = ({ returnByProduct }) => {
  if (!returnByProduct || returnByProduct.length === 0) return null;

  const sorted = [...returnByProduct]
    .sort((a, b) => (b.totalReturnRate || 0) - (a.totalReturnRate || 0))
    .slice(0, 20);

  const chartData = sorted.map((row) => {
    const total = row.totalReturnRate ?? 0;
    const reasons = row.reasons ?? {};
    const entry: Record<string, string | number> = {
      name: (row.productName || 'Unknown').trim(),
      totalReturnRate: total,
    };
    for (const key of REASON_KEYS) {
      entry[key] = reasons[key] ?? 0;
    }
    return entry;
  });

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold mb-4 block'>
        Return rate by product
      </Text>
      <ResponsiveContainer width='100%' height={Math.max(300, chartData.length * 28)}>
        <BarChart
          data={chartData}
          layout='vertical'
          margin={{ top: 10, right: 55, left: 5, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray='3 3' stroke='#ccc' />
          <XAxis
            type='number'
            domain={[0, 'auto']}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type='category'
            dataKey='name'
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
                  <div className='font-bold mb-2'>{d.name}</div>
                  <div className='mb-1'>Total return rate: {(d.totalReturnRate as number).toFixed(1)}%</div>
                  {REASON_KEYS.filter((k) => (d[k] as number) > 0).map((k) => (
                    <div key={k} className='flex gap-2'>
                      <span className='w-2 h-2 rounded-sm shrink-0 mt-0.5' style={{ backgroundColor: REASON_COLORS[k] }} />
                      {REASON_LABELS[k]}: {(d[k] as number).toFixed(1)}%
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend />
          {REASON_KEYS.map((key, idx) => (
            <Bar
              key={key}
              dataKey={key}
              stackId='a'
              fill={REASON_COLORS[key]}
              name={REASON_LABELS[key]}
              radius={idx === REASON_KEYS.length - 1 ? [0, 2, 2, 0] : undefined}
            >
              {idx === REASON_KEYS.length - 1 && (
                <LabelList
                  dataKey='totalReturnRate'
                  position='right'
                  formatter={(v: number) => `${v.toFixed(1)}%`}
                  style={{ fontSize: 10 }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className='mt-3 text-xs text-textInactiveColor'>
        <Text>Products sorted by total return rate (worst at top). Segments show refund reason breakdown.</Text>
      </div>
    </div>
  );
};
