import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { buildCareVocabulary, CareVocabulary } from './care-codes';

/**
 * The care vocabulary for the current dictionary.
 *
 * Every care surface calls this rather than being handed a prop: the picker, the field, the
 * read-only colourway display and the tech-pack print doc all need the same lookup, and threading
 * it through would mean four call sites that can each be forgotten. The dictionary is loaded once
 * at startup and never changes within a session, so the memo makes this effectively a constant —
 * the same thing the old module-scope `CARE_CODE_META` was, only sourced from the server.
 *
 * `vocabulary.loaded` is false while the dictionary is still in flight and on a backend that serves
 * no care vocabulary. In that state codes still RENDER (artwork is local, keyed by code) but
 * nothing can be PICKED, and the picker says so rather than showing an empty grid.
 */
export function useCareVocabulary(): CareVocabulary {
  const { dictionary } = useDictionary();
  return useMemo(() => buildCareVocabulary(dictionary?.careSymbols), [dictionary?.careSymbols]);
}
