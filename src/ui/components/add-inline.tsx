import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { cn } from 'lib/utility';
import { Iconoir } from '../icons/iconoir';

const ICON =
  'grid size-5 shrink-0 cursor-pointer place-items-center transition-colors duration-500 ease-soft disabled:cursor-default';
/** Both halves move as one: a column that grows from nothing to its own width, never a jump. */
const SLIDE =
  'grid transition-[grid-template-columns,opacity] duration-1000 ease-soft motion-reduce:transition-none';

/**
 * «ADD CATEGORY +» — the inline door of a tab row (owner frame `button-liquid-boards`): at rest a
 * 12px `placeholder` word with `+`; under the pointer it turns ink; a click stretches it open
 * toward the row's free side into `× name ✓`. The word folds to nothing while the field grows to
 * its own width (one second, soft ease — a real width, so nothing jumps), and back. `×` throws the
 * typed name away, `✓` (ink once something is typed) or Enter saves it. It stands at the right
 * edge of its row and grows leftward.
 */
export function AddInline({
  label,
  placeholder = 'Custom Name',
  onSubmit,
  busy,
  className,
}: {
  /** «Add Category», «Add New Board». */
  label: string;
  placeholder?: string;
  /** Resolves when the name is saved; a rejection keeps the field open. */
  onSubmit: (name: string) => void | Promise<unknown>;
  busy?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) field.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(false);
    setName('');
  };
  const typed = name.trim();
  const save = () => {
    if (!typed || busy) return;
    void Promise.resolve(onSubmit(typed)).then(close, () => undefined);
  };
  return (
    <div className={cn('flex h-7.5 min-w-0 items-center justify-end text-textBaseSize', className)}>
      <div
        className={cn(SLIDE, open ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0')}
        aria-hidden={!open}
        inert={!open}
      >
        <div className='flex min-w-0 items-center gap-1.5 overflow-hidden'>
          <button
            type='button'
            aria-label='discard'
            title='discard'
            onClick={close}
            className={cn(ICON, 'text-placeholder hover:text-ink')}
          >
            <Iconoir name='xmark' strokeWidth={1.6} className='size-3' />
          </button>
          <input
            ref={field}
            value={name}
            aria-label={label}
            placeholder={placeholder}
            autoComplete='off'
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            onBlur={() => !typed && close()}
            className='h-7.5 w-36 shrink-0 border-0 bg-transparent p-0 text-textBaseSize text-ink outline-none placeholder:text-placeholder'
          />
          <button
            type='button'
            aria-label='save'
            title='save'
            disabled={!typed || busy}
            onClick={save}
            className={cn(ICON, typed ? 'text-ink' : 'text-placeholder', busy && 'animate-pulse')}
          >
            <Iconoir name='check' strokeWidth={1.6} className='size-3' />
          </button>
        </div>
      </div>
      <div
        className={cn(SLIDE, open ? 'grid-cols-[0fr] opacity-0' : 'grid-cols-[1fr] opacity-100')}
        inert={open}
      >
        <button
          type='button'
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className='min-w-0 cursor-pointer overflow-hidden whitespace-nowrap text-placeholder transition-colors duration-500 ease-soft hover:text-ink'
        >
          {label}&ensp;+
        </button>
      </div>
    </div>
  );
}
