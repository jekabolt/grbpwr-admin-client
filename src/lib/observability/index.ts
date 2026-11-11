// Error reporting facade. Sentry lives in its own chunk (./sentry) that is fetched only when
// VITE_SENTRY_DSN is set at build time: without a DSN nothing below imports it, no request leaves
// the tab and every function here is a no-op.
//
// Calls made before the chunk has loaded (an error during the first render, an API 5xx on boot)
// are queued and replayed once init finishes, so the early failures are not the ones we lose.

import type { ErrorInfo } from 'react';

type SentryModule = typeof import('./sentry');
type Pending = (m: SentryModule) => void;

// `?.`: the importer's probes bundle the wizard hook for node, where there is no env
const DSN = (import.meta.env?.VITE_SENTRY_DSN || '').trim();
const MAX_PENDING = 20;

let sentry: SentryModule | null = null;
let pending: Pending[] = [];

export const observabilityEnabled = DSN !== '';

function call(fn: Pending) {
  if (!observabilityEnabled) return;
  if (sentry) {
    try {
      fn(sentry);
    } catch {
      /* reporting must never break the caller */
    }
    return;
  }
  if (pending.length < MAX_PENDING) pending.push(fn);
}

/** Loads and starts Sentry. Resolves (never rejects) once it is up, or once it has failed to load. */
export async function initObservability(): Promise<void> {
  if (!observabilityEnabled || sentry) return;
  try {
    const m = await import('./sentry');
    m.init(DSN);
    sentry = m;
  } catch {
    /* a blocked or failed chunk leaves the app exactly as it is without a DSN */
  }
  const queued = pending;
  pending = [];
  if (sentry) queued.forEach(call);
}

/** onError of the top-level ErrorBoundary. The fallback UI is untouched; this only reports. */
export function reportBoundaryError(error: unknown, info: ErrorInfo) {
  call((m) => m.captureBoundaryError(error, info));
}

export interface ApiErrorContext {
  /** Stable RPC name, e.g. "AdminService.GetDictionary" (low cardinality, safe as a tag). */
  route: string;
  status: number;
  method: string;
}

/** Server-side failures of the API wrapper. Only 5xx: 4xx is the user's input, not our bug. */
export function reportApiError(error: unknown, ctx: ApiErrorContext) {
  if (ctx.status < 500 || ctx.status > 599) return;
  call((m) => m.captureApiError(error, ctx));
}

export interface ImportRefusalContext {
  /** The import stage that stopped (`extract`, `sizes`…), when known. */
  stage: string | null;
  /** The importer's error code (`unsupported-format`, `too-large`…). */
  code: string | null;
  /** What the operator was told. */
  message: string;
  /** Names of the dropped files — the owner asked for them, to find the file that failed. */
  files: string[];
}

/** A pattern import the wizard stopped on. The operator's own stop is not one. */
export function reportImportRefusal(ctx: ImportRefusalContext) {
  if (ctx.code === 'cancelled') return;
  call((m) => m.captureImportRefusal(ctx));
}
