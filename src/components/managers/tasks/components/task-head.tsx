import { cn } from 'lib/utility';
import { type ReactNode, useEffect, useRef } from 'react';
import { Button, Iconoir, type IconoirName, Input } from 'ui';

const ICON_BUTTON =
  'grid size-7 shrink-0 cursor-pointer place-items-center text-placeholder transition-colors duration-500 ease-soft hover:text-ink disabled:text-titleOff';

function HeadIcon({ name }: { name: IconoirName }) {
  return <Iconoir name={name} strokeWidth={1.8} className='size-5' />;
}

export type TaskHeadSearch = {
  open: boolean;
  value: string;
  setOpen: (open: boolean) => void;
  setValue: (value: string) => void;
  clear: () => void;
};

/**
 * The title row of the taskboard (the Models pool head): the back arrow while a task is open, the
 * search glass, the 32px title («Taskboard» / «Task Info» / «New Task»), `+` (a new task), and the
 * priority filter at the right end. The glass turns the title into the search field (same 32px,
 * «Search» in grey); Esc, or leaving it empty, closes it.
 */
export function TaskHead({
  title,
  search,
  onBack,
  onAdd,
  filter,
}: {
  title: string;
  search: TaskHeadSearch;
  onBack?: () => void;
  onAdd?: () => void;
  filter?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const searching = search.open;
  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);
  const close = () => {
    search.clear();
    search.setOpen(false);
  };
  return (
    <div className='flex min-h-11 flex-wrap items-center gap-x-3 gap-y-3 md:flex-nowrap'>
      {onBack && (
        <Button
          type='button'
          variant='default'
          aria-label='back to the taskboard'
          title='back'
          onClick={onBack}
          className={cn(ICON_BUTTON, 'text-ink hover:text-labelDark')}
        >
          <HeadIcon name='arrow-left' />
        </Button>
      )}
      <Button
        type='button'
        variant='default'
        aria-label='search'
        aria-expanded={searching}
        title='search'
        onClick={() => (searching ? close() : search.setOpen(true))}
        className={cn(ICON_BUTTON, searching && 'text-ink')}
      >
        <HeadIcon name='search' />
      </Button>
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        {searching ? (
          <Input
            ref={input}
            name='task-search'
            value={search.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => search.setValue(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              close();
            }}
            onBlur={() => {
              if (!search.value.trim()) close();
            }}
            placeholder='Search'
            aria-label='search tasks'
            autoComplete='off'
            className='h-auto min-h-0 min-w-0 flex-1 border-0 bg-transparent p-0 text-display leading-[1.15] text-ink placeholder:text-placeholder focus:border-0'
          />
        ) : (
          <h1 className='min-w-0 truncate text-display leading-[1.15] text-ink'>{title}</h1>
        )}
        {onAdd && !searching && (
          <Button
            type='button'
            variant='default'
            aria-label='new task'
            title='new task'
            onClick={onAdd}
            className={ICON_BUTTON}
          >
            <HeadIcon name='plus' />
          </Button>
        )}
      </div>
      {filter && <div className='flex shrink-0 items-center'>{filter}</div>}
    </div>
  );
}
