import { authHeaders } from 'api/auth-headers';

// The media proxy: the way round a CDN that serves objects without CORS headers.
// `VITE_MEDIA_PROXY_URL` unset → the legacy same-origin `/media-proxy` (Vercel function / Vite dev
// middleware), called exactly as before, with no auth. Set → the backend file proxy
// (`https://<api host>/api/files/proxy`), which is team-scoped and wants the session token, so every
// call through it carries the same auth headers the API calls do.

/** The configured backend file proxy; '' when the build has none. Read per call (tests stub it). */
export function configuredMediaProxy(): string {
  return (import.meta.env.VITE_MEDIA_PROXY_URL as string | undefined) || '';
}

/** The proxy base: the configured one, else the legacy same-origin `/media-proxy`. */
export function mediaProxyBase(): string {
  return (
    configuredMediaProxy() ||
    (typeof window !== 'undefined' ? `${window.location.origin}/media-proxy` : '/media-proxy')
  );
}

/** `<proxy>?url=<object url>`. */
export function mediaProxyUrl(url: string, base: string = mediaProxyBase()): string {
  return `${base}?url=${encodeURIComponent(url)}`;
}

/** Headers for a call through the proxy: auth for the backend proxy, none for the legacy one. */
export function mediaProxyHeaders(): Record<string, string> {
  return configuredMediaProxy() ? authHeaders() : {};
}
