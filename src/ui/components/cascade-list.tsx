import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from 'lib/utility';

export type CascadeOption = { value: string; label: ReactNode; disabled?: boolean };

const WORD =
  'block max-w-full cursor-pointer truncate transition-colors duration-500 ease-soft focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-highlightColor disabled:cursor-default';

/** The two sizes of the list: its trigger's own size. */
const SIZES = {
  /** 24px words, 40px rows: a wide tile. */
  wide: { word: 'text-head leading-10', row: 'max-h-10', off: 'text-titleOff', field: 'h-10' },
  /** 12px words, 24px rows: under a 12px trigger (a board filter, a compact tile). */
  compact: {
    word: 'text-textBaseSize leading-6',
    row: 'max-h-6',
    off: 'text-placeholder',
    field: 'h-6',
  },
} as const;

/**
 * THE CASCADE LIST — an in-place choice that opens like an accordion pulled downward (owner:
 * «каскадной анимацией, как будто разъезжается гармошка вниз раскрываются настройки»). The options
 * stand one per row in the size of the control that opened them (`size`: `wide` = 24px words on a
 * wide tile, `compact` = 12px under a 12px trigger); the chosen one is ink, in brackets —
 * `[ Sourcing ]`. Rows unfold one after another (height and fade on the soft ease, each a step
 * later than the one above), fold back the same way, and the list pushes what follows. `align`
 * puts the words at the side where the trigger stands, so the list is always compact against it.
 *
 * `addLabel` + `onAdd` add a last grey row «+ Add»; pressing it turns the row into a field — Enter
 * hands the typed name over, Esc gives the row back. `multiple` marks every value of `values`.
 */
export function CascadeList({
  open,
  options,
  value,
  values,
  multiple,
  onChange,
  align = 'left',
  size = 'wide',
  addLabel,
  onAdd,
  label,
  className,
}: {
  open: boolean;
  options: readonly CascadeOption[];
  value?: string | null;
  values?: readonly string[];
  multiple?: boolean;
  onChange: (next: string) => void;
  align?: 'left' | 'right';
  size?: 'wide' | 'compact';
  addLabel?: string;
  /** The typed name of a new option. */
  onAdd?: (name: string) => void;
  /** Announced as the list's name: «department». */
  label: string;
  className?: string;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) return;
    setTyping(false);
    setDraft('');
  }, [open]);
  useEffect(() => {
    if (typing) field.current?.focus();
  }, [typing]);
  const right = align === 'right';
  const look = SIZES[size];
  const chosen = (v: string) => (multiple ? !!values?.includes(v) : v === value);
  const rowStyle = (i: number) => ({ transitionDelay: open ? `${i * 55}ms` : '0ms' });
  const rowBox = cn(
    'max-w-full overflow-hidden transition-[max-height,opacity,transform,margin] duration-700 ease-soft motion-reduce:transition-none',
    open ? cn(look.row, 'opacity-100') : 'max-h-0 -translate-y-2 opacity-0',
  );
  const word = cn(WORD, look.word);
  return (
    <div
      role='listbox'
      aria-label={label}
      aria-hidden={!open}
      aria-multiselectable={multiple || undefined}
      inert={!open}
      className={cn(
        'flex min-w-0 flex-col',
        right ? 'items-end text-right' : 'items-start',
        className,
      )}
    >
      {options.map((o, i) => {
        const on = chosen(o.value);
        return (
          <div key={o.value} className={rowBox} style={rowStyle(i)}>
            <button
              type='button'
              role='option'
              aria-selected={on}
              disabled={o.disabled}
              onClick={(e) => {
                e.stopPropagation();
                onChange(o.value);
              }}
              className={cn(word, on ? 'text-ink' : cn(look.off, 'hover:text-ink'))}
            >
              {on ? <>[ {o.label} ]</> : o.label}
            </button>
          </div>
        );
      })}
      {addLabel && onAdd && (
        <div
          className={cn(rowBox, open && (size === 'wide' ? 'mt-3' : 'mt-1'))}
          style={rowStyle(options.length + 1)}
        >
          {typing ? (
            <input
              ref={field}
              value={draft}
              aria-label={addLabel}
              placeholder={addLabel}
              autoComplete='off'
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                e.stopPropagation();
                if (e.key === 'Escape') setTyping(false);
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const name = draft.trim();
                if (!name) return;
                onAdd(name);
                setTyping(false);
                setDraft('');
              }}
              onBlur={() => !draft.trim() && setTyping(false)}
              className={cn(
                'max-w-full border-0 bg-transparent p-0 text-ink outline-none',
                look.field,
                size === 'wide'
                  ? 'w-48 text-head placeholder:text-titleOff'
                  : 'w-28 text-textBaseSize placeholder:text-placeholder',
                right && 'text-right',
              )}
            />
          ) : (
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                setTyping(true);
              }}
              className={cn(word, look.off, 'hover:text-ink')}
            >
              {right ? <>{addLabel}&ensp;+</> : <>+&ensp;{addLabel}</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
