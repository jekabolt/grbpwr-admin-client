import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { cn } from 'lib/utility';

/** Rows a wheel shows: the centre one is the choice. */
const ROWS = 5;
/** The years the year wheel holds. */
const FIRST_YEAR = 2022;
const LAST_YEAR = 2099;
/** How many times the months are repeated, so the wheel has no end in either direction. */
const TURNS = 41;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The two sizes: `wide` on a wide tile, `compact` on a compact tile, in a panel, under a filter. */
const SIZES = {
  wide: { row: 40, text: 'text-head', off: 'text-titleOff', year: 'w-22', month: 'w-40', gap: 24 },
  compact: {
    row: 24,
    text: 'text-textBaseSize',
    off: 'text-placeholder',
    year: 'w-12',
    month: 'w-20',
    gap: 12,
  },
} as const;
type Look = (typeof SIZES)[keyof typeof SIZES];

const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** One column opening like a curtain, top to bottom, a step after the one before it. */
function Curtain({
  open,
  order,
  className,
  children,
}: {
  open: boolean;
  order: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 transition-[grid-template-rows,opacity] duration-900 ease-soft motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className,
      )}
      style={{ transitionDelay: open ? `${order * 140}ms` : '0ms' }}
    >
      <div className='min-h-0 overflow-hidden'>{children}</div>
    </div>
  );
}

/**
 * One wheel: a column that scrolls by itself (wheel, trackpad, finger, arrows) and snaps row by
 * row; the row standing in the fixed centre is the choice (ink, in brackets), the rest are grey.
 * Clicking a row brings it to the centre. The scroll position is the value — it is read when the
 * wheel comes to rest. `cyclic` repeats the items so the wheel never ends (December → January):
 * at rest it silently steps back to the middle turn.
 */
