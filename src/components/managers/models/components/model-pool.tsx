import type { common_Model } from 'api/proto-http/admin';
import { notify } from 'lib/stores/store';
import { cn } from 'lib/utility';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  CascadeList,
  ConfirmationModal,
  FilterItem,
  FilterRow,
  Iconoir,
  type IconoirName,
  Input,
  SortCount,
  StepRow,
  type StepRowMetrics,
  Text,
} from 'ui';
import { useModelPatch } from './model-meta';
import { ModelTile, NewModelTile } from './model-tile';
import { useDeleteModel, useInfiniteModels, useModelCounts } from './useModelQuery';

export const ALL = 'ALL';
/** Cards on one page of the compact view: 2 rows × 4. */
const PAGE = 8;
const COMPACT_KEY = 'models.pool.compact';

function pagesOf<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/** The compact (4 × 2) view on or off, remembered in this browser. */
function useCompactView(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return window.localStorage.getItem(COMPACT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setOn(next);
    try {
      window.localStorage.setItem(COMPACT_KEY, next ? '1' : '0');
    } catch {
      // The choice holds for this page only.
    }
  };
  return [on, set];
}
const LIMIT = 24;

export const GENDER_FILTERS = [
  { value: ALL, label: 'All' },
  { value: 'GENDER_ENUM_MALE', label: 'Men' },
  { value: 'GENDER_ENUM_FEMALE', label: 'Women' },
  { value: 'GENDER_ENUM_UNISEX', label: 'Unisex' },
];

export type PoolActive = number | 'new' | null;

/**
 * HOW THE POOL IS ORDERED (the `Sort` filter; the count beside it turns the order around):
 * `pool` — as the server gives it; `name` — A → Z; `newest` — by creation, the newest first;
 * `measured` — by how much of the body is measured, the fullest first.
 * Sorting is done here, over the loaded cards: while a sort is on and the pool is small
 * (`SORT_ALL`), every page is loaded so the order is of the whole pool.
 */
type PoolSort = 'pool' | 'name' | 'newest' | 'measured';
const SORTS: { value: PoolSort; label: string }[] = [
  { value: 'pool', label: 'Pool Order' },
  { value: 'name', label: 'Name' },
  { value: 'newest', label: 'Newest' },
  { value: 'measured', label: 'Measured %' },
];
/** Up to this many models a sort loads the whole pool; above it, it orders what is loaded. */
const SORT_ALL = 200;

const measuredOf = (m: common_Model) =>
  (m.model?.measurements ?? []).filter((x) => (x.valueMm ?? 0) > 0).length;
const createdOf = (m: common_Model) => {
  const ms = m.createdAt ? new Date(m.createdAt).getTime() : 0;
  return Number.isNaN(ms) ? 0 : ms;
};

/** A modal or a popover is open: the page's own keys stand down. */
export function overlayOpen() {
  return !!document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]');
}

export type PoolSearch = {
  open: boolean;
  query: string;
  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
};

const ICON_BUTTON =
  'grid size-7 shrink-0 place-items-center text-placeholder transition-colors duration-500 ease-soft hover:text-ink disabled:text-titleOff disabled:hover:text-titleOff';

function HeadIcon({ name }: { name: IconoirName }) {
  return <Iconoir name={name} strokeWidth={1.8} className='size-5' />;
}

/**
 * The title row of the left area. Pool view, left → right: the step arrows, the search glass, the
 * 32px title, `+`; the gender filter at the right end. Open card: the back arrow, the title, the
 * glass. Icons are iconoir at 20px / 1.8 stroke, `placeholder` grey, ink on hover.
 *
 * SEARCH TAKES THE TITLE'S PLACE. The glass turns the title into the search input («Search» in grey
 * at the same 32px; typed text ink); its container eases out to the right as far as the filter,
 * the filter slides away, and `+` rides at the right end. Esc, or leaving it empty, closes it and
 * the filter slides back.
 */
