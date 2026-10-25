/* global __APP_RELEASE__ */
// Loaded only through ./index (dynamic import) when VITE_SENTRY_DSN is set.
import * as Sentry from '@sentry/react';
import type { ErrorInfo } from 'react';
import type { ApiErrorContext } from './index';

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

// The admin JWT carries the username in `sub`; reading it restores the user after a reload.
function usernameFromStoredToken(): string | null {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return null;
    const { sub } = JSON.parse(atob(token.split('.')[1])) as { sub?: unknown };
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

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
      // The API wrapper logs every response to the console; as breadcrumbs that is only noise.
      ...defaults.filter((i) => i.name !== 'Breadcrumbs'),
      Sentry.breadcrumbsIntegration({ console: false }),
      Sentry.replayIntegration({
        maskAllInputs: true,
        maskAllText: false,
      }),
    ],
  });
  const username = usernameFromStoredToken();
  if (username) setUser(username);
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

export function setUser(username: string | null) {
  Sentry.setUser(
    username ? (username.includes('@') ? { username, email: username } : { username }) : null,
  );
}
