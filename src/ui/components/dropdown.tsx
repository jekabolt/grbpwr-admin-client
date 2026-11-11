import * as Popover from '@radix-ui/react-popover';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from 'lib/utility';
import { Iconoir } from '../icons/iconoir';

export type DropdownOption = {
  value: string;
  label: ReactNode;
  /** Right-aligned quiet text of the row (a task's status). */
  meta?: ReactNode;
  /** What the search matches when `label` is not a string. */
  text?: string;
  disabled?: boolean;
};

const ROW =
  'flex h-8.25 w-full min-w-0 shrink-0 cursor-pointer items-center justify-between gap-3 px-2 text-left text-textBaseSize transition-colors duration-500 ease-soft motion-reduce:transition-none';

function optionText(o: DropdownOption): string {
  if (o.text != null) return o.text;
  return typeof o.label === 'string' ? o.label : String(o.value);
}

/**
 * THE MAIN DROPDOWN of the fill system (owner: «новый вид DropDown меню … мейн дропдаун везде»).
 *
 * Closed: a `LineField`-like 33px line — the label in `placeholder` grey at the left and a grey
 * iconoir `+` at the right; a chosen value stands at the left in ink and the label steps to the
 * right, before the `+`. Open: the header row turns ink (label + `×` close, an ink rule under it)
 * and the list slides open below it (grid-rows 0fr → 1fr on the soft ease, none under reduced
 * motion), pushing what follows — the list fills its column. Rows are 12px `placeholder`; the
 * hovered / active / chosen row takes the `fieldFill` ground and ink text. An optional quiet text
 * stands at the row's right (`meta`), an optional last row «+ Add …» is grey.
 *
 * Single choice closes the list; `multiple` toggles and stays open. `searchable` turns the open
 * header into a filter field. Keys: ↑ ↓ move, Enter picks, Esc closes (and goes no further, so a
 * page that closes on Esc keeps its panel). A pointer down outside closes it.
 *
 * `floating` puts the open list in a popover anchored to the trigger instead of pushing content
 * (a tile's status). `trigger` is then the closed look. `children` replaces the option list with
 * a body of its own (a calendar).
 */
