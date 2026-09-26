import { cn } from 'lib/utility';
/**
 * The reference's `.rowline`: label left, value right, hairline underneath.
 * The value column is tabular so a stack of rows reads as a column of numbers —
 * screens must never set `tabular-nums` themselves.
 *
 * THE HAIRLINE SITS BETWEEN ROWS, NEVER UNDER THE LAST ONE (owner, 2026-09-26, O-48: «после
 * последнего чилда в списке не делать подчеркивание»). A row draws its rule only while another
 * `Row` follows it among its siblings (`data-row` is that mark), so the list ends in air whatever
 * comes after it — nothing, a note, a door that adds a row. A row followed by a `RowTotal` keeps
 * its rule: the total is a row too. A row wrapped ALONE in a per-item element (a link, a click
 * target) has no sibling to look at — the wrapper carries the rule there (`last:border-b-0` on
 * the wrapper, `border-b-0` on the row).
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
      data-row=''
      className={cn(
        'flex justify-between gap-2.5 py-1',
        emphasis
          ? 'border-b border-textColor font-bold'
          : 'border-b border-hairline [&:not(:has(~[data-row]))]:border-b-0',
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
