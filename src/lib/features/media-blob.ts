import { mediaProxyHeaders, mediaProxyUrl } from './media-proxy';

// Fetch a media object's bytes: direct first, media proxy on a CORS failure — the same
// dance the image cropper does (getCropped.ts). The Spaces CDN serves pattern files
// without CORS headers, so any JS consumer (DXF viewer, nesting) needs this.
// `proxyHeaders`: a Web Worker has no localStorage, so its caller hands it the auth headers.

export async function fetchMediaBlob(
  url: string,
  signal?: AbortSignal,
  proxyHeaders?: Record<string, string>,
): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    // An abort is the caller's deadline, not a CORS wall: it does not go round through the proxy.
    if (signal?.aborted) throw e;
    // TypeError = network/CORS wall; an HTTP error status would not throw and gets no retry.
    const headers = proxyHeaders ?? mediaProxyHeaders();
    res = await fetch(
      mediaProxyUrl(url),
      Object.keys(headers).length > 0 ? { signal, headers } : { signal },
    );
  }
  if (!res.ok) throw new Error(`media fetch failed: ${res.status}`);
  return res.blob();
}
