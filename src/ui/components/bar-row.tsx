/** Ranked horizontal bar: name, track, value. */
export function BarRow({
  name,
  pct,
  value,
  tone = 'ink',
}: {
  name: React.ReactNode;
  /** 0–100. */
  pct: number;
  value: React.ReactNode;
  tone?: 'ink' | 'up' | 'down';
}) {
  const fill = tone === 'up' ? 'bg-success' : tone === 'down' ? 'bg-error/60' : 'bg-textColor';
  const valueTone = tone === 'up' ? 'text-success' : tone === 'down' ? 'text-error' : '';
  return (
    <div className='grid grid-cols-[130px_1fr_88px] items-center gap-2 py-0.5'>
      <span className='truncate font-bold'>{name}</span>
      <span className='block h-3 bg-trackBg'>
        <span
          className={`block h-3 ${fill}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </span>
      <span className={`text-right font-bold tabular-nums ${valueTone}`}>{value}</span>
    </div>
  );
}

/**
 * Waterfall step: bars are positioned, not just sized, so a running total reads as a
 * descent from revenue to margin.
 */
export function WaterfallRow({
  name,
  left,
  width,
  value,
  kind = 'pos',
  emphasis,
}: {
  name: React.ReactNode;
  /** 0–100, left edge of the bar. */
  left: number;
  /** 0–100, bar width. */
  width: number;
  value: React.ReactNode;
  kind?: 'pos' | 'neg' | 'final';
  emphasis?: boolean;
}) {
  const fill = kind === 'neg' ? 'bg-error/55' : kind === 'final' ? 'bg-success' : 'bg-textColor';
  const valueTone = kind === 'neg' ? 'text-error' : kind === 'final' ? 'text-success' : '';
  return (
    <div className='grid grid-cols-[150px_1fr_90px] items-center gap-2 py-0.5'>
      <span className={`truncate ${emphasis ? 'font-bold' : 'text-labelColor'}`}>{name}</span>
      <span className='relative block h-[13px] bg-trackBg'>
        <span
          className={`absolute top-0 h-[13px] ${fill}`}
          style={{ left: `${left}%`, width: `${Math.max(0.5, width)}%` }}
        />
      </span>
      <span className={`text-right font-bold tabular-nums ${valueTone}`}>{value}</span>
    </div>
  );
}
