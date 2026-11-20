import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { LIBRARY_PAGE_SIZE, listLibraryItems } from '../api/library';
import {
  type LibraryFilter,
  type LibraryItem,
  type LibrarySortKey,
  type LibrarySourceKey,
  type RefKey,
  refKey,
  refOf,
  sourceFromPb,
} from '../api/types';
import { libraryKeys } from './keys';

type LibraryPage = {
  items: LibraryItem[];
  total: number;
  sourcesVisible: LibrarySourceKey[];
  offset: number;
};

export type UseLibraryItemsResult = {
  /** All loaded rows, page order, deduplicated by ref key (offset pages can shift). */
  items: LibraryItem[];
  /** Rows under the filter on the server (latest page's answer). */
  total: number;
  /** Sources the caller may read, after section/feature gating, before the filter. */
  sourcesVisible: LibrarySourceKey[];
  /** Index of the page that holds `offset` (scrubber jumps). */
  pageForOffset: (offset: number) => number;
  /** Loads pages until the row at `offset` is loaded (or the list ends). */
  fetchUntil: (offset: number) => Promise<void>;
  fetchNextPage: () => Promise<unknown>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};

/** Infinite offset pages of `ListLibraryItems`, `limit` rows each (60 by default). */
export function useLibraryItems(
  filter: LibraryFilter,
  sort: LibrarySortKey,
  opts?: { enabled?: boolean; limit?: number },
): UseLibraryItemsResult {
  const limit = opts?.limit ?? LIBRARY_PAGE_SIZE;
  const query = useInfiniteQuery({
    queryKey: [...libraryKeys.list(filter, sort), limit] as const,
    queryFn: async ({ pageParam }: { pageParam: number }): Promise<LibraryPage> => {
      const res = await listLibraryItems({ filter, sort, limit, offset: pageParam });
      return {
        items: res.items ?? [],
        total: res.total ?? 0,
        sourcesVisible: (res.sourcesVisible ?? [])
          .map(sourceFromPb)
          .filter((s): s is LibrarySourceKey => !!s),
        offset: pageParam,
      };
    },
    initialPageParam: 0,
    // By offset, not by rows received: a row deleted between the list and its hydration is
    // skipped by the server, so a short page is not the end.
    getNextPageParam: (last) =>
      last.offset + limit < last.total ? last.offset + limit : undefined,
    enabled: opts?.enabled ?? true,
    staleTime: 60 * 1000,
  });

  const pages = query.data?.pages;
  const items = useMemo(() => {
    const seen = new Set<RefKey>();
    const out: LibraryItem[] = [];
    for (const page of pages ?? []) {
      for (const item of page.items) {
        const ref = refOf(item);
        if (!ref) continue;
        const key = refKey(ref);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }, [pages]);

  const lastPage = pages?.[pages.length - 1];
  const total = lastPage?.total ?? 0;
  const sourcesVisible = useMemo(() => lastPage?.sourcesVisible ?? [], [lastPage]);

  const pageForOffset = useCallback(
    (offset: number) => Math.max(0, Math.floor(offset / limit)),
    [limit],
  );

  const { fetchNextPage, refetch } = query;
  const fetchUntil = useCallback(
    async (offset: number) => {
      let loaded = (pages?.length ?? 0) * limit;
      let more = query.hasNextPage;
      while (more && loaded <= offset) {
        const res = await fetchNextPage();
        if (res.isError) return;
        loaded = (res.data?.pages.length ?? 0) * limit;
        more = !!res.hasNextPage;
      }
    },
    [pages, limit, query.hasNextPage, fetchNextPage],
  );

  return {
    items,
    total,
    sourcesVisible,
    pageForOffset,
    fetchUntil,
    fetchNextPage,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch,
  };
}