export function PoolHead({
  title,
  search,
  onSearch,
  onBack,
  steps,
  onAdd,
  filter,
}: {
  title: string;
  search: PoolSearch;
  /** Instead of opening the field here (the open card: go back to the pool, search there). */
  onSearch?: () => void;
  /** The way back to the pool (an open card). */
  onBack?: () => void;
  steps?: { prev: () => void; next: () => void; canPrev: boolean; canNext: boolean };
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
          aria-label='back to models'
          title='back'
          onClick={onBack}
          className={cn(ICON_BUTTON, 'text-ink hover:text-labelDark')}
        >
          <HeadIcon name='arrow-left' />
        </Button>
      )}
      {steps && (
        <div className='flex shrink-0'>
          <Button
            type='button'
            variant='default'
            aria-label='previous card'
            disabled={!steps.canPrev}
            onClick={steps.prev}
            className={ICON_BUTTON}
          >
            <HeadIcon name='nav-arrow-left' />
          </Button>
          <Button
            type='button'
            variant='default'
            aria-label='next card'
            disabled={!steps.canNext}
            onClick={steps.next}
            className={ICON_BUTTON}
          >
            <HeadIcon name='nav-arrow-right' />
          </Button>
        </div>
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
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 transition-[padding] duration-700 ease-soft motion-reduce:transition-none',
          filter && !searching && 'md:pr-88',
        )}
      >
        {searching ? (
          <Input
            ref={input}
            name='models-search'
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
            aria-label='search by name'
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
            aria-label='new model'
            title='new model'
            onClick={onAdd}
            className={cn(ICON_BUTTON, 'ml-auto first:ml-0', !searching && 'ml-0')}
          >
            <HeadIcon name='plus' />
          </Button>
        )}
      </div>
      {filter && (
        <div
          aria-hidden={searching || undefined}
          className={cn(
            'transition-[opacity,translate] duration-700 ease-soft motion-reduce:transition-none md:absolute md:top-1/2 md:right-0 md:-translate-y-1/2',
            searching && 'pointer-events-none translate-x-10 opacity-0',
          )}
        >
          {filter}
        </div>
      )}
    </div>
  );
}

/**
 * The pool view (no card open): the title row with count, gender filter and steps, then ONE row of
 * cards that moves by whole cards (`StepRow`: wheel, swipe, ← →, the step buttons). Filters are
 * server-side (ListModels `name` / `gender`); pages load as the steps near the end.
 */
