const MAX_BODY_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

// These are the two exact hosts emitted by the media/pattern bucket: its public CDN name and
// its virtual-hosted DigitalOcean Spaces origin. Beta uses the same hosts under a different
// object-key prefix. Keep this list exact: no grbpwr.com or digitaloceanspaces.com wildcard.
export const DEFAULT_MEDIA_PROXY_ALLOWED_HOSTS = Object.freeze([
  'files.grbpwr.com',
  'grbpwr.fra1.digitaloceanspaces.com',
]);

/**
 * Resolve the exact-host allowlist. A non-empty environment value replaces the built-in list;
 * entries are comma-separated hostnames, not URLs or wildcard patterns.
 */
export function mediaProxyAllowedHosts(override) {
  const source =
    typeof override === 'string' && override.trim()
      ? override.split(',')
      : DEFAULT_MEDIA_PROXY_ALLOWED_HOSTS;
  return new Set(source.map((host) => host.trim().toLowerCase()).filter(Boolean));
}

/**
 * Parse and validate a media URL without I/O or environment access. Returns the parsed URL when
 * accepted and null otherwise.
 */
export function validateMediaUrl(rawUrl, allowedHosts = mediaProxyAllowedHosts()) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  // URL normalises an explicitly empty userinfo (`https://@host`) away, so also reject an @ in
  // the raw authority. Non-empty credentials remain visible through username/password.
  const rawAuthority = rawUrl.trim().match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1] ?? '';
  const hasUserinfo = rawAuthority.includes('@') || url.username !== '' || url.password !== '';

  if (
    url.protocol !== 'https:' ||
    hasUserinfo ||
    url.port !== '' ||
    !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    return null;
  }

  return url;
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendError(res, status, message) {
  res.statusCode = status;
  res.end(message);
}

function setResponseHeaders(res, headers) {
  const upstreamContentType = headers.get('content-type');
  const baseContentType = upstreamContentType?.split(';', 1)[0].trim().toLowerCase() ?? '';

  // The bucket stores DXF as image/vnd.dxf, so it is covered here. DXF consumers fetch a Blob and
  // parse its bytes; legacy application/dxf, PDF, GLB and all other types remain usable as an
  // attachment with application/octet-stream. SVG is never reflected inline on the admin origin.
  if (baseContentType.startsWith('image/') && baseContentType !== 'image/svg+xml') {
    res.setHeader('Content-Type', upstreamContentType);
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
  }

  for (const header of ['cache-control', 'etag', 'last-modified']) {
    const value = headers.get(header);
    if (value !== null) res.setHeader(header, value);
  }

  // fetch() hands us the DECOMPRESSED body — forwarding the upstream encoding/length
  // headers with it makes the browser try to re-decode and fail.
}

async function readLimitedBody(resp, controller) {
  const declaredLength = resp.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_BODY_BYTES) {
    await resp.body?.cancel();
    throw new Error('Upstream body too large');
  }

  if (!resp.body) return Buffer.alloc(0);

  const reader = resp.body.getReader();
  const chunks = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        controller.abort();
        throw new Error('Upstream body too large');
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }

  return Buffer.concat(chunks, size);
}

/** Shared by the Vercel function and the Vite development middleware. */
export async function proxyMedia(
  rawUrl,
  res,
  allowlistOverride = process.env.MEDIA_PROXY_ALLOWED_HOSTS,
) {
  setSecurityHeaders(res);

  const url = validateMediaUrl(rawUrl, mediaProxyAllowedHosts(allowlistOverride));
  if (!url) {
    sendError(res, 400, 'Invalid url');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      headers: { Accept: '*/*' },
      redirect: 'manual',
      signal: controller.signal,
    });
    if (resp.status >= 300 && resp.status < 400) {
      await resp.body?.cancel();
      throw new Error(`Upstream redirect ${resp.status}`);
    }
    if (!resp.ok) {
      await resp.body?.cancel();
      throw new Error(`Upstream ${resp.status}`);
    }

    const body = await readLimitedBody(resp, controller);
    setResponseHeaders(res, resp.headers);
    res.statusCode = resp.status;
    res.end(body);
  } catch {
    sendError(res, 502, 'Proxy fetch failed');
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  const rawUrl = typeof req.query?.url === 'string' ? req.query.url : null;
  await proxyMedia(rawUrl, res);
}
