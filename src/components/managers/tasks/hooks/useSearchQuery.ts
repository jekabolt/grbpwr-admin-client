import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { normalizeQuery } from '../utils/search';

const PARAM = 'q';
const DEBOUNCE_MS = 200;

/**
 * The search query lives in the address (`?q=`): it survives a reload and can be pasted to
 * someone. The field types into `draft` at once; the address (and so the request) follows after a
 * short pause. Back/forward rewrite the field from the address.
 */
export function useSearchQuery() {
  const [params, setParams] = useSearchParams();
  const query = normalizeQuery(params.get(PARAM) ?? '');
  const [draft, setDraft] = useState(query);
  // What this hook itself last wrote: its echo must not overwrite keys typed since.
  const written = useRef(query);

  const writeQuery = useCallback(
    (q: string) => {
      written.current = q;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (q) next.set(PARAM, q);
          else next.delete(PARAM);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Address → field, only when they really differ (a trailing space is still the same query).
  useEffect(() => {
    if (query === written.current) return;
    written.current = query;
    setDraft((d) => (normalizeQuery(d) === query ? d : query));
  }, [query]);

  // Field → address, debounced.
  useEffect(() => {
    const q = normalizeQuery(draft);
    if (q === query) return;
    const t = setTimeout(() => writeQuery(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, query, writeQuery]);

  const clear = useCallback(() => {
    setDraft('');
    writeQuery('');
  }, [writeQuery]);

  return { draft, setDraft, query, clear };
}
