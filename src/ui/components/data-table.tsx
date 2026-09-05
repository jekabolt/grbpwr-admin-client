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
 * The horizontal-scroll wrapper is built in — callers must not add their own, and it is
 * `relative` ON PURPOSE.
 *
 * ⚠ A STATIC SCROLL CONTAINER DOES NOT CONTAIN ITS OWN ABSOLUTE DESCENDANTS, AND THAT IS HOW A
 * TABLE PUSHES THE WHOLE PAGE SIDEWAYS. `overflow-x: auto` clips and scrolls the in-flow table
 * box, so a table twice the width of the window costs the page nothing — measured. But an
 * absolutely positioned descendant resolves against the nearest POSITIONED ancestor, and while
 * this wrapper was `position: static` that ancestor was somewhere far above it: such a descendant
 * is neither clipped by this scroll container nor counted into it, and it lands in the ROOT's
 * scrollable overflow at whatever x the wide table put it. Every `srLabel` field, every
 * `<span class="sr-only">` header and the hidden native `<select>` Radix renders under its trigger
 * is exactly such a descendant — 1px wide, invisible, and enough to hand the document a second
 * screen of horizontal scroll (measured at 1135px on a 1024px window, D-4).
 *
 * This is why `overflow: hidden` is NOT the cure and was measured not to be: clipping is not the
 * mechanism. One word of `position` is, because it makes the wrapper the containing block those
 * descendants were missing. Nothing else moves — `relative` with `z-index: auto` opens no stacking
 * context, so the semantic z-scale is untouched, and no caller keeps an absolutely positioned
 * element inside a table that is MEANT to escape it (Radix popovers and menus portal to the body
 * and never see this box).
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
    <div className='relative w-full overflow-x-auto'>
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
