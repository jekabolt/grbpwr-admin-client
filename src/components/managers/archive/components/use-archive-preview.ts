import { common_ArchiveFull } from 'api/proto-http/frontend';
import { RefObject, useCallback, useEffect, useRef } from 'react';
import { ARCHIVE_PREVIEW } from './preview-contract';

interface UseArchivePreviewArgs {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Hydrated draft (mapFormToArchiveFull output). Memoize so identity changes only on content change. */
  archive: common_ArchiveFull;
  /** Storefront origin for the postMessage targetOrigin + the inbound origin gate (never '*'). */
  storefrontOrigin: string;
  /** Called on archive-block-click with the items[] index. */
  onBlockClick?: (index: number) => void;
}

/**
 * postMessage bridge to the storefront /preview/archive iframe, per its contract:
 * wait for the one-shot `archive-preview-ready` handshake, then push the full
 * draft with a strictly-increasing `rev`; re-push (debounced) on every change.
 * Inbound messages are origin-gated. The listener stays stable across renders
 * (archive + click handler read through refs), so it subscribes once. Ported
 * verbatim from useHeroPreview.
 */
export function useArchivePreview({
  iframeRef,
  archive,
  storefrontOrigin,
  onBlockClick,
}: UseArchivePreviewArgs) {
  const revRef = useRef(0);
  const readyRef = useRef(false);
  const archiveRef = useRef(archive);
  archiveRef.current = archive;
  const onBlockClickRef = useRef(onBlockClick);
  onBlockClickRef.current = onBlockClick;

  const push = useCallback(
    (a: common_ArchiveFull) => {
      if (!readyRef.current) return; // before the handshake the preview has no listener; the draft would be lost
      iframeRef.current?.contentWindow?.postMessage(
        { type: ARCHIVE_PREVIEW.draftMessage, archive: a, rev: ++revRef.current },
        storefrontOrigin,
      );
    },
    [iframeRef, storefrontOrigin],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== storefrontOrigin || !event.data) return;
      const data = event.data;
      if (data.type === ARCHIVE_PREVIEW.readyMessage) {
        readyRef.current = true;
        push(archiveRef.current); // hand the current draft over immediately, else the first one is lost
      } else if (
        data.type === ARCHIVE_PREVIEW.blockClickMessage &&
        typeof data.index === 'number'
      ) {
        onBlockClickRef.current?.(data.index);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [storefrontOrigin, push]);

  // Debounced re-push on draft change (identity change == content change when memoized).
  useEffect(() => {
    const t = setTimeout(() => push(archive), 200);
    return () => clearTimeout(t);
  }, [archive, push]);

  /** Reset the handshake when the iframe reloads (e.g. locale/src change) so the next ready re-pushes. */
  const handleReload = useCallback(() => {
    readyRef.current = false;
  }, []);

  return { handleReload };
}
