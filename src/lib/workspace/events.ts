// Backend refusals the shell reacts to wherever they come from: a paused team answers
// `team_read_only`, a switched-off section answers `feature_off`, a team at its storage cap answers
// `storage_full` (HTTP 507 on the upload doors). api.ts emits; the workspace provider listens
// (toast, refetch, redirect).

export type WorkspaceSignal = 'read_only' | 'feature_off' | 'storage_full';

type Listener = (signal: WorkspaceSignal) => void;

const listeners = new Set<Listener>();

export function onWorkspaceSignal(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitWorkspaceSignal(signal: WorkspaceSignal): void {
  listeners.forEach((fn) => fn(signal));
}

/** The signal an error carries, if any. */
export function signalOf(message: string, status?: number): WorkspaceSignal | null {
  const m = message.toLowerCase();
  if (status === 507 || m.includes('storage_full')) return 'storage_full';
  if (m.includes('team_read_only')) return 'read_only';
  if (m.includes('feature_off')) return 'feature_off';
  return null;
}
