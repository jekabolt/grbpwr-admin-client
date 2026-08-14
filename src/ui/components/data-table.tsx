import { cn } from 'lib/utility';

/**
 * The reference's table grammar, so no screen re-derives it:
 *   - everything right-aligned except the first column and any cell marked `data-align="left"`
 *     (mark the `th` AND the `td` — a column of words, not digits)
 *   - `th` 10px grey uppercase over a `--borderColor` rule
 *   - `td` over a `--hairline` rule
 *   - tabular numerals throughout
 *   - the total row is bold with a full-weight rule ABOVE it
 *
 * `variant="grid"` is the matrix form (fabric map, size chart): every cell bordered
 * and centred, first column left-aligned on the zebra tint.
 *
 * The horizontal-scroll wrapper is built in — callers must not add their own.
 */
export function DataTable({
  children,
  variant = 'list',
  className,
}: {
  children: React.ReactNode;
  variant?: 'list' | 'grid';
  className?: string;
}) {
  return (
    <div className='w-full overflow-x-auto'>
      <table
        data-variant={variant}
        className={cn(
          'w-full border-collapse tabular-nums',
          '[&_th]:px-1.5 [&_th]:py-1 [&_th]:text-right [&_th]:align-bottom',
          '[&_th]:text-micro [&_th]:font-normal [&_th]:uppercase [&_th]:tracking-label [&_th]:text-labelColor',
          '[&_th]:border-b [&_th]:border-borderColor',
          // Body size named here rather than inherited: a table is the one place where a stray
          // 16px would go unnoticed for months (the header is 10px, so the cells just read "big"),
          // and a `DataTable` dropped into a print sheet or a modal must not depend on what its
          // ancestor happens to set.
          '[&_td]:px-1.5 [&_td]:py-1 [&_td]:text-textBaseSize [&_td]:text-right [&_td]:align-top',
          '[&_td]:border-b [&_td]:border-hairline',
          '[&_th:first-child]:text-left [&_td:first-child]:text-left',
          // A TEXT COLUMN SAYS SO WITH `data-align="left"` ON BOTH ITS `th` AND ITS `td`, and it
          // has to live here rather than at the call site: `[&_th]:text-right` is a descendant
          // selector (0,1,1) and quietly outranks a plain `text-left` class (0,1,0) passed to the
          // cell, so the header stays pinned to the right edge while block content in the cell
          // (a pill, a badge, a `<details>`) sits at the left — the label ends up over nothing.
          // Right alignment is for digits; a column of words needs the other edge.
          '[&_th[data-align=left]]:text-left [&_td[data-align=left]]:text-left',
          variant === 'grid' &&
            '[&_th]:border [&_th]:border-hairline [&_td]:border [&_td]:border-hairline [&_th]:text-center [&_td]:text-center [&_th:first-child]:bg-bgZebra [&_td:first-child]:bg-bgZebra',
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

/** Closing row: bold, ruled above, no rule below. */
export function TotalRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className='[&>td]:border-t [&>td]:border-b-0 [&>td]:border-textColor [&>td]:font-bold'>
      {children}
    </tr>
  );
}

/** A cell standing in for absent data. Never render 0 where you mean "not set". */
export function EmptyCell({ children = '—' }: { children?: React.ReactNode }) {
  return <span className='text-labelColor'>{children}</span>;
}
