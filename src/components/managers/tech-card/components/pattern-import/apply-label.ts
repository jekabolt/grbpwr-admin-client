import type { ApplyState } from './use-import-session';

/**
 * T5 (09.11): the apply button's words while the apply runs — the files going up, then the card's
 * save. A bare spinner on the button for a minute read as a hang.
 */
export function applyRunningLabel(apply: ApplyState): string | null {
  if (apply.phase !== 'running') return null;
  const states = Object.values(apply.progress);
  return states.length > 0 && states.every((s) => s === 'uploaded') ? 'saving…' : 'uploading…';
}
