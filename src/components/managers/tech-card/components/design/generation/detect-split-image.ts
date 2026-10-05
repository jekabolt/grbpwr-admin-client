import { fetchMediaBlob } from 'lib/features/media-blob';

import { DETECT_SIDE, detectSplit, type SplitDetection } from './detect-split';

/**
 * The browser half of the detector (T26): the sheet's pixels — fetched the way every canvas read of
 * a media object is (`fetchMediaBlob`: direct, the media proxy on a CORS wall), decoded, the long
 * side capped at `DETECT_SIDE` — handed to the pure `detectSplit`. One reading per (src, n) per
 * session: the bench's editor and the popup over the same sheet share it.
 */
const cache = new Map<string, Promise<SplitDetection | null>>();

async function read(src: string, n: number): Promise<SplitDetection | null> {
  const blob = await fetchMediaBlob(src);
  const bmp = await createImageBitmap(blob);
  try {
    const s = Math.min(1, DETECT_SIDE / Math.max(1, bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    // Transparent pixels read as paper, not as black ink.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return detectSplit(ctx.getImageData(0, 0, w, h).data, w, h, n);
  } finally {
    bmp.close();
  }
}

export function detectSplitOf(
  src: string,
  n: number,
  signal?: AbortSignal,
): Promise<SplitDetection | null> {
  const key = `${n}|${src}`;
  let p = cache.get(key);
  if (!p) {
    p = read(src, n);
    cache.set(key, p);
    // A failed read is not remembered: the next look tries again.
    p.catch(() => cache.delete(key));
  }
  if (!signal) return p;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
