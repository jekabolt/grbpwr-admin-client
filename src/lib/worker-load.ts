// A worker that never came up is a different failure from a worker that crashed while working.
//
// Vercel answers a hashed asset of an earlier deploy with 200 text/html, so a tab opened before a
// deploy spawns a worker whose script is not a script: the `error` event is a plain Event with no
// message, the same as for a missing file or a module syntax error. A throw inside a running worker
// is an ErrorEvent with its message. Every worker announces that its script ran (`WORKER_READY`), so
// a crash without words after that (out of memory) is never read as a load failure.
//
// This file is imported by the workers too: no window, no stores.

/** Posted once from a worker's top level, after its imports evaluated. */
export const WORKER_READY = 'worker-ready';

/** The last line of a worker's top level: its script ran. */
export function announceWorkerReady(): void {
  (globalThis as unknown as { postMessage?: (message: string) => void }).postMessage?.(
    WORKER_READY,
  );
}

export class WorkerLoadError extends Error {
  constructor() {
    super('worker file did not load: the page is an old version or the connection is down');
    this.name = 'WorkerLoadError';
  }
}

/** React Query: refocus and reconnect are a new attempt after a load failure, and only after it. */
export const retryWorkerLoad = (query: { state: { error: unknown } }): boolean =>
  query.state.error instanceof WorkerLoadError;

export type WorkerFailure = 'crash' | 'retry' | 'load';

/**
 * What an `error` event means. `ran`: this worker has posted anything at all. `retried`: this is
 * already the recreated worker. A load failure gets one recreated worker: nothing ran, so nothing is
 * repeated (no file is downloaded twice, no parse runs twice).
 */
export function classifyWorkerError(event: Event, ran: boolean, retried: boolean): WorkerFailure {
  if (ran || (event as ErrorEvent).message) return 'crash';
  return retried ? 'load' : 'retry';
}
