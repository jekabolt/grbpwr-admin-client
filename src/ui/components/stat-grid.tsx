import Text from 'ui/components/text';

/**
 * The reference's `.stats` block: an auto-fitting grid of bordered cells, each a
 * label / value / sub triple. Used for KPI strips, run totals, cost summaries.
 *
 * A cell with no data must render `—`, never `0` — an empty strip that reads as
 * zero cost is worse than one that admits it has nothing.
 */
export function StatGrid({
  children,
  min = 110,
  className,
}: {
  children: React.ReactNode;
  /** Minimum cell width in px before the grid wraps. */
  min?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid border border-borderColor ${className ?? ''}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  big,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'default' | 'up' | 'down';
  big?: boolean;
}) {
  const toneClass = tone === 'up' ? 'text-success' : tone === 'down' ? 'text-error' : undefined;
  return (
    <div className='border-r border-b border-borderColor px-2.5 py-2'>
      <Text size='micro' variant='label' tracking='label' className='uppercase'>
        {label}
      </Text>
      <Text size={big ? 'statBig' : 'stat'} className={toneClass}>
        {value}
      </Text>
      {sub && (
        <Text size='micro' variant='label' className='uppercase'>
          {sub}
        </Text>
      )}
    </div>
  );
}
