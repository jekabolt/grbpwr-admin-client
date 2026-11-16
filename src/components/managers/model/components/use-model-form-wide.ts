import { useSyncExternalStore } from 'react';

// Desktop pair layout of the model form: the body preview sticks on the left and the measurements
// show one group at a time on the right. Tailwind `xl` — at 1280 the form is ~1210 px wide, the
// width the approved mockup was drawn at. Below it the form stays stacked as before.
export const MODEL_FORM_WIDE_QUERY = '(min-width: 1280px)';

function subscribe(onChange: () => void) {
  const query =
    typeof window === 'undefined' ? undefined : window.matchMedia?.(MODEL_FORM_WIDE_QUERY);
  if (!query) return () => undefined;
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function snapshot() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(MODEL_FORM_WIDE_QUERY).matches;
}

export function useModelFormWide(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
