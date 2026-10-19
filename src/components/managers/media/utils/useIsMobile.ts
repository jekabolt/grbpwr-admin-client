import { useEffect, useState } from 'react';

/** Below Tailwind `lg` (1024px): the phone layout of the media screens. */
const MOBILE_QUERY = '(max-width: 1023px)';

function matches() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches;
}

/**
 * The media library's phone layout differs in BEHAVIOUR, not only in looks (a tap selects in
 * select mode, a long press enters it), so it needs JS, not only `lg:` variants.
 */
export function useIsMobile() {
  const [mobile, setMobile] = useState(matches);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return;
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return mobile;
}
