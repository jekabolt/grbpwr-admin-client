// Fetch a media object's bytes: direct first, media proxy on a CORS failure — the same
// dance the image cropper does (getCropped.ts). The Spaces CDN serves pattern files
// without CORS headers, so any JS consumer (DXF viewer, nesting) needs this.
const MEDIA_PROXY =
  (import.meta.env.VITE_MEDIA_PROXY_URL as string | undefined) ||
  (typeof window !== 'undefined' ? `${window.location.origin}/media-proxy` : '/media-proxy');

export async function fetchMediaBlob(url: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // TypeError = network/CORS wall; an HTTP error status would not throw and gets no retry.
    res = await fetch(`${MEDIA_PROXY}?url=${encodeURIComponent(url)}`);
  }
  if (!res.ok) throw new Error(`media fetch failed: ${res.status}`);
  return res.blob();
}