export function Dropdown({
  label,
  options = [],
  value,
  onChange,
  deselectable,
  multiple,
  values,
  onValuesChange,
  display,
  addLabel,
  onAdd,
  searchable,
  query: queryProp,
  onQueryChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  floating,
  trigger,
  children,
  emptyLabel,
  disabled,
  error,
  id,
  className,
}: {
  /** The field's name: «Status», «Assignees». */
  label: string;
  options?: readonly DropdownOption[];
  value?: string | null;
  /** `null` only with `deselectable`: the chosen row was pressed again. */
  onChange?: (next: string | null) => void;
  deselectable?: boolean;
  multiple?: boolean;
  values?: readonly string[];
  onValuesChange?: (next: string[]) => void;
  /** The closed line's value text; defaults to the chosen labels, joined. */
  display?: ReactNode;
  /** The grey last row «+ Add …»; gets the typed filter text. */
  addLabel?: string;
  onAdd?: (query: string) => void;
  searchable?: boolean;
  /** Controlled filter text (a caller that pages the list). */
  query?: string;
  onQueryChange?: (query: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  floating?: boolean;
  /** Floating only: the closed look (a bracketed word on a tile). */
  trigger?: ReactNode;
  /** A body of its own instead of the option rows. */
  children?: ReactNode;
  /** Shown in the list when there is nothing to pick. */
  emptyLabel?: string;
  disabled?: boolean;
  /** The closed rule turns red. */
  error?: boolean;
  id?: string;
  className?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const isOpen = openProp ?? ownOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOwnOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const [ownQuery, setOwnQuery] = useState('');
  const query = queryProp ?? ownQuery;
  const setQuery = (next: string) => {
    if (queryProp === undefined) setOwnQuery(next);
    onQueryChange?.(next);
  };
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const isChosen = useCallback(
    (v: string) => (multiple ? !!values?.includes(v) : v === value),
    [multiple, values, value],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((o) => optionText(o).toLowerCase().includes(q));
  }, [options, query, searchable]);
  const rows = shown.length + (onAdd ? 1 : 0);

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, [setOpen]);

  // A pointer down outside closes an inline list (a floating one has Radix for that).
  useEffect(() => {
    if (!isOpen || floating) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && root.current?.contains(t)) return;
      // A portalled layer opened from inside (a calendar's month menu) is still inside.
      if (t instanceof Element && t.closest('[data-radix-popper-content-wrapper]')) return;
      close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [isOpen, floating, close]);

  // Opening puts the keys in the list (or its filter).
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      if (searchable) search.current?.focus({ preventScroll: true });
      else if (!children) list.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, searchable, children]);

  const pick = (o: DropdownOption) => {
    if (o.disabled) return;
    if (multiple) {
      const now = values ?? [];
      onValuesChange?.(
        now.includes(o.value) ? now.filter((v) => v !== o.value) : [...now, o.value],
      );
      return;
    }
    if (o.value === value) {
      if (deselectable) onChange?.(null);
    } else onChange?.(o.value);
    close();
  };

  const onKeys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (children) return;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows > 0) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a < 0 ? (step > 0 ? 0 : rows - 1) : (a + step + rows) % rows));
    } else if (e.key === 'Enter' && !(e.nativeEvent as globalThis.KeyboardEvent).isComposing) {
      // Never the surrounding form's submit: Enter belongs to the list while it is open.
      e.preventDefault();
      if (active >= 0 && active < shown.length) pick(shown[active]);
      else if (active >= shown.length || (active < 0 && shown.length === 0)) onAdd?.(query.trim());
      else if (active < 0 && shown.length === 1) pick(shown[0]);
    }
  };

  // Keep the active row in view.
  useEffect(() => {
    if (active < 0) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-row="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const chosenLabels = multiple
    ? options.filter((o) => values?.includes(o.value)).map((o) => o.label)
    : options.filter((o) => o.value === value).map((o) => o.label);
  const summary =
    display ??
    (chosenLabels.length > 0
      ? chosenLabels.map((l, i) => (
          <span key={i}>
            {i > 0 && ', '}
            {l}
          </span>
        ))
      : null);
  const hasValue = summary != null && summary !== '' && summary !== false;

  const header = (
    <div
      className={cn(
        'relative flex h-8.25 min-w-0 items-center gap-2 border-b px-2 text-textBaseSize',
        'transition-colors duration-500 ease-soft motion-reduce:transition-none',
        isOpen ? 'border-ink' : error ? 'border-error' : 'border-placeholder',
      )}
    >
      {isOpen && searchable ? (
        <input
          ref={search}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeys}
          placeholder={label}
          aria-label={label}
          aria-controls={listId}
          autoComplete='off'
          className='h-full min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent p-0 text-textBaseSize text-ink caret-ink outline-none placeholder:text-ink'
        />
      ) : (
        <button
          type='button'
          disabled={disabled}
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={() => (isOpen ? close() : setOpen(true))}
          className='flex h-full min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ink disabled:cursor-default'
        >
          {isOpen ? (
            <span className='min-w-0 truncate text-ink'>{label}</span>
          ) : hasValue ? (
            <>
              <span className='min-w-0 flex-1 truncate text-ink'>{summary}</span>
              <span className='shrink-0 truncate text-placeholder'>{label}</span>
            </>
          ) : (
            <span className='min-w-0 flex-1 truncate text-placeholder'>{label}</span>
          )}
        </button>
      )}
      <button
        type='button'
        tabIndex={isOpen ? 0 : -1}
        disabled={disabled}
        aria-label={isOpen ? `close ${label.toLowerCase()}` : `open ${label.toLowerCase()}`}
        onClick={() => (isOpen ? close() : setOpen(true))}
        className={cn(
          'grid size-4 shrink-0 cursor-pointer place-items-center transition-colors duration-500 ease-soft disabled:cursor-default',
          isOpen ? 'text-ink' : 'text-placeholder hover:text-ink',
        )}
      >
        <Iconoir name={isOpen ? 'xmark' : 'plus'} strokeWidth={1.6} className='size-3' />
      </button>
    </div>
  );

  const body = children ? (
    <div className='flex flex-col'>{children}</div>
  ) : (
    <div
      ref={list}
      id={listId}
      role='listbox'
      aria-label={label}
      aria-multiselectable={multiple || undefined}
      tabIndex={-1}
      onKeyDown={onKeys}
      onPointerLeave={() => setActive(-1)}
      className='flex max-h-72 flex-col overflow-y-auto outline-none'
    >
      {shown.map((o, i) => {
        const chosen = isChosen(o.value);
        const lit = chosen || active === i;
        return (
          <button
            key={o.value}
            type='button'
            role='option'
            data-row={i}
            tabIndex={-1}
            aria-selected={chosen}
            disabled={o.disabled}
            onPointerEnter={() => setActive(i)}
            onClick={() => pick(o)}
            className={cn(
              ROW,
              lit ? 'bg-fieldFill text-ink' : 'text-placeholder',
              o.disabled && 'cursor-default opacity-50',
            )}
          >
            <span className='min-w-0 truncate'>{o.label}</span>
            {o.meta != null && (
              <span className={cn('shrink-0 truncate', lit ? 'text-ink' : 'text-placeholder')}>
                {o.meta}
              </span>
            )}
          </button>
        );
      })}
      {shown.length === 0 && !onAdd && (
        <span className={cn(ROW, 'cursor-default text-placeholder')}>{emptyLabel ?? '—'}</span>
      )}
      {onAdd && addLabel && (
        <button
          type='button'
          data-row={shown.length}
          tabIndex={-1}
          onPointerEnter={() => setActive(shown.length)}
          onClick={() => onAdd(query.trim())}
          className={cn(
            ROW,
            'justify-start gap-2',
            active === shown.length ? 'bg-fieldFill text-ink' : 'text-placeholder',
          )}
        >
          <Iconoir name='plus' strokeWidth={1.6} className='size-3' />
          <span className='min-w-0 truncate'>{addLabel}</span>
        </button>
      )}
    </div>
  );

  if (floating) {
    return (
      <Popover.Root open={isOpen} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <Popover.Trigger asChild disabled={disabled}>
          {trigger ?? (
            <button type='button' className='cursor-pointer text-textBaseSize text-ink'>
              {label}
            </button>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align='end'
            sideOffset={4}
            onKeyDown={onKeys}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className='z-[var(--z-popover)] w-56 bg-bgColor shadow-[var(--shadow-popover)] focus:outline-none'
          >
            <div ref={root} id={id} className={cn('flex flex-col pb-1', className)}>
              {header}
              {body}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <div ref={root} id={id} className={cn('flex min-w-0 flex-col', className)}>
      {header}
      <div
        inert={!isOpen}
        className='grid transition-[grid-template-rows] duration-700 ease-soft motion-reduce:transition-none'
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className='min-h-0 overflow-hidden'>
          <div className={cn('flex flex-col', !children && 'border-b border-placeholder')}>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
