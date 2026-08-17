import { cn } from 'lib/utility';

/**
 * Loading placeholders that keep the SHAPE of the answer.
 *
 * The rule this replaces: every list in the admin rendered the word `loading…` in a
 * cell, which is indistinguishable from "your filter matched nothing". A skeleton
 * says "rows are coming"; a framed empty state says "there are none".
 *
 * Uses the reference's hatch fill, not a pulsing grey — the design system has no
 * animation vocabulary and a shimmer would be the only one.
 */

/**
 * Штриховка «места под ответ». Экспортируется, потому что её уже переписывали от руки в
 * четырёх местах: четыре копии одной строки — это четыре разных серых, как только одну из
 * них поправят.
 */
export const HATCH =
  'repeating-linear-gradient(45deg,#f4f4f4,#f4f4f4 6px,#ececec 6px,#ececec 12px)';

export function SkeletonLine({ width, className }: { width?: number | string; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ background: HATCH, width: width ?? '100%' }}
      className={cn('block h-[11px]', className)}
    />
  );
}

/**
 * `widths` describes one row; it is repeated `rows` times. Give it the same column
 * count as the real table so the header does not jump when the data lands.
 */
export function SkeletonRows({
  rows = 3,
  widths,
  className,
}: {
  rows?: number;
  widths: (number | string)[];
  className?: string;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className={className} aria-hidden>
          {widths.map((w, c) => (
            <td key={c} className='border-b border-hairline px-1.5 py-1'>
              <SkeletonLine width={w} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Non-table variant — a stack of hatched blocks for card/board layouts. */
export function SkeletonBlocks({
  count = 3,
  height = 48,
  className,
}: {
  count?: number;
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: HATCH, height }} className='border border-borderColor' />
      ))}
    </div>
  );
}
