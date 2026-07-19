import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency } from '../utils';

export type WaterfallStep = {
  label: string;
  value: number;
  /** base = gross start · neg = a subtraction · subtotal/final = a running total (bold). */
  kind: 'base' | 'neg' | 'subtotal' | 'final';
};

/**
 * Compact vertical revenue waterfall: gross → net → contribution in one column, so the
 * money story reads top-to-bottom. Bar width is relative to the largest magnitude; negatives
 * are muted red, the two subtotals bold. Costing-derived rows are omitted by the caller when
 * there is no cost coverage.
 */
export const RevenueWaterfall: FC<{ steps: WaterfallStep[] }> = ({ steps }) => {
  if (steps.length === 0) return null;
  const max = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  return (
    <div className='space-y-1'>
      {steps.map((s, i) => {
        const w = Math.min(100, (Math.abs(s.value) / max) * 100);
        const strong = s.kind === 'subtotal' || s.kind === 'final';
        const bar =
          s.kind === 'neg' ? 'bg-error/45' : s.kind === 'final' ? 'bg-success' : 'bg-textColor';
        return (
          <div key={i} className='grid grid-cols-[minmax(130px,1.2fr)_2fr_auto] items-center gap-3'>
            <Text size='small' className={strong ? 'font-bold' : 'text-labelColor'}>
              {s.label}
            </Text>
            <div className='h-3 w-full bg-bgSecondary/60'>
              <div className={`h-3 ${bar}`} style={{ width: `${w}%` }} />
            </div>
            <Text
              size='small'
              className={`text-right tabular-nums ${strong ? 'font-bold' : s.kind === 'neg' ? 'text-error' : ''}`}
            >
              {s.kind === 'neg' ? '−' : ''}
              {formatCurrency(Math.abs(s.value))}
            </Text>
          </div>
        );
      })}
    </div>
  );
};
