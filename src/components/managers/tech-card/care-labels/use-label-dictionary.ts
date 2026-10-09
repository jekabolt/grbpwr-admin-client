import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_Country, common_Dictionary } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';

/**
 * The shared dictionary with its COUNTRIES filled from `ListCountries`.
 *
 * `GetDictionary().countries` is never populated by the backend (the country dictionary lives
 * behind its own RPC, `ListCountries`), so every reader that looked countries up there saw an empty
 * list: the MADE IN picker offered nothing, and the print adapter turned every colourway's country
 * into the blocking hole `country-unknown`. This hook is the one place that fixes that for the
 * composition label, its print page and the tech pack.
 *
 * All countries are loaded (inactive ones too) so a stored code always resolves to a name; the
 * picker narrows to active ones itself. Until countries arrive, `loading` stays true — a reader that
 * treats «no dictionary yet» as a hole keeps doing so instead of printing an unknown country.
 */
export function useLabelDictionary(): {
  dictionary: common_Dictionary | undefined;
  loading: boolean;
  error: unknown;
} {
  const base = useDictionary();
  const countries = useQuery({
    queryKey: ['dictionary', 'countries', 'all'],
    queryFn: async (): Promise<common_Country[]> =>
      (await adminService.ListCountries({ activeOnly: false })).countries ?? [],
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const dictionary = useMemo(() => {
    if (!base.dictionary) return undefined;
    if (!countries.data) return undefined;
    // An empty answer never blanks a dictionary that already carries countries.
    const list = countries.data.length ? countries.data : base.dictionary.countries ?? [];
    return { ...base.dictionary, countries: list };
  }, [base.dictionary, countries.data]);

  return {
    dictionary,
    loading: !!base.loading || countries.isLoading,
    error: base.error ?? (countries.isError ? countries.error : undefined),
  };
}
