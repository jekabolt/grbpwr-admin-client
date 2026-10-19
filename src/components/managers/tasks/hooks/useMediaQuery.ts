import { useCallback, useSyncExternalStore } from 'react';

/** Below the `md` breakpoint (768px) the task form is a full-screen page, not a modal. */
export const PHONE_QUERY = '(max-width: 767px)';
/** A mouse or trackpad is attached — only then a keyboard shortcut hint is worth showing. */
export const FINE_POINTER_QUERY = '(pointer: fine)';

/** Live `matchMedia` answer; `false` where `matchMedia` is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    [query],
  );
  const read = () =>
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, read, () => false);
}
