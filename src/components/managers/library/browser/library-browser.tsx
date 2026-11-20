import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input, Loader, Text, Tiles } from 'ui';
import {
  DEFAULT_SORT,
  type LibraryFilter,
  type LibraryItem,
  type LibraryKind,
  type LibraryRef,
  type LibrarySortKey,
  type RefKey,
  makeFilter,
  refKey,
  refOf,
} from '../api/types';
import { decodeUrlFilter, encodeUrlFilter } from '../api/url-filter';
import { ItemThumb } from '../components/item-thumb';
import { useLibraryItems } from '../hooks/useLibraryItems';

/**
 * The contract between the library page (C1) and the pickers (C2). Frozen in P0 (02-DESIGN §6):
 * C1 may add optional props only.
 */
export type LibraryBrowserProps = {
  mode: 'page' | 'pick';
  accept: 'visual' | 'any';
  kinds?: LibraryKind[]; // field narrowing (showVideos=false, vectorOnly, allowSvg=false)
  sources?: Array<'media' | 'file'>; // notes and label pickers: ['file']
  multiple: boolean;
  selected: LibraryRef[]; // controlled
  onSelectionChange: (refs: LibraryRef[], items: LibraryItem[]) => void;
  onOpen?: (item: LibraryItem) => void;
  targetRatios?: number[]; // same meaning as MediaManager's prop today
  onFilesPicked?: (files: File[]) => void; // if set, drops/picks/paste go to the host (MediaSelector crop path), not the queue
  initialFilter?: Partial<LibraryFilter>;
  filterInUrl?: boolean; // page: true; pick: false
  scrollEl?: HTMLElement | null; // picker dialog scroll container (virtual scroll on coarse pointers)
};

const SEARCH_DEBOUNCE_MS = 300;

/** The host's field narrowing wins: a URL or initial kind outside it is dropped. */
function narrowKinds(asked: LibraryKind[], allowed: LibraryKind[] | undefined): LibraryKind[] {
  if (!allowed?.length) return asked;
  if (!asked.length) return allowed;
  const both = asked.filter((k) => allowed.includes(k));
  return both.length ? both : allowed;
}

/**
 * v0: a plain grid of the unified library with search, controlled selection and infinite
 * scroll. No rail, no filters, no upload queue: C1 adds them here.
 */
export function LibraryBrowser({
  mode,
  accept,
  kinds,
  sources,
  multiple,
  selected,
  onSelectionChange,
  onOpen,
  targetRatios,
  onFilesPicked,
  initialFilter,
  filterInUrl = false,
  scrollEl,
}: LibraryBrowserProps) {
  const [params, setParams] = useSearchParams();

  // The URL is read once, on mount; afterwards the browser writes it.
  const [urlState] = useState(() =>
    filterInUrl ? decodeUrlFilter(params) : { filter: {}, sort: DEFAULT_SORT },
  );
  const [search, setSearch] = useState(() => urlState.filter.search ?? initialFilter?.search ?? '');
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search]);
  const sort: LibrarySortKey = urlState.sort;

  const kindsKey = (kinds ?? []).join(',');
  const sourcesKey = (sources ?? []).join(',');
  const filter = useMemo(() => {
    const base = makeFilter({ ...initialFilter, ...urlState.filter });
    return makeFilter({
      ...base,
      accept,
      kinds: narrowKinds(base.kinds, kinds),
      sources: sources?.length ? sources : base.sources,
      search: debounced,
    });
    // `kinds` / `sources` arrive as fresh literals from hosts; their content is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilter, urlState, accept, kindsKey, sourcesKey, debounced]);

  useEffect(() => {
    if (!filterInUrl) return;
    const next = encodeUrlFilter(filter, sort, params);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [filterInUrl, filter, sort, params, setParams]);

  const list = useLibraryItems(filter, sort);
  const { items, hasNextPage, isFetchingNextPage, fetchNextPage } = list;

  // Every row seen so far, so a selection can answer items for refs of an earlier filter.
  const known = useRef(new Map<RefKey, LibraryItem>());
  useEffect(() => {
    for (const item of items) {
      const ref = refOf(item);
      if (ref) known.current.set(refKey(ref), item);
    }
  }, [items]);

  const selectedKeys = useMemo(() => new Set(selected.map(refKey)), [selected]);

  const emit = useCallback(
    (refs: LibraryRef[]) => {
      const picked = refs
        .map((r) => known.current.get(refKey(r)))
        .filter((i): i is LibraryItem => !!i);
      onSelectionChange(refs, picked);
    },
    [onSelectionChange],
  );

  const toggle = useCallback(
    (item: LibraryItem) => {
      const ref = refOf(item);
      if (!ref) return;
      known.current.set(refKey(ref), item);
      const key = refKey(ref);
      if (!multiple) {
        emit(selectedKeys.has(key) ? [] : [ref]);
        return;
      }
      emit(selectedKeys.has(key) ? selected.filter((r) => refKey(r) !== key) : [...selected, ref]);
    },
    [multiple, selected, selectedKeys, emit],
  );

  const handleClick = useCallback(
    (item: LibraryItem) => {
      if (mode === 'page' && onOpen) onOpen(item);
      else toggle(item);
    },
    [mode, onOpen, toggle],
  );

  // Infinite scroll: a sentinel under the grid, observed in the host's scroll container.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinel || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scrollEl ?? null, rootMargin: '600px 0px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [sentinel, scrollEl, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [dragOver, setDragOver] = useState(false);
  const dropProps = onFilesPicked
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragOver(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragOver(false);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) onFilesPicked(files);
        },
      }
    : {};

  return (
    <div
      {...dropProps}
      className={`flex flex-col gap-2.5 ${dragOver ? 'outline outline-2 -outline-offset-2 outline-textColor' : ''}`}
    >
      <Input
        type='text'
        value={search}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        placeholder='search'
        aria-label='search'
      />

      {list.isLoading ? (
        <Loader />
      ) : list.isError ? (
        <Text variant='label'>not loaded</Text>
      ) : items.length === 0 ? (
        <Text variant='label'>nothing here</Text>
      ) : (
        <Tiles min={120}>
          {items.map((item) => {
            const ref = refOf(item);
            if (!ref) return null;
            const key = refKey(ref);
            return (
              <ItemThumb
                key={key}
                item={item}
                selected={selectedKeys.has(key)}
                targetRatios={targetRatios}
                onClick={() => handleClick(item)}
              />
            );
          })}
        </Tiles>
      )}

      {hasNextPage && <div ref={setSentinel} aria-hidden className='h-px' />}
      {isFetchingNextPage && <Loader />}
    </div>
  );
}
