import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { cn } from 'lib/utility';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

// One resolved, pickable entity row.
export interface EntityOption {
  value: number | string;
  label: string;
  sublabel?: string;
  thumbnail?: string;
}

// Per-entity behaviour. `server` entities filter on the backend (search(q) hits
// the RPC); `client` entities load a page once and filter in memory.
export interface EntityConfig {
  kind: string;
  empty: number | string; // 0 or ''
  searchPlaceholder: string;
  emptyResult: string;
  mode: 'server' | 'client';
  load: (q: string) => Promise<EntityOption[]>;
  resolve: (value: number | string) => Promise<EntityOption | null>;
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function isEmpty(value: number | string, empty: number | string) {
  return value === empty || value === 0 || value === '';
}

// Searchable, portalled entity typeahead. The results panel is a Radix Popover
// rendered through a Portal (modal=false) so it escapes the create/edit modal's
// overflow/stacking context instead of being clipped. Interact-outside is
// guarded so typing in the input doesn't dismiss the results.
export function EntityPicker({
  value,
  onChange,
  config,
}: {
  value: number | string;
  onChange: (value: number | string) => void;
  config: EntityConfig;
}) {
  const has = !isEmpty(value, config.empty);
  const [picked, setPicked] = useState<EntityOption | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dq = useDebounced(query.trim());

  const { data: resolved } = useQuery({
    queryKey: ['tasks', 'picker', config.kind, 'resolve', value],
    enabled: has && !(picked && picked.value === value),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => config.resolve(value),
  });
  const selected: EntityOption | null = has
    ? picked && picked.value === value
      ? picked
      : resolved ?? null
    : null;

  const { data: loaded = [], isFetching } = useQuery({
    queryKey: ['tasks', 'picker', config.kind, 'load', config.mode === 'server' ? dq : ''],
    enabled: open,
    staleTime: 30_000,
    retry: false,
    queryFn: () => config.load(config.mode === 'server' ? dq : ''),
  });

  const results =
    config.mode === 'client' && dq
      ? loaded.filter((o) => {
          const hay = `${o.label} ${o.sublabel ?? ''}`.toLowerCase();
          return hay.includes(dq.toLowerCase());
        })
      : loaded;

  function choose(o: EntityOption) {
    setPicked(o);
    onChange(o.value);
    setOpen(false);
    setQuery('');
  }

  function clear() {
    setPicked(null);
    onChange(config.empty);
  }

  return (
    <div className='flex flex-col gap-1.5' ref={rootRef}>
      {selected && (
        <div className='flex items-center gap-2 border border-textInactiveColor p-1.5'>
          {selected.thumbnail && (
            <img
              src={selected.thumbnail}
              alt=''
              className='h-8 w-8 shrink-0 border border-textInactiveColor object-cover'
            />
          )}
          <div className='min-w-0 flex-1'>
            <Text size='small' className='truncate'>
              {selected.label}
            </Text>
            {selected.sublabel && (
              <Text variant='inactive' size='small' className='truncate'>
                {selected.sublabel}
              </Text>
            )}
          </div>
          <button
            type='button'
            aria-label='clear link'
            onClick={clear}
            className='shrink-0 px-1 text-labelColor hover:text-textColor'
          >
            ✕
          </button>
        </div>
      )}

      <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
        <Popover.Anchor asChild>
          <div>
            <Input
              name={`${config.kind}-search`}
              aria-label={config.searchPlaceholder}
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={selected ? 'change…' : config.searchPlaceholder}
            />
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align='start'
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // Keep results open while interacting with our own input/rows.
              if (rootRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
            className='z-[var(--z-popover)] max-h-60 w-[var(--radix-popover-trigger-width)] overflow-auto border border-textInactiveColor bg-bgColor'
          >
            {isFetching && results.length === 0 ? (
              <Text variant='inactive' size='small' className='block p-2'>
                searching…
              </Text>
            ) : results.length === 0 ? (
              <Text variant='inactive' size='small' className='block p-2'>
                {config.emptyResult}
              </Text>
            ) : (
              results.map((o) => (
                <button
                  key={String(o.value)}
                  type='button'
                  onClick={() => choose(o)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-textInactiveColor p-1.5 text-left last:border-b-0 hover:bg-black/[0.04]',
                    o.value === value && 'bg-black/[0.06]',
                  )}
                >
                  {o.thumbnail && (
                    <img
                      src={o.thumbnail}
                      alt=''
                      className='h-8 w-8 shrink-0 border border-textInactiveColor object-cover'
                    />
                  )}
                  <div className='min-w-0'>
                    <Text size='small' className='truncate'>
                      {o.label}
                    </Text>
                    {o.sublabel && (
                      <Text variant='inactive' size='small' className='truncate'>
                        {o.sublabel}
                      </Text>
                    )}
                  </div>
                </button>
              ))
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
