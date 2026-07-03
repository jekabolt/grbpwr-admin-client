import { common_HeroFullWithTranslations } from 'api/proto-http/frontend';
import { RefObject, useCallback, useEffect, useRef } from 'react';

interface UseHeroPreviewArgs {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Hydrated draft (mapFormToHeroFull output). Memoize so identity changes only on content change. */
  hero: common_HeroFullWithTranslations;
  /** Storefront origin for the postMessage targetOrigin + the inbound origin gate (never '*'). */
  storefrontOrigin: string;
  /** Called on hero-block-click with the entities[] index (0 = main). */
  onBlockClick?: (index: number) => void;
}

/**
 * postMessage bridge to the storefront /preview/hero iframe, per its contract:
 * wait for the one-shot `hero-preview-ready` handshake, then push the full draft
 * with a strictly-increasing `rev`; re-push (debounced) on every draft change.
 * Inbound messages are origin-gated. Listener stays stable across renders (hero
 * and the click handler are read through refs), so it subscribes once.
 */
export function useHeroPreview({
  iframeRef,
  hero,
  storefrontOrigin,
  onBlockClick,
}: UseHeroPreviewArgs) {
  const revRef = useRef(0);
  const readyRef = useRef(false);
  const heroRef = useRef(hero);
  heroRef.current = hero;
  const onBlockClickRef = useRef(onBlockClick);
  onBlockClickRef.current = onBlockClick;

  const push = useCallback(
    (h: common_HeroFullWithTranslations) => {
      if (!readyRef.current) return; // before the handshake the preview has no listener; the draft would be lost
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'hero-draft', hero: h, rev: ++revRef.current },
        storefrontOrigin,
      );
    },
    [iframeRef, storefrontOrigin],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== storefrontOrigin || !event.data) return;
      const data = event.data;
      if (data.type === 'hero-preview-ready') {
        readyRef.current = true;
        push(heroRef.current); // hand the current draft over immediately, else the first one is lost
      } else if (data.type === 'hero-block-click' && typeof data.index === 'number') {
        onBlockClickRef.current?.(data.index);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [storefrontOrigin, push]);

  // Debounced re-push on draft change (identity change == content change when memoized).
  useEffect(() => {
    const t = setTimeout(() => push(hero), 200);
    return () => clearTimeout(t);
  }, [hero, push]);

  /** Reset the handshake when the iframe reloads (e.g. locale/src change) so the next ready re-pushes. */
  const handleReload = useCallback(() => {
    readyRef.current = false;
  }, []);

  return { handleReload };
}
