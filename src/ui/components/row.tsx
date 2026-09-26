import { cn } from 'lib/utility';
/**
 * The reference's `.rowline`: label left, value right, hairline underneath.
 * The value column is tabular so a stack of rows reads as a column of numbers —
 * screens must never set `tabular-nums` themselves.
 *
 * THE HAIRLINE SITS BETWEEN ROWS, NEVER UNDER THE LAST ONE (owner, 2026-09-26, O-48: «после
 * последнего чилда в списке не делать подчеркивание»). A row draws its rule only when the element
 * RIGHT AFTER it is another `Row` (`data-row` is that mark), so a run of rows ends in air at the
 * first thing that is not a row: a note, a group label, a door that adds a row, a total, the end
 * of the container. Adjacent, not «any later sibling»: a note between two runs ends the first run
 * even though rows follow it (O-48 review). A fragment is transparent — its rows are siblings of
 * the rows around it — and `null` leaves no sibling at all. A row wrapped ALONE in a per-item
 * element (a link, a click target) has no sibling to look at: the wrapper carries the rule there
 * (`border-b border-hairline last:border-b-0` on the wrapper, `border-b-0` on the row).
 *
 * `emphasis` is the closing/total row (DESIGN.md, the rule ladder): bold, with the full-weight ink
 * rule ABOVE it and nothing below — the total closes the list, so the row before it drops its
 * hairline (a total is `data-row-total`, not `data-row`). Directly under a `GroupLabel` there is no
 * list to close: the label's own rule stands there, and the total draws none.
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
      data-row={emphasis ? undefined : ''}
      data-row-total={emphasis ? '' : undefined}
      className={cn(
        'flex justify-between gap-2.5 py-1',
        emphasis
          ? 'border-t border-textColor font-bold [[data-group-label]+&]:border-t-0'
          : 'border-b border-hairline [&:not(:has(+[data-row]))]:border-b-0',
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
