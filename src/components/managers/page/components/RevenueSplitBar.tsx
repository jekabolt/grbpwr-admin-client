import { FC } from 'react';
import Text from 'ui/components/text';
import { formatCurrency } from '../utils';

export type SplitSeg = { label: string; value: number; className: string };

/**
 * "Where each € of net revenue goes" — one horizontal stacked bar of the cost segments, with the
 * remainder shown as a green "kept (operating)" slice. When costs exceed revenue (a loss), the bar
 * fills with costs scaled to their own sum and the shortfall is called out instead of a green slice.
 * Values are caller-computed; pass estimated (grossed-up) figures for a coherent full-business view.
 */
export const RevenueSplitBar: FC<{ netRevenue: number; costs: SplitSeg[]; keptLabel?: string }> = ({
  netRevenue,
  costs,
  keptLabel = 'Kept (operating, est)',
}) => {
  const segs = costs.filter((s) => s.value > 0);
  const totalCost = segs.reduce((s, x) => s + x.value, 0);
  if (netRevenue <= 0 || totalCost <= 0) return null;

  const kept = netRevenue - totalCost;
  const denom = kept >= 0 ? netRevenue : totalCost;
  const all: SplitSeg[] =
    kept >= 0 ? [...segs, { label: keptLabel, value: kept, className: 'bg-success' }] : segs;

  return (
    <div className='space-y-2'>
      <div className='flex h-8 w-full border border-textColor'>
        {all.map((s, i) => (
          <div
            key={i}
            className={`h-full ${s.className}`}
            style={{ width: `${(s.value / denom) * 100}%` }}
            title={`${s.label} ${formatCurrency(s.value)}`}
          />
        ))}
      </div>
      <div className='flex flex-wrap gap-x-4 gap-y-1'>
        {all.map((s, i) => (
          <span key={i} className='text-textBaseSize text-labelColor'>
            <span className={`mr-1 inline-block h-2 w-2 align-middle ${s.className}`} />
            {s.label} {((s.value / netRevenue) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
      {kept < 0 && (
        <Text className='text-textBaseSize text-error'>
          Costs exceed net revenue by {formatCurrency(-kept)} (est) this period.
        </Text>
      )}
    </div>
  );
};
