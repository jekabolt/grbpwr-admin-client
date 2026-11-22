import { useEffect, useState } from 'react';

import { fetchMediaBlob } from './media-blob';

// Opening a stored file in the browser (new tab, in-page viewer, download) without handing the
// browser its bare url: a private team file answers 403 to that (pattern urls are never signed,
// since seals and sidecars bind them). The bytes come through fetchMediaBlob (direct → proxy) and
// the browser gets a same-origin blob url.

/** Kept alive long enough for a PDF viewer tab to finish reading it. */
const REVOKE_AFTER_MS = 5 * 60_000;

const isPdfUrl = (url: string) => /\.pdf(?:[?#]|$)/i.test(url);

/** A .pdf url is a PDF whatever type the proxy answered with; it needs that type to render. */
export function typedMediaBlob(url: string, blob: Blob): Blob {
  if (!isPdfUrl(url) || blob.type === 'application/pdf') return blob;
  return new Blob([blob], { type: 'application/pdf' });
}

export async function mediaObjectUrl(url: string, signal?: AbortSignal): Promise<string> {
  return URL.createObjectURL(typedMediaBlob(url, await fetchMediaBlob(url, signal)));
}

/** Opens the file in a new tab. The tab opens synchronously so the click still counts as a gesture. */
export async function openMediaInNewTab(url: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const href = await mediaObjectUrl(url);
    setTimeout(() => URL.revokeObjectURL(href), REVOKE_AFTER_MS);
    if (tab) {
      tab.opener = null;
      tab.location.replace(href);
    } else {
      window.open(href, '_blank', 'noopener');
    }
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/** Saves the file under `fileName`. */
export async function downloadMedia(url: string, fileName: string): Promise<void> {
  const href = await mediaObjectUrl(url);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_AFTER_MS);
}

/** A blob url of the file for an in-page viewer; null while loading, `failed` on an error. */
export function useMediaObjectUrl(url: string | null | undefined): {
  src: string | null;
  failed: boolean;
} {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>({
    src: null,
    failed: false,
  });
  useEffect(() => {
    setState({ src: null, failed: false });
    if (!url) return;
    const controller = new AbortController();
    let made: string | null = null;
    mediaObjectUrl(url, controller.signal).then(
      (href) => {
        if (controller.signal.aborted) {
          URL.revokeObjectURL(href);
          return;
        }
        made = href;
        setState({ src: href, failed: false });
      },
      () => {
        if (!controller.signal.aborted) setState({ src: null, failed: true });
      },
    );
    return () => {
      controller.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [url]);
  return state;
}
