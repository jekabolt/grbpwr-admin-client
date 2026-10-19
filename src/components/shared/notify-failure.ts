import { notify } from 'lib/stores/store';

// The status api.ts keeps on the error it throws; a request that never reached the server has none.
const statusOf = (e: unknown) => (e as { status?: number } | null | undefined)?.status;

/** A 4xx other than auth / conflict: the server refused what was sent — it belongs in the form. */
export function isRefusal(e: unknown): boolean {
  const s = statusOf(e);
  return typeof s === 'number' && s >= 400 && s < 500 && ![401, 403, 408, 409, 429].includes(s);
}

/** Lost on the way (network, 5xx, timeout): sending it again may work. */
function isTransient(e: unknown): boolean {
  const s = statusOf(e);
  return s === undefined || s === 408 || s === 429 || s >= 500;
}

export const errorSentence = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/**
 * An error with no place on the page: to the inbox with the server's sentence, and `retry` offered
 * only when the request was lost rather than refused.
 */
export function notifyFailure(subject: string, text: string, e: unknown, retry?: () => void) {
  notify({
    sev: 'error',
    subject,
    text,
    detail: e instanceof Error && e.message ? e.message : undefined,
    action: retry && isTransient(e) ? { label: 'retry', onClick: retry } : undefined,
  });
}
