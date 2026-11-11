import { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from 'lib/utility';
import { type SelectWord } from 'ui';
import { EmployeeTile, type TileData, type TileEdit } from './employee-tile';

const MOVE_MS = 700;
const SOFT = 'cubic-bezier(0.22, 1, 0.36, 1)';

export type BoardItem = {
  id: number;
  data: TileData;
  words: readonly SelectWord[];
  edit?: TileEdit;
};

/**
 * SMOOTH REFLOW: every tile glides from where it stood to its new cell (FLIP on the soft ease) —
 * after a filter, a sort, a reverse, or when the grid changes its number of columns.
 */
function useReflow(order: string) {
  const grid = useRef<HTMLDivElement>(null);
  const last = useRef(new Map<string, DOMRect>());
  const glide = useRef(() => {});
  glide.current = () => {
    const node = grid.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, DOMRect>();
    node.querySelectorAll<HTMLElement>('[data-employee-tile]').forEach((el) => {
      const key = el.dataset.employeeTile ?? '';
      const now = el.getBoundingClientRect();
      next.set(key, now);
      const was = last.current.get(key);
      if (reduced || !was) return;
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: MOVE_MS,
        easing: SOFT,
      });
    });
    last.current = next;
  };
  useLayoutEffect(() => glide.current(), [order]);
  useEffect(() => {
    const node = grid.current;
    if (!node) return undefined;
    // Columns change with the width: the tiles glide to their new cells.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => glide.current());
    });
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return grid;
}

/**
 * THE EMPLOYEES BOARD: the tiles in a responsive grid (4 on a 1440 screen, fewer when narrower).
 * THE TASKBOARD SELECTION: one click selects (the words come in above the tile at the right), a
 * click on it again or outside lets it go, double click / Enter opens.
 */
export function EmployeeBoard({
  items,
  selected,
  onSelect,
  onOpen,
}: {
  items: readonly BoardItem[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onOpen: (id: number) => void;
}) {
  const grid = useReflow(items.map((i) => i.id).join(','));

  // A click outside the selected tile (and its words) lets the selection go.
  useEffect(() => {
    if (selected == null) return undefined;
    const outside = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('[data-employee-tile], [role="dialog"], [data-radix-popper-content-wrapper]')
      )
        return;
      onSelect(null);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [selected, onSelect]);

  return (
    <div
      ref={grid}
      role='listbox'
      aria-label='employees'
      className='grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] items-start gap-x-2 gap-y-8'
    >
      {items.map((item) => {
        const on = selected === item.id;
        return (
          <div
            key={item.id}
            data-employee-tile={item.id}
            role='option'
            aria-selected={on}
            aria-label={item.data.name}
            tabIndex={0}
            onClick={() => onSelect(on ? null : item.id)}
            onDoubleClick={() => onOpen(item.id)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                onOpen(item.id);
              } else if (e.key === ' ') {
                e.preventDefault();
                onSelect(on ? null : item.id);
              }
            }}
            // The words come in above the tile, into the gap: the row does not move.
            className={cn(
              'min-w-0 cursor-pointer transition-[margin] duration-700 ease-soft select-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none',
              on && '-mt-7',
            )}
          >
            <EmployeeTile data={item.data} selected={on} words={item.words} edit={item.edit} />
          </div>
        );
      })}
    </div>
  );
}
