import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';

import { cn } from 'lib/utility';
import { Iconoir } from '../icons/iconoir';
import { Avatar } from './avatar';

/** One row of a list under a filter, px (the compact cascade list's row). */
const ROW = 24;

type FilterRowContext = { open: string | null; toggle: (id: string) => void };
const Context = createContext<FilterRowContext>({ open: null, toggle: () => undefined });

/**
 * THE FILTER ROW of the Taskboard system — `Department: [ Any ]  Deadline: [ Any ]  …` at the end
 * of a title row. The label is 10px grey and turns ink under the pointer and while its list is
 * open; the value is 12px ink, in brackets; nothing is ever filled. ONE list is open at a time:
 * opening another folds the previous, and so does a click anywhere outside or Esc — every list
 * folds back the way it opened.
 *
 * The lists hang directly under their values and take no room in the row; the holder keeps
 * `FilterRow.room(rows)` px free under the title row (a block whose height eases), so the content
 * below is pushed down instead of covered.
 */
export function FilterRow({
  open,
  onOpenChange,
  className,
  children,
}: {
  /** The `id` of the open filter. */
  open: string | null;
  onOpenChange: (id: string | null) => void;
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element) || root.current?.contains(target)) return;
      if (target.closest('[role="dialog"]')) return;
      onOpenChange(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onOpenChange(null);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key);
    };
  }, [open, onOpenChange]);
  const value = useMemo(
    () => ({ open, toggle: (id: string) => onOpenChange(open === id ? null : id) }),
    [open, onOpenChange],
  );
  return (
    <Context.Provider value={value}>
      <div
        ref={root}
        className={cn('flex flex-wrap items-start justify-end gap-x-5 gap-y-2', className)}
      >
        {children}
      </div>
    </Context.Provider>
  );
}

/** The room an open list of `rows` rows needs under the row, px. */
FilterRow.room = (rows: number) => (rows > 0 ? Math.ceil(rows * ROW) + 8 : 0);

/**
 * ONE FILTER of a `FilterRow`: `Label: [ value ]` and, hanging exactly under the value, its list
 * (`children` — a compact `CascadeList` opened by `useFilterOpen(id)`). `after` stands after the
 * value in the row (`FilterFaces`).
 */
export function FilterItem({
  id,
  label,
  value,
  after,
  children,
}: {
  id: string;
  label?: string;
  value: string;
  after?: ReactNode;
  children: ReactNode;
}) {
  const { open, toggle } = useContext(Context);
  const on = open === id;
  return (
    <div className='grid grid-cols-[auto_auto_auto] items-center gap-x-1'>
      <button
        type='button'
        aria-expanded={on}
        onClick={() => toggle(id)}
        className='group/filter col-span-2 grid cursor-pointer grid-cols-subgrid items-baseline whitespace-nowrap focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink'
      >
        <span
          className={cn(
            'text-micro transition-colors duration-500 ease-soft group-hover/filter:text-ink',
            on ? 'text-ink' : 'text-placeholder',
          )}
        >
          {label ? `${label}:` : ''}
        </span>
        <span className='text-textBaseSize text-ink'>[ {value} ]</span>
      </button>
      <span className={after ? 'ml-1 flex items-center' : 'flex items-center'}>{after}</span>
      {/* No room of its own: the list hangs under the value and overflows. */}
      <div className='col-start-2 h-0 w-0'>
        <div className='w-max pt-1'>{children}</div>
      </div>
    </div>
  );
}

/** Whether the filter `id` of the surrounding `FilterRow` is open, and its toggle. */
export function useFilterOpen(id: string) {
  const { open, toggle } = useContext(Context);
  return { open: open === id, toggle: () => toggle(id) };
}

/**
 * THE FACES beside a people filter: overlapping circles with initials, each a filter of its own —
 * a click narrows to that person (again: everybody), the full name shows on hover — and a grey
 * chevron circle that opens the whole list (`id` of the filter it belongs to).
 */
export function FilterFaces({
  id,
  names,
  value,
  onChange,
  max = 4,
}: {
  id: string;
  names: readonly string[];
  /** The chosen person; `undefined` = everybody. */
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  max?: number;
}) {
  const { open, toggle } = useContext(Context);
  const faces = names.filter((n) => !!n.trim()).slice(0, max);
  return (
    <>
      {faces.map((name, i) => (
        <button
          key={name}
          type='button'
          aria-pressed={value === name}
          aria-label={`only ${name}`}
          onClick={() => onChange(value === name ? undefined : name)}
          className={cn(
            'relative cursor-pointer transition-opacity duration-500 ease-soft hover:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink',
            i > 0 && '-ml-1.5',
            value !== undefined && value !== name && 'opacity-40',
          )}
        >
          <Avatar name={name} size={20} title={name} className='ring-1 ring-bgColor' />
        </button>
      ))}
      <button
        type='button'
        aria-label='everybody'
        aria-expanded={open === id}
        onClick={() => toggle(id)}
        className={cn(
          'relative grid size-5 cursor-pointer place-items-center text-labelDark',
          faces.length > 0 && '-ml-1.5',
        )}
      >
        <svg aria-hidden='true' viewBox='0 0 20 20' className='absolute inset-0 text-pinOff'>
          <circle cx='10' cy='10' r='9.5' fill='currentColor' stroke='white' />
        </svg>
        <Iconoir
          name='nav-arrow-down'
          strokeWidth={1.8}
          className={cn(
            'relative size-3 transition-transform duration-700 ease-soft',
            open === id && 'rotate-180',
          )}
        />
      </button>
    </>
  );
}
