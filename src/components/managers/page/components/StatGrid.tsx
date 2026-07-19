import { FC, ReactNode } from 'react';
import Text from 'ui/components/text';

export interface StatCell {
  label: string;
  value: ReactNode;
  /** Optional sub-line under the value. Pass a coloured node (e.g. a <Delta/>) for tone. */
  sub?: ReactNode;
  big?: boolean;
}

/**
 * Connected stat grid matching the stub `.stats`/`.stat`: 1px grid lines, uppercase muted
 * label, bold tabular value, optional sub-line. Surfaces stay white/gray — no colour fills.
 */
export const StatGrid: FC<{ cells: StatCell[]; minCol?: number }> = ({ cells, minCol = 130 }) => (
  <div
    className='grid border-l border-t border-textInactiveColor'
    style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minCol}px, 1fr))` }}
  >
    {cells.map((c, i) => (
      <div key={i} className='border-r border-b border-textInactiveColor px-3 py-2.5'>
        <Text variant='uppercase' className='text-labelColor block text-[10px]'>
          {c.label}
        </Text>
        <Text className={`block font-bold tabular-nums ${c.big ? 'text-2xl' : 'text-lg'}`}>
          {c.value}
        </Text>
        {c.sub && <div className='text-[10px] uppercase leading-tight'>{c.sub}</div>}
      </div>
    ))}
  </div>
);
