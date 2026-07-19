import { FC, ReactNode } from 'react';
import Text from 'ui/components/text';

export interface ShareBarRow {
  label: string;
  /** Bar length is relative to the largest sharePct in the set, so the top bar fills the track. */
  sharePct: number;
  /** Right-aligned, already-formatted value (share % or amount). */
  valueLabel: ReactNode;
  /** Green fill instead of ink — spotlights the rows that carry the money. */
  highlight?: boolean;
}

/**
 * Horizontal share bars matching the approved stub: label · relative bar · value.
 * Strictly monochrome — ink fill, green to spotlight, gray track. No colour washes.
 */
export const ShareBars: FC<{ rows: ShareBarRow[]; note?: ReactNode }> = ({ rows, note }) => {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.sharePct), 1);
  return (
    <div className='space-y-1'>
      {rows.map((r, i) => (
        <div
          key={i}
          className='grid grid-cols-[minmax(84px,110px)_1fr_54px] items-center gap-3 py-1'
        >
          <Text className='truncate text-textBaseSize font-bold'>{r.label}</Text>
          <div className='h-3 w-full bg-bgSecondary'>
            <div
              className={`h-3 ${r.highlight ? 'bg-success' : 'bg-textColor'}`}
              style={{ width: `${Math.min(100, (r.sharePct / max) * 100)}%` }}
            />
          </div>
          <Text className='text-right text-textBaseSize font-bold tabular-nums'>
            {r.valueLabel}
          </Text>
        </div>
      ))}
      {note && (
        <Text variant='uppercase' className='text-labelColor mt-1.5 block text-[10px]'>
          {note}
        </Text>
      )}
    </div>
  );
};
