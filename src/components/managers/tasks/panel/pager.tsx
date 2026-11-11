import { Button } from 'ui';

/**
 * The page counter of a category title (frame: `1 / 25` — 12px, the current page ink, the total
 * grey). A press steps to the next page and wraps; with Shift it steps back.
 */
export function TitlePager({
  page,
  pages,
  onPage,
  label,
}: {
  /** Zero-based. */
  page: number;
  pages: number;
  onPage: (page: number) => void;
  label: string;
}) {
  const total = Math.max(1, pages);
  return (
    <Button
      type='button'
      variant='default'
      aria-label={`${label}: page ${page + 1} of ${total}`}
      disabled={total <= 1}
      onClick={(e: React.MouseEvent) =>
        onPage(e.shiftKey ? (page - 1 + total) % total : (page + 1) % total)
      }
      className='cursor-pointer text-textBaseSize tabular-nums disabled:cursor-default'
    >
      <span className='text-ink'>{Math.min(page + 1, total)}</span>
      <span className='text-placeholder'> / {total}</span>
    </Button>
  );
}

export function pageOf<T>(items: readonly T[], page: number, size: number): T[] {
  return items.slice(page * size, page * size + size);
}

export function pageCount(length: number, size: number): number {
  return Math.max(1, Math.ceil(length / size));
}
