import { cn } from 'lib/utility';
/**
 * The reference's `.rowline`: label left, value right, hairline underneath.
 * The value column is tabular so a stack of rows reads as a column of numbers —
 * screens must never set `tabular-nums` themselves.
 *
 * `emphasis` is the closing/total row: bold, with a full-weight rule above the value.
 */
export function Row({
  label,
  value,
  emphasis,
  tone,
  className,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  emphasis?: boolean;
  tone?: 'default' | 'error' | 'label';
  className?: string;
}) {
  const toneClass =
    tone === 'error' ? 'text-error' : tone === 'label' ? 'text-labelColor' : undefined;
  return (
    <div
      className={cn(
        'flex justify-between gap-2.5 py-1',
        emphasis ? 'border-b border-textColor font-bold' : 'border-b border-hairline',
        toneClass,
        className,
      )}
    >
      <span className='min-w-0'>{label}</span>
      {value !== undefined && <span className='shrink-0 tabular-nums'>{value}</span>}
    </div>
  );
}

/** Alias for the closing row of a list, so intent is readable at the call site. */
export function RowTotal(props: Omit<Parameters<typeof Row>[0], 'emphasis'>) {
  return <Row {...props} emphasis />;
}
