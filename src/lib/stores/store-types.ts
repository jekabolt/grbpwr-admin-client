// An optional one-shot action rendered as a button inside the toast (e.g. "view" on "Entry #12
// posted"). Kept as a plain label+callback pair — navigation, modal-opening etc. stay the caller's
// concern; the snackbar only invokes and dismisses.
export interface AlertAction {
  label: string;
  onClick: () => void;
}

export interface Alert {
  message: string;
  severity: 'success' | 'error';
  /**
   * Monotonic, never `Date.now()`. Two `showMessage` calls in the same millisecond used to share
   * an id: React saw a duplicate key, and `closeMessage(id)` removed both toasts at once. A burst
   * from one gesture (the vector editor narrating a drop, a form reporting three invalid fields)
   * is exactly the case that lands inside one tick, so the collision was the common path, not the
   * rare one.
   */
  id: number;
  action?: AlertAction;
  /**
   * How many identical (severity + message) reports have arrived while this toast was live.
   * Rendered as `×N` next to the ok/error word instead of stacking N copies of the same sentence.
   */
  count: number;
  /**
   * Bumped on every coalesced repeat. The component watches it to restart the dismiss timer, so a
   * message that keeps happening keeps its full reading time instead of expiring on the first
   * arrival's clock. It carries no meaning beyond "it happened again" and is never displayed.
   */
  nonce: number;
  /**
   * Wall clock of the FIRST appearance, kept across coalesced repeats. It exists so the component
   * can enforce a ceiling on total on-screen life: without one, a caller on a poll or retry
   * cadence shorter than the toast's duration restarts the timer forever and pins a permanent
   * toast in the corner (measured: a message re-reported every 1.5s was still up at 23s, count 16).
   */
  bornAt: number;
  /**
   * Monotonic ACTIVITY stamp: bumped on creation and again on every coalesced repeat. Eviction
   * orders by this rather than by array position, so "oldest" means least recently reported rather
   * than first created. A message that keeps re-firing is the most current thing in the column;
   * ordering by position made it the first victim precisely because it arrived first.
   */
  seq: number;
}

export interface SnackBarStore {
  alerts: Alert[];
  showMessage: (message: string, severity: 'success' | 'error', action?: AlertAction) => void;
  closeMessage: (id: number) => void;
  clearAll: () => void;
}
