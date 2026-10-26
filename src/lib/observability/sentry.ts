/* global __APP_RELEASE__ */
// Loaded only through ./index (dynamic import) when VITE_SENTRY_DSN is set.
import * as Sentry from '@sentry/react';
import type { ErrorInfo } from 'react';
import type { ApiErrorContext } from './index';
import { scrubEnvelope } from './scrub';

const PROD_BACKEND_HOST = 'backend.grbpwr.com';

// The contour is told apart the same way the rest of the app does it: by the backend it talks to.
function environment(): 'prod' | 'beta' {
  try {
    const host = new URL(import.meta.env.VITE_SERVER_URL || '').hostname.replace(/\.$/, '');
    return host === PROD_BACKEND_HOST ? 'prod' : 'beta';
  } catch {
    return 'beta';
  }
}

// Default integrations that stay off:
// - Breadcrumbs: fetch/xhr and history breadcrumbs keep full URLs, and admin API calls carry
//   email=, q=, search= and name= in the query; clicks keep element attributes. The on-error
//   replay already shows what led to the error.
// - BrowserSession: a session envelope on every page load and navigation, with no error in it.
const OFF = new Set(['Breadcrumbs', 'BrowserSession']);

export function init(dsn: string) {
  Sentry.init({
    dsn,
    release: __APP_RELEASE__ || undefined,
    environment: environment(),
    sendDefaultPii: false,
    // No performance tracing, and no trace headers on API calls: the backend's CORS allowlist
    // does not know sentry-trace/baggage, and a rejected preflight would break every request.
    tracesSampleRate: 0,
    tracePropagationTargets: [],
    // Replay is buffered in memory and sent only together with an error.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: (defaults) => [
      ...defaults.filter((i) => !OFF.has(i.name)),
      Sentry.replayIntegration({
        maskAllInputs: true,
        maskAllText: true,
        // Plain JSON segments, so the transport below can scrub page URLs out of them.
        useCompression: false,
      }),
    ],
    // Every envelope is scrubbed on its way out (./scrub): no query strings, no email addresses.
    transport: (options) => {
      const inner = Sentry.makeFetchTransport(options);
      return { ...inner, send: (envelope) => inner.send(scrubEnvelope(envelope)) };
    },
  });
}

export function captureBoundaryError(error: unknown, info: ErrorInfo) {
  Sentry.captureReactException(error, info, {
    mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
  });
}

export function captureApiError(error: unknown, { route, status, method }: ApiErrorContext) {
  Sentry.captureException(error, {
    tags: { route, status: String(status), 'http.method': method },
    // One issue per failing RPC and status, not one per error message text.
    fingerprint: ['api-5xx', route, String(status)],
  });
}
