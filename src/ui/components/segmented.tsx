import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';

import { cn } from 'lib/utility';

export type SegmentedItem<T extends string> = { value: T; label: string };

/**
 * ONE SLIDING FILL PER ROW. A row of 2+ containers has no fill by default; under the pointer one
 * shared element takes the hovered container's place and SLIDES from container to container (left
 * and width on the soft ease), and fades out when the pointer leaves. `rest` is where it stands
 * with no pointer (a choice row's pinned option), or nowhere.
 */
function useSlidingFill(rest: number) {
  const row = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const target = hover ?? (rest >= 0 ? rest : null);

  const place = useCallback(() => {
    const el =
      target == null ? null : (row.current?.children[target + 1] as HTMLElement | undefined);
    setBox((prev) => {
      if (!el) return prev; // keep the last place, so a fade-out does not jump
      const next = { left: el.offsetLeft, width: el.offsetWidth };
      return prev && prev.left === next.left && prev.width === next.width ? prev : next;
    });
  }, [target]);

  useLayoutEffect(() => {
    place();
    const node = row.current;
    if (!node) return;
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [place]);

  return { row, hover, setHover, box, shown: target != null };
}

const FILL =
  'pointer-events-none absolute inset-y-0 transition-[left,width,opacity] duration-500 ease-soft motion-reduce:transition-none';
const CELL =
  'relative z-10 h-8.25 min-w-0 truncate px-2 text-textBaseSize transition-colors duration-500 ease-soft focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-highlightColor';

/**
 * A choice row of the fill system (Lekalo): equal 33px containers, 2px apart, no fill at rest. The
 * grey (`segOff`) fill slides under the pointer; a click PINS the choice (the fill stays on it, its
 * text ink) and a click on the pinned one UNPINS it (`onChange('')`). `error` rules the row red.
 * For a record's value (a model's gender); a view preference is `ViewSwitch`; immediate actions are
 * `ButtonRow`.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  error,
  disabled,
  className,
}: {
  items: readonly SegmentedItem<T>[];
  value: T | '' | null | undefined;
  /** `''` = the pinned choice was pressed again. */
  onChange: (next: T | '') => void;
  /** Announced as the group name: «gender». */
  label: string;
  error?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const chosen = items.findIndex((i) => i.value === value);
  const { row, hover, setHover, box, shown } = useSlidingFill(chosen);
  return (
    <div
      ref={row}
      role='group'
      aria-label={label}
      aria-invalid={error || undefined}
      onPointerLeave={() => setHover(null)}
      className={cn('relative grid gap-0.5', error && 'border-b border-error', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden='true'
        className={cn(FILL, 'bg-segOff', shown && box ? 'opacity-100' : 'opacity-0')}
        style={box ? { left: box.left, width: box.width } : undefined}
      />
      {items.map((item, i) => {
        const on = i === chosen;
        return (
          <button
            key={item.value}
            type='button'
            aria-pressed={on}
            disabled={disabled}
            onPointerEnter={() => !disabled && setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(on ? '' : item.value)}
            className={cn(
              CELL,
              'cursor-pointer disabled:cursor-not-allowed',
              on || hover === i ? 'text-ink' : 'text-placeholder',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export type ButtonRowItem = {
  key: string;
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Announced while it works («saving»); the label stays. */
  busy?: boolean;
};

/**
 * A row of immediate actions (the system pair Cancel / Save): 33px containers, 5px apart, white at
 * rest. Under the pointer an ink fill with white text slides from container to container; nothing
 * pins — a click acts at once. A disabled container takes no fill.
 */
export function ButtonRow({
  items,
  label,
  className,
}: {
  items: readonly ButtonRowItem[];
  label: string;
  className?: string;
}) {
  const { row, hover, setHover, box, shown } = useSlidingFill(-1);
  const live = hover != null && !items[hover]?.disabled;
  return (
    <div
      ref={row}
      role='group'
      aria-label={label}
      onPointerLeave={() => setHover(null)}
      className={cn('relative grid gap-1.25', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden='true'
        className={cn(FILL, 'bg-ink', shown && live && box ? 'opacity-100' : 'opacity-0')}
        style={box ? { left: box.left, width: box.width } : undefined}
      />
      {items.map((item, i) => (
        <button
          key={item.key}
          type='button'
          disabled={item.disabled}
          aria-busy={item.busy || undefined}
          onPointerEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          onClick={item.onClick}
          className={cn(
            CELL,
            'cursor-pointer disabled:cursor-not-allowed disabled:text-placeholder',
            hover === i && !item.disabled ? 'text-bgColor' : 'text-ink',
            item.busy && 'animate-pulse',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export type LiquidTabItem<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

/**
 * LIQUID TABS — the row mechanic of `Segmented` / `ButtonRow`, with an UNDERLINE instead of a fill
 * (owner: «плавающая заливка контейнеров, только вместо заливки — перетекает подчеркивание»). The
 * tabs are 12px `placeholder` words; the chosen one is `labelDark`. One shared rule stands under
 * the chosen tab, flows to the tab under the pointer (left and width on the soft ease) and flows
 * back when the pointer leaves. `end` is a slot after the tabs, pushed to the right edge.
 */
export function LiquidTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  end,
  className,
}: {
  items: readonly LiquidTabItem<T>[];
  value: T | null | undefined;
  onChange: (next: T) => void;
  /** Announced as the tablist name: «boards». */
  label: string;
  end?: ReactNode;
  className?: string;
}) {
  const chosen = items.findIndex((i) => i.value === value);
  const { row, hover, setHover, box, shown } = useSlidingFill(chosen);
  return (
    <div className={cn('flex min-w-0 items-center', className)}>
      <div
        ref={row}
        role='tablist'
        aria-label={label}
        onPointerLeave={() => setHover(null)}
        className='relative flex min-w-0 items-center overflow-hidden'
      >
        <span
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute bottom-0 h-px bg-titleMuted transition-[left,width,opacity] duration-500 ease-soft motion-reduce:transition-none',
            shown && box ? 'opacity-100' : 'opacity-0',
          )}
          style={box ? { left: box.left, width: box.width } : undefined}
        />
        {items.map((item, i) => {
          const on = i === chosen;
          return (
            <button
              key={item.value}
              type='button'
              role='tab'
              aria-selected={on}
              disabled={item.disabled}
              onPointerEnter={() => !item.disabled && setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onChange(item.value);
              }}
              className={cn(
                'relative z-10 h-7.5 shrink-0 cursor-pointer px-2 text-textBaseSize whitespace-nowrap transition-colors duration-500 ease-soft focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-highlightColor disabled:cursor-default',
                on || hover === i ? 'text-labelDark' : 'text-placeholder',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {end && <div className='ml-auto flex min-w-0 shrink items-center pl-4'>{end}</div>}
    </div>
  );
}