export function ModelPool({
  selected,
  canEdit,
  gender,
  onGenderChange,
  search,
  onSelect,
  onOpen,
  onDeleted,
}: {
  selected: number | null;
  canEdit: boolean;
  gender: string;
  onGenderChange: (gender: string) => void;
  search: PoolSearch;
  onSelect: (id: number | null) => void;
  onOpen: (target: number | 'new') => void;
  onDeleted: (id: number) => void;
}) {
  const deleteModel = useDeleteModel();
  const [debouncedName, setDebouncedName] = useState(search.query);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [idx, setIdx] = useState(0);
  const [metrics, setMetrics] = useState<StepRowMetrics>({ visible: 1, max: 0 });
  const [compact, setCompact] = useCompactView();
  const [filterOpen, setFilterOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<PoolSort>('pool');
  // The count beside the filters turns the chosen order around.
  const [reversed, setReversed] = useState(false);
  const { patch, busy } = useModelPatch();

  // A click outside the selected card (and its words) lets the selection go.
  useEffect(() => {
    if (selected == null) return undefined;
    const outside = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-model-tile], [role="dialog"], [data-radix-popper-content-wrapper]'))
        return;
      onSelect(null);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [selected, onSelect]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(search.query), 300);
    return () => clearTimeout(t);
  }, [search.query]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteModels(
    { gender: gender === ALL ? '' : gender, name: debouncedName },
    LIMIT,
  );
  // Same key as the unfiltered list, so with no filter on it is the same request.
  const everything = useInfiniteModels({}, LIMIT);

  const loaded = data?.pages.flatMap((page) => page.models ?? []) ?? [];
  const models = useMemo(() => {
    if (sort === 'pool') return reversed ? [...loaded].reverse() : loaded;
    const by =
      sort === 'name'
        ? (a: common_Model, b: common_Model) =>
            (a.model?.name ?? '').localeCompare(b.model?.name ?? '')
        : sort === 'newest'
          ? (a: common_Model, b: common_Model) => createdOf(b) - createdOf(a)
          : (a: common_Model, b: common_Model) => measuredOf(b) - measuredOf(a);
    const sorted = [...loaded].sort(by);
    return reversed ? sorted.reverse() : sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `loaded` is rebuilt every render
  }, [data, sort, reversed]);
  const shown = data?.pages[0]?.total ?? models.length;
  const total = everything.data?.pages[0]?.total ?? shown;

  // A sort is of the whole pool while the pool is small: the remaining pages are loaded.
  const ordered = sort !== 'pool' || reversed;
  useEffect(() => {
    if (ordered && shown <= SORT_ALL && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [ordered, shown, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Filters, and a change of view, start the row over.
  useEffect(() => {
    setIdx(0);
  }, [gender, debouncedName, compact, sort, reversed]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => {
    if (idx < metrics.max) setIdx(idx + 1);
    else loadMore();
  };

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    // The card leaving the row is the receipt.
    deleteModel.mutate(id, {
      onSuccess: () => onDeleted(id),
      onError: (e) =>
        notify({
          sev: 'error',
          subject: `MODEL ${id}`,
          text: 'not deleted',
          detail: e instanceof Error ? e.message : undefined,
        }),
    });
    setPendingDelete(null);
  }

  const tiles = (small: boolean) => [
    ...models.map((m) => {
      const id = m.id ?? 0;
      return (
        <ModelTile
          key={id}
          model={m}
          compact={small}
          state={selected === id ? 'selected' : 'default'}
          canEdit={canEdit}
          onSelect={() => onSelect(selected === id ? null : id)}
          onOpen={() => onOpen(id)}
          onDelete={() => setPendingDelete({ id, name: m.model?.name || `model ${id}` })}
          onPatch={(change) => void patch(id, change)}
          busy={busy}
        />
      );
    }),
    ...(canEdit && !hasNextPage
      ? [<NewModelTile key='new' compact={small} onOpen={() => onOpen('new')} />]
      : []),
  ];

  const counts = useModelCounts(GENDER_FILTERS.map((g) => (g.value === ALL ? '' : g.value)));
  const filterOptions = GENDER_FILTERS.map((g, i) => ({
    ...g,
    meta: counts[i]?.data != null ? String(counts[i].data) : undefined,
  }));

  return (
    <div className='flex min-w-0 flex-col'>
      <PoolHead
        title={total > 0 ? 'Models Pool' : 'Models'}
        search={search}
        steps={{ prev, next, canPrev: idx > 0, canNext: idx < metrics.max || !!hasNextPage }}
        onAdd={canEdit ? () => onOpen('new') : undefined}
        filter={
          <div className='flex items-center gap-4'>
            <FilterRow open={filterOpen} onOpenChange={setFilterOpen}>
              <FilterItem
                id='gender'
                label='Gender'
                value={GENDER_FILTERS.find((g) => g.value === gender)?.label ?? 'All'}
              >
                <CascadeList
                  label='gender'
                  size='compact'
                  open={filterOpen === 'gender'}
                  options={filterOptions.map((g) => ({
                    value: g.value,
                    label: g.meta ? `${g.label} (${g.meta})` : g.label,
                  }))}
                  value={gender}
                  onChange={(v) => {
                    onGenderChange(v);
                    setFilterOpen(null);
                  }}
                />
              </FilterItem>
              <FilterItem
                id='sort'
                label='Sort'
                value={SORTS.find((x) => x.value === sort)?.label ?? 'Pool Order'}
              >
                <CascadeList
                  label='sort'
                  size='compact'
                  open={filterOpen === 'sort'}
                  options={SORTS}
                  value={sort}
                  onChange={(v) => {
                    setSort(v as PoolSort);
                    setReversed(false);
                    setFilterOpen(null);
                  }}
                />
              </FilterItem>
            </FilterRow>
            <SortCount
              count={shown}
              state={reversed ? 'desc' : sort !== 'pool' ? 'asc' : null}
              label={`${shown} models — reverse the order`}
              title='reverse the order'
              onClick={() => setReversed((r) => !r)}
            />
            <Button
              type='button'
              variant='default'
              aria-label={compact ? 'one row' : 'compact view'}
              aria-pressed={compact}
              title={compact ? 'one row' : 'compact view'}
              onClick={() => setCompact(!compact)}
              className={ICON_BUTTON}
            >
              <HeadIcon name={compact ? 'view-columns-3' : 'view-grid'} />
            </Button>
          </div>
        }
      />

      <div
        aria-hidden='true'
        className='transition-[height] duration-700 ease-soft motion-reduce:transition-none'
        style={{
          height: FilterRow.room(
            filterOpen === 'gender'
              ? GENDER_FILTERS.length
              : filterOpen === 'sort'
                ? SORTS.length
                : 0,
          ),
        }}
      />
      <div className='mt-[clamp(1.5rem,9vh,6.125rem)]'>
        {isLoading ? (
          <Text className='animate-pulse py-20 text-placeholder'>loading…</Text>
        ) : models.length === 0 && !canEdit ? (
          <Text className='py-20 text-placeholder'>No models</Text>
        ) : (
          <StepRow
            // The view changes: the row arrives anew (a soft fade-up), no layout jump.
            key={compact ? 'compact' : 'row'}
            index={idx}
            onIndexChange={setIdx}
            onMetrics={setMetrics}
            onNearEnd={loadMore}
            nearEnd={compact ? 1 : 3}
            keyboard
            label='models'
            className='motion-safe:animate-[models-fade-up_700ms_var(--ease-soft)_both]'
            trackClassName='gap-2'
          >
            {compact
              ? pagesOf(tiles(true), PAGE).map((page, i) => (
                  <div
                    key={i}
                    className='@container grid w-full shrink-0 grid-cols-[repeat(4,auto)] content-start justify-start gap-2'
                  >
                    {page}
                  </div>
                ))
              : tiles(false)}
          </StepRow>
        )}
      </div>

      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={confirmDelete}
        title='delete model'
        confirmLabel='delete'
        cancelLabel='cancel'
      >
        <Text>delete “{pendingDelete?.name}”? this cannot be undone.</Text>
      </ConfirmationModal>
    </div>
  );
}
