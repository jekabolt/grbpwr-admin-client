import { mediaProxyBase, mediaProxyHeaders, mediaProxyUrl } from './media-proxy';

// Fetch a media object's bytes: direct first, media proxy on a CORS failure — the same
// dance the image cropper does (getCropped.ts). The Spaces CDN serves pattern files
// without CORS headers, so any JS consumer (DXF viewer, nesting) needs this.
// A private team file read by its bare url answers 403 (only signed links open it): that goes
// round through the proxy too, which reads it with the team's own rights.
// `proxyHeaders`: a Web Worker has no localStorage, so its caller hands it the auth headers.

export async function fetchMediaBlob(
  url: string,
  signal?: AbortSignal,
  proxyHeaders?: Record<string, string>,
): Promise<Blob> {
  const viaProxy = () => {
    const headers = proxyHeaders ?? mediaProxyHeaders();
    return fetch(
      mediaProxyUrl(url),
      Object.keys(headers).length > 0 ? { signal, headers } : { signal },
    );
  };
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    // An abort is the caller's deadline, not a CORS wall: it does not go round through the proxy.
    if (signal?.aborted) throw e;
    // TypeError = network/CORS wall.
    res = await viaProxy();
  }
  // 403 on the bare url = a private object; a proxy url that answers 403 is not retried.
  if (res.status === 403 && !url.startsWith(`${mediaProxyBase()}?`)) res = await viaProxy();
  if (!res.ok) throw new Error(`media fetch failed: ${res.status}`);
  return res.blob();
}
