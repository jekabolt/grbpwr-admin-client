import {
  canonicalFilter,
  type LibraryFilter,
  type LibrarySortKey,
  withoutFolder,
} from '../api/types';

/**
 * Query keys of the unified library. Everything sits under `['library']`, so one
 * `invalidateQueries({ queryKey: libraryKeys.all })` refreshes lists, facets and folders.
 * The filter is canonicalised: equal questions share one cache entry.
 */
export const libraryKeys = {
  all: ['library'] as const,
  lists: () => [...libraryKeys.all, 'list'] as const,
  list: (f: LibraryFilter, s: LibrarySortKey) =>
    [...libraryKeys.lists(), canonicalFilter(f), s] as const,
  facets: (f: LibraryFilter) => [...libraryKeys.all, 'facets', canonicalFilter(f)] as const,
  // The server ignores the folder fields here, so the key does too.
  folders: (f: LibraryFilter) =>
    [...libraryKeys.all, 'folders', canonicalFilter(withoutFolder(f))] as const,
};
