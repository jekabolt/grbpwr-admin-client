import { useQuery } from '@tanstack/react-query';
import { type ScrubMonth } from 'ui';
import { getLibraryFacets } from '../api/library';
import type { LibraryFilter, LibraryKind } from '../api/types';
import { libraryKeys } from './keys';

export type LibraryFacets = {
  /** Same filter, newest first: the scrubber's index (`useMonthIndex` / `buildMonthIndex`). */
  months: ScrubMonth[];
  /** Count per kind under the filter minus `kinds`. Missing kind = 0. */
  kinds: Partial<Record<LibraryKind, number>>;
  /** Under the filter minus `usage`. */
  used: number;
  free: number;
  /** Under the filter minus `access`: files without a public twin, and media rows. */
  private: number;
  public: number;
  /** Under the filter minus `ratios`, media only. `ratio` is a server key (`4:5`) or `other`. */
  ratios: { ratio: string; count: number }[];
  total: number;
};

export function useLibraryFacets(filter: LibraryFilter, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: libraryKeys.facets(filter),
    queryFn: async (): Promise<LibraryFacets> => {
      const res = await getLibraryFacets(filter);
      const kinds: Partial<Record<LibraryKind, number>> = {};
      for (const k of res.kinds ?? []) {
        if (k.kind) kinds[k.kind] = (kinds[k.kind] ?? 0) + (k.count ?? 0);
      }
      return {
        months: (res.months ?? [])
          .map((m) => ({ year: m.year ?? 0, month: m.month ?? 0, count: m.count ?? 0 }))
          .filter((m) => m.year > 0 && m.month > 0),
        kinds,
        used: res.used ?? 0,
        free: res.free ?? 0,
        private: res.accessPrivate ?? 0,
        public: res.accessPublic ?? 0,
        ratios: (res.ratios ?? [])
          .map((r) => ({ ratio: r.ratio ?? '', count: r.count ?? 0 }))
          .filter((r) => !!r.ratio),
        total: res.total ?? 0,
      };
    },
    enabled: opts?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}
