import type { TimeSeriesPoint } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { parseDecimal } from '../utils';

/**
 * Tiny inline-SVG trend — just the shape of a daily series, no axes. For the compact
 * "how the period moved" strip at the top of Revenue. Self-hides below 2 points.
 */
export const Sparkline: FC<{
  label: string;
  sub?: string;
  data: TimeSeriesPoint[] | undefined;
  /** Read `count` when `value` is empty (orders-style series). */
  number?: boolean;
}> = ({ label, sub, data, number }) => {
  const vals = (data ?? []).map((p) =>
    number ? parseDecimal(p.value) || (p.count ?? 0) : parseDecimal(p.value),
  );
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 120;
  const h = 28;
  const pts = vals
    .map(
      (v, i) =>
        `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`,
    )
    .join(' ');
  return (
    <div className='border border-textInactiveColor p-2'>
      <Text variant='uppercase' className='block text-[10px] text-labelColor'>
        {label}
        {sub ? ` · ${sub}` : ''}
      </Text>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio='none' className='mt-1 block h-7 w-full'>
        <polyline fill='none' stroke='currentColor' strokeWidth='1.5' points={pts} />
      </svg>
    </div>
  );
};