function Wheel({
  items,
  index,
  onIndex,
  label,
  look,
  cyclic,
  className,
}: {
  items: readonly string[];
  index: number;
  onIndex: (next: number) => void;
  label: string;
  look: Look;
  cyclic?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rest = useRef<number | undefined>(undefined);
  const n = items.length;
  const home = cyclic ? Math.floor(TURNS / 2) * n : 0;
  const rows = useMemo(
    () => (cyclic ? Array.from({ length: TURNS * n }, (_, i) => items[i % n]) : [...items]),
    [cyclic, items, n],
  );
  // The row at the centre, in `rows` (a cyclic wheel may stand on any turn).
  const at = useRef(home + index);
  const row = look.row;
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    if (at.current % n === index && node.scrollTop > 0) return;
    // The nearest row that shows the new value: never a trip around the whole wheel.
    let target = at.current - (at.current % n) + index;
    if (cyclic && target - at.current > n / 2) target -= n;
    if (cyclic && at.current - target > n / 2) target += n;
    const first = node.scrollTop === 0 && at.current === home + index;
    at.current = target;
    node.scrollTo({ top: target * row, behavior: first ? 'auto' : 'smooth' });
  }, [index, n, row, cyclic, home]);
  // The wheel scrolls itself: a column around it that steps on the wheel must not take the event.
  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const own = (e: WheelEvent) => e.stopPropagation();
    node.addEventListener('wheel', own, { passive: true });
    return () => {
      node.removeEventListener('wheel', own);
      window.clearTimeout(rest.current);
    };
  }, []);
  const settle = useCallback(() => {
    const node = box.current;
    if (!node) return;
    let next = Math.min(rows.length - 1, Math.max(0, Math.round(node.scrollTop / row)));
    if (cyclic) {
      // Back to the middle turn, on the same month, without a visible move.
      const centred = home + (next % n);
      if (centred !== next) {
        next = centred;
        node.scrollTop = next * row;
      }
    }
    if (next === at.current) return;
    at.current = next;
    onIndex(next % n);
  }, [rows.length, row, cyclic, home, n, onIndex]);
  const go = (to: number) => box.current?.scrollTo({ top: to * row, behavior: 'smooth' });
  return (
    <div
      ref={box}
      role='listbox'
      aria-label={label}
      tabIndex={0}
      onScroll={() => {
        window.clearTimeout(rest.current);
        rest.current = window.setTimeout(settle, 90);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        e.stopPropagation();
        const now = Math.round((box.current?.scrollTop ?? 0) / row);
        go(Math.min(rows.length - 1, Math.max(0, now + (e.key === 'ArrowDown' ? 1 : -1))));
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      style={{ height: row * ROWS, paddingBlock: row * ((ROWS - 1) / 2) }}
    >
      {rows.map((item, i) => {
        const on = i % n === index;
        return (
          <button
            key={i}
            type='button'
            role='option'
            tabIndex={-1}
            aria-selected={on}
            onClick={() => go(i)}
            style={{ height: row, lineHeight: `${row}px` }}
            className={cn(
              'block w-full cursor-pointer snap-center text-left whitespace-nowrap transition-colors duration-500 ease-soft',
              look.text,
              on ? 'text-ink' : cn(look.off, 'hover:text-ink'),
            )}
          >
            {on ? `[ ${item} ]` : item}
          </button>
        );
      })}
    </div>
  );
}

/**
 * THE WHEEL DATE PICKER — in-place date settings that open like curtains, top to bottom, one after
 * another (owner: «плавно как шторы сверху вниз по очереди откроются настройки даты … центральный
 * черный фрейм всегда в центре, в него должен зайти нужный выбор даты как в ios, день выбирается по
 * клику как обычный календарь»). Three columns: the YEAR wheel (2022–2099), the MONTH wheel
 * (endless: December runs into January) — each scrolls by itself, the row in the fixed centre is
 * the choice — and the DAYS as a plain grid of seven, the chosen day in brackets.
 *
 * `size`: `wide` — 24px words, 40px rows (a wide tile); `compact` — 12px words, 24px rows (a
 * compact tile, a panel field). Every change calls `onChange` with the whole date; the holder
 * decides when to write it (a tile writes once, when the picker closes).
 */
export function WheelDatePicker({
  open,
  value,
  onChange,
  size = 'wide',
  className,
}: {
  open: boolean;
  /** The date shown; today when there is none yet. */
  value: Date | null | undefined;
  onChange: (next: Date) => void;
  size?: 'wide' | 'compact';
  className?: string;
}) {
  const look = SIZES[size];
  const date = value && !Number.isNaN(value.getTime()) ? value : new Date();
  const year = Math.min(LAST_YEAR, Math.max(FIRST_YEAR, date.getFullYear()));
  const month = date.getMonth();
  const day = date.getDate();
  const years = useMemo(
    () => Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => String(FIRST_YEAR + i)),
    [],
  );
  const put = (y: number, m: number, d: number) =>
    onChange(new Date(y, m, Math.min(d, daysIn(y, m))));
  const count = daysIn(year, month);
  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={cn('flex min-w-0 flex-wrap items-start', className)}
      style={{ columnGap: look.gap }}
    >
      <Curtain open={open} order={0}>
        <Wheel
          label='year'
          look={look}
          items={years}
          index={year - FIRST_YEAR}
          onIndex={(i) => put(FIRST_YEAR + i, month, day)}
          className={look.year}
        />
      </Curtain>
      <Curtain open={open} order={1}>
        <Wheel
          label='month'
          look={look}
          cyclic
          items={MONTHS}
          index={month}
          onIndex={(i) => put(year, i, day)}
          className={look.month}
        />
      </Curtain>
      <Curtain open={open} order={2} className='ml-auto'>
        <div role='grid' aria-label='day' className='grid grid-cols-7'>
          {Array.from({ length: count }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              type='button'
              aria-pressed={d === day}
              onClick={(e) => {
                e.stopPropagation();
                put(year, month, d);
              }}
              style={{ height: look.row, minWidth: look.row, lineHeight: `${look.row}px` }}
              className={cn(
                'cursor-pointer px-0.5 text-center tabular-nums transition-colors duration-500 ease-soft focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-highlightColor',
                look.text,
                d === day ? 'text-ink' : cn(look.off, 'hover:text-ink'),
              )}
            >
              {d === day ? `[${d}]` : d}
            </button>
          ))}
        </div>
      </Curtain>
    </div>
  );
}
