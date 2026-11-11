import { cn } from 'lib/utility';
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react';
import { Button, Iconoir, type IconoirName, Input } from 'ui';

const ICON_BUTTON =
  'grid size-7 shrink-0 cursor-pointer place-items-center text-placeholder transition-colors duration-500 ease-soft hover:text-ink disabled:text-titleOff';

function HeadIcon({ name }: { name: IconoirName }) {
  return <Iconoir name={name} strokeWidth={1.8} className='size-5' />;
}

export type HeadSearch = {
  open: boolean;
  query: string;
  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
};

/**
 * The title row of the employees screen (the Models pool / taskboard head): the back arrow while a
 * person is open, the search glass, the 32px title, `+` (a new person at once), and the filters at
 * the right end. The glass turns the title into the search field (same 32px, «Search» in grey); the
 * filters slide away while it is open; Esc, or leaving it empty, closes it.
 */
export function EmployeeHead({
  title,
  search,
  onSearch,
  onBack,
  onAdd,
  filter,
}: {
  title: string;
  search: HeadSearch;
  /** Instead of opening the field here (an open person: back to the board, search there). */
  onSearch?: () => void;
  onBack?: () => void;
  onAdd?: () => void;
  filter?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const searching = search.open && !onSearch;
  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);
  const close = () => {
    search.setQuery('');
    search.setOpen(false);
  };
  return (
    <div className='relative flex min-h-11 flex-wrap items-center gap-x-3 gap-y-3 md:flex-nowrap'>
      {onBack && (
        <Button
          type='button'
          variant='default'
          aria-label='back to employees'
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
        onClick={() => {
          if (onSearch) return onSearch();
          if (searching) close();
          else search.setOpen(true);
        }}
        className={cn(ICON_BUTTON, searching && 'text-ink')}
      >
        <HeadIcon name='search' />
      </Button>
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        {searching ? (
          <Input
            ref={input}
            name='employees-search'
            value={search.query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => search.setQuery(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              close();
            }}
            onBlur={() => {
              if (!search.query.trim()) close();
            }}
            placeholder='Search'
            aria-label='search by name or role'
            autoComplete='off'
            className='h-auto min-h-0 min-w-0 flex-1 border-0 bg-transparent p-0 text-display leading-[1.15] text-ink placeholder:text-placeholder focus:border-0'
          />
        ) : (
          <h1 className='min-w-0 truncate text-display leading-[1.15] text-ink'>{title}</h1>
        )}
        {onAdd && (
          <Button
            type='button'
            variant='default'
            aria-label='new employee'
            title='new employee'
            onClick={onAdd}
            className={ICON_BUTTON}
          >
            <HeadIcon name='plus' />
          </Button>
        )}
      </div>
      {filter && (
        <div
          aria-hidden={searching || undefined}
          className={cn(
            'flex shrink-0 items-center transition-[opacity,translate] duration-700 ease-soft motion-reduce:transition-none',
            searching && 'pointer-events-none translate-x-10 opacity-0',
          )}
        >
          {filter}
        </div>
      )}
    </div>
  );
}
