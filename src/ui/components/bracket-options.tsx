import * as Popover from '@radix-ui/react-popover';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from 'lib/utility';
import { CascadeList } from './cascade-list';

export type BracketOption = {
  value: string;
  label: string;
  /** A quiet note after the option (a count): shown on hover, always on the chosen one. */
  meta?: string;
};

function Bracketed({ chosen, children }: { chosen: boolean; children: ReactNode }) {
  return chosen ? <>[ {children} ]</> : <>{children}</>;
}

/**
 * Inline exclusive choice of the fill system (Lekalo): the options stand in a row as 12px
 * `placeholder` words; the chosen one is ink, in brackets — `[ M / 38 ]`. What does not fit the
 * row hides behind `>>` at its end, which opens the whole list as a dropdown exactly as wide as the
 * row; choosing closes it. A chosen option that would fall behind `>>` moves to the front.
 *
 * `ruled` makes it a field row (33px, `ink` rule under it) with a `label` caption at the left and an
 * `end` slot at the right (a `PinToggle`). Bare, with `overflow={false}`, it is the unit switch of a
 * category title.
 */
export function BracketOptions({
  options,
  value,
  onChange,
  ariaLabel,
  label,
  end,
  ruled,
  overflow = true,
  overflowList = 'popover',
  deselectable,
  multiple,
  values,
  onValuesChange,
  className,
}: {
  options: readonly BracketOption[];
  value?: string | null;
  /** `null` only with `deselectable`: the chosen option was pressed again. */
  onChange?: (next: string | null) => void;
  /** Announced as the group name: «tops», «units». */
  ariaLabel: string;
  label?: ReactNode;
  end?: ReactNode;
  ruled?: boolean;
  overflow?: boolean;
  /**
   * Where the whole list behind `>>` opens: `popover` — a dropdown over the content; `cascade` — a
   * compact `CascadeList` under the row, in place, pushing what follows (the Taskboard system).
   */
  overflowList?: 'popover' | 'cascade';
  deselectable?: boolean;
  /** Several chosen at once (sizes): each option toggles; the dropdown stays open. */
  multiple?: boolean;
  values?: readonly string[];
  onValuesChange?: (next: string[]) => void;
  className?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lead, setLead] = useState(false);
  const [open, setOpen] = useState(false);
  const cascade = overflow && overflowList === 'cascade';
  const box = useRef<HTMLDivElement>(null);
  // The in-place list closes on a click outside it and on Esc (it folds back the way it opened).
  useEffect(() => {
    if (!cascade || !open) return undefined;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !box.current?.contains(e.target)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [cascade, open]);

  const isChosen = (v: string) => (multiple ? !!values?.includes(v) : v === value);
  const chosenIndex = multiple ? -1 : options.findIndex((o) => o.value === value);
  // Several chosen: all of them move to the front, in their own order.
  const shown = !lead
    ? options
    : multiple
      ? [...options.filter((o) => isChosen(o.value)), ...options.filter((o) => !isChosen(o.value))]
      : chosenIndex > 0
        ? [options[chosenIndex], ...options.filter((_, i) => i !== chosenIndex)]
        : options;

  // Which options wrapped onto the clipped second line: those are behind `>>`.
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || !overflow) return;
    const measure = () => {
      const items = Array.from(node.children) as HTMLElement[];
      const top = items[0]?.offsetTop ?? 0;
      const hidden = items.filter((el) => el.offsetTop > top);
      setHasMore(hidden.length > 0);
      if (!lead && hidden.some((el) => el.dataset.chosen === 'true')) setLead(true);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [options, value, values, lead, overflow]);

  // A new choice starts from the natural order again.
  useLayoutEffect(() => setLead(false), [value]);

  const choose = (next: string) => {
    if (multiple) {
      const now = values ?? [];
      onValuesChange?.(now.includes(next) ? now.filter((v) => v !== next) : [...now, next]);
      return;
    }
    if (next === value) {
      if (deselectable) onChange?.(null);
    } else onChange?.(next);
    setOpen(false);
  };

  const row = (
    <div
      role='group'
      aria-label={ariaLabel}
      className={cn(
        'flex min-w-0 items-center gap-3 text-textBaseSize',
        ruled && 'h-8.25 border-b border-ink px-2',
        className,
      )}
    >
      {label != null && <span className='w-20 shrink-0 truncate text-placeholder'>{label}</span>}
      <div
        ref={viewport}
        className={cn(
          'flex min-w-0 flex-1 gap-x-3',
          overflow ? 'h-4.5 flex-wrap overflow-hidden' : 'flex-nowrap',
        )}
      >
        {shown.map((o) => {
          const chosen = isChosen(o.value);
          return (
            <button
              key={o.value}
              type='button'
              aria-pressed={chosen}
              data-chosen={chosen}
              onClick={() => choose(o.value)}
              className={cn(
                'group/opt h-4.5 shrink-0 cursor-pointer whitespace-nowrap leading-4.5 transition-colors duration-500 ease-soft focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink',
                chosen ? 'text-ink' : 'text-placeholder hover:text-ink',
              )}
            >
              {/* The count lives INSIDE brackets: chosen «[ All 12 ]», hovered «Men [5]». */}
              {chosen ? (
                <>
                  [ {o.label}
                  {o.meta != null && (
                    <span className='ml-1 text-placeholder tabular-nums'>{o.meta}</span>
                  )}{' '}
                  ]
                </>
              ) : (
                <>
                  {o.label}
                  {o.meta != null && (
                    <span className='ml-1 text-placeholder tabular-nums opacity-0 transition-opacity duration-500 ease-soft group-hover/opt:opacity-100 group-focus-visible/opt:opacity-100 motion-reduce:transition-none'>
                      [{o.meta}]
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
      {cascade && hasMore && (
        <button
          type='button'
          aria-label={`all ${ariaLabel}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'shrink-0 cursor-pointer transition-colors duration-500 ease-soft hover:text-ink',
            open ? 'text-ink' : 'text-placeholder',
          )}
        >
          {'>>'}
        </button>
      )}
      {!cascade && overflow && hasMore && (
        <Popover.Trigger
          aria-label={`all ${ariaLabel}`}
          className='shrink-0 cursor-pointer text-placeholder hover:text-ink data-[state=open]:text-ink'
        >
          {'>>'}
        </Popover.Trigger>
      )}
      {end}
    </div>
  );

  if (!overflow) return row;

  if (cascade)
    return (
      <div ref={box} className='flex min-w-0 flex-col'>
        {row}
        <CascadeList
          label={ariaLabel}
          size='compact'
          open={open && hasMore}
          multiple={multiple}
          options={options.map((o) => ({ value: o.value, label: o.label }))}
          value={value}
          values={values}
          onChange={choose}
          className={cn(
            'transition-[padding] duration-700 ease-soft',
            ruled && (label != null ? 'pl-25' : 'pl-2'),
            open && hasMore ? 'py-1' : 'py-0',
          )}
        />
      </div>
    );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>{row}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align='start'
          sideOffset={0}
          className='z-[var(--z-popover)] max-h-72 w-[var(--radix-popper-anchor-width)] overflow-y-auto border border-ink bg-bgColor text-textBaseSize shadow-[var(--shadow-popover)] focus:outline-none'
        >
          <div role='listbox' aria-label={ariaLabel} className='flex flex-col'>
            {options.map((o) => {
              const chosen = isChosen(o.value);
              return (
                <button
                  key={o.value}
                  type='button'
                  role='option'
                  aria-selected={chosen}
                  onClick={() => choose(o.value)}
                  className={cn(
                    'h-8.25 shrink-0 cursor-pointer border-b border-hairline px-2 text-left last:border-b-0 focus-visible:bg-segOff focus-visible:outline-none',
                    chosen ? 'text-ink' : 'text-placeholder hover:text-ink',
                  )}
                >
                  <Bracketed chosen={chosen}>{o.label}</Bracketed>
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
