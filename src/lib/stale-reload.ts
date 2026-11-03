// The one way a tab recovers from a file of an older deploy: lazy routes (index.tsx) and workers
// (worker-load.ts) both end here. A reload must never lose unsaved work.
import { notify } from 'lib/stores/store';
import { WorkerLoadError } from 'lib/worker-load';

const RELOAD_STAMP = 'chunk-reload-at';
const RELOAD_BUILD = 'chunk-reload-build';
const RELOAD_WINDOW_MS = 10_000;

// Storage is behind try/catch on purpose: this is the recovery path, and a sessionStorage that
// throws (locked-down privacy mode) must not be what turns a stale file into a crash.
function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the reload still happens, just unguarded */
  }
}

/** The entry script of this tab: its hash is the build. */
function currentBuild(): string {
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return entry?.src ?? '';
}

/**
 * A timestamp rather than a flag: a tab left open across two separate deploys deserves its one
 * reload each time, but a failure that repeats within seconds of a reload is a real failure and
 * belongs in the error boundary, not in a reload loop. Unreadable storage means "no reload recorded".
 */
export function reloadWindowOpen(now = Date.now()): boolean {
  return now - Number(read(RELOAD_STAMP) ?? 0) > RELOAD_WINDOW_MS;
}

export function reloadForNewVersion(): void {
  write(RELOAD_STAMP, String(Date.now()));
  write(RELOAD_BUILD, currentBuild());
  window.location.reload();
}

/**
 * Whether leaving now would lose work: every `beforeunload` guard of the page (the tech card's, the
 * upload queue, useBlockNavigation) answers one probe, so there is no second list to keep in step.
 */
export function pageHoldsUnsavedWork(): boolean {
  const probe = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(probe);
  return probe.defaultPrevented;
}

export type StaleRecovery = 'reload' | 'ask' | 'none';

/**
 * What a failed worker load does to the tab. `none`: no connection (a reload would drop the page
 * itself), or the last reload came back with this same build, so a new one would bring nothing and
 * the file is broken rather than old. `ask`: a reload would lose work, or one just ran.
 */
export function staleRecoveryOf(s: {
  online: boolean;
  reloadedFromBuild: string | null;
  build: string;
  holdsWork: boolean;
  windowOpen: boolean;
}): StaleRecovery {
  if (!s.online) return 'none';
  if (s.reloadedFromBuild === s.build) return 'none';
  return s.holdsWork || !s.windowOpen ? 'ask' : 'reload';
}

/** The error of a worker that did not load, after one retry; the tab recovers as a stale chunk does. */
export function workerLoadFailed(): WorkerLoadError {
  const recovery = staleRecoveryOf({
    online: navigator.onLine !== false,
    reloadedFromBuild: read(RELOAD_BUILD),
    build: currentBuild(),
    holdsWork: pageHoldsUnsavedWork(),
    windowOpen: reloadWindowOpen(),
  });
  if (recovery === 'reload') reloadForNewVersion();
  else if (recovery === 'ask')
    notify({
      sev: 'warn',
      subject: 'PAGE',
      text: 'old version',
      key: 'page-old-version',
      action: { label: 'reload', onClick: reloadForNewVersion },
    });
  return new WorkerLoadError();
}
