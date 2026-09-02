import { create } from 'zustand';
import { Alert, AlertAction, SnackBarStore } from './store-types';

/**
 * ID SOURCE. A module counter, not the clock. `Date.now()` handed the same id to every toast
 * raised inside one millisecond — which is precisely a burst from a single gesture — so React got
 * duplicate keys and `closeMessage(id)` swept away every twin. A counter cannot collide, and
 * nothing outside this module ever reads the value except as an opaque handle.
 */
let nextAlertId = 0;
/** Activity clock for eviction order. Bumped on creation AND on every coalesced repeat. */
let nextSeq = 0;

/**
 * How many toasts are held at once. Four is the point where the column still reads as a list at a
 * glance; past it the stack stops being a footnote and becomes a page.
 */
const MAX_ALERTS = 4;

/**
 * THE ROW THE OPERATOR IS READING, if any — set by the component from the pointer's real position.
 *
 * Why the store needs to know at all: the component's whole hover contract is "reading is exactly
 * the state in which nothing should disappear", but hover freezes TIMERS, and eviction is not a
 * timer. Without this, a burst of new reports destroyed the row under the cursor, wiping the text
 * selection the operator had just made on it — measured, and it is the precise gesture the
 * component's selection guard exists to protect.
 *
 * A module variable rather than store state on purpose: it changes with every pointer move and
 * must not re-render a single subscriber.
 */
let readingAlertId: number | null = null;

/**
 * Called by `SnackBar`. The id of the ROW, not of whatever pixel the pointer covers — the column
 * is bottom-pinned, so an eviction below the read row slides every survivor down a slot and a
 * position-derived answer migrates to the neighbour under a motionless cursor. `null` means
 * nothing is being read.
 *
 * ⚠ THIS DOES NOT MAKE A TOAST IMMORTAL, and the contract sentence below is not absolute: the
 * component's total-life ceiling closes a toast at twenty seconds whatever this says, mid-reading
 * and mid-selection included. That is a deliberate, owner-facing trade (a corner that never clears
 * is the complaint being fixed) and it is named here so the guarantee is not read as unconditional.
 */
export function markAlertBeingRead(id: number | null) {
  readingAlertId = id;
}

/**
 * A message may occupy the corner for one ceiling, not forever. Without this the ceiling only
 * recycled the INSTANCE: it closed the toast at twenty seconds and the very next repeat opened an
 * identical one, so a caller polling every 1.5s turned "the corner never clears" into "the corner
 * blinks every twenty seconds" — measured, and no better for the operator. Muting is per exact
 * (severity, message), it SLIDES on every further repeat, so the corner stays free for as long as
 * the thing keeps happening, and it lifts once the message has been quiet — a report that stops
 * and later starts again is news, and is shown.
 */
const REPEAT_MUTE_MS = 20000;
const mutedUntil = new Map<string, number>();
const repeatKey = (severity: string, message: string) => `${severity}\u0000${message}`;

/** Called by `SnackBar` when the LIFE CEILING ends a toast that had been repeating. */
export function muteRepeats(severity: 'success' | 'error', message: string) {
  mutedUntil.set(repeatKey(severity, message), Date.now() + REPEAT_MUTE_MS);
}

/**
 * WHO GOES WHEN THE COLUMN IS FULL.
 *
 * Two rules, in order:
 *   1. Never the row being read. Eviction is the one way a toast can vanish while the operator's
 *      pointer is on it, and a vanishing target mid-selection is the defect this spares.
 *   2. Otherwise the LEAST RECENTLY REPORTED success; only when there is no evictable success at
 *      all does the least recently reported error go.
 *
 * Ordering is by `seq` (activity), not by array index (arrival). A coalescing message keeps its
 * position so the column does not reshuffle under the pointer, and ordering by position therefore
 * made the most frequently repeating report — the most current thing on screen — the first victim.
 *
 * WHAT THIS STILL COSTS, SAID OUT LOUD: with a cap, a single gesture that raises FIVE distinct
 * errors at once loses one of them before it is ever painted. Dropping the newest instead would
 * lose a different one, equally unseen; there is no eviction rule that makes a cap free. Four
 * distinct errors — the "form reporting three invalid fields" case this is written for — fit.
 * A message that genuinely must survive being read is a `CalloutBox`, which DESIGN.md already
 * says stays until it is resolved: "a partial save is not a toast".
 */
function evictOne(alerts: Alert[]): Alert[] {
  const spared = alerts.filter((a) => a.id !== readingAlertId);
  /* `spared` cannot actually run empty: only ONE row is ever held and the cap is above one, so at
     least three candidates always remain. The fallback is here so that lowering `MAX_ALERTS` to 1
     some day cannot make the `reduce` below throw on an empty array — not because a held row is
     expected to be the last one standing. */
  const pool = spared.length > 0 ? spared : alerts;
  const successes = pool.filter((a) => a.severity === 'success');
  const from = successes.length > 0 ? successes : pool;
  const victim = from.reduce((oldest, a) => (a.seq < oldest.seq ? a : oldest));
  return alerts.filter((a) => a !== victim);
}

export const useSnackBarStore = create<SnackBarStore>((set) => ({
  alerts: [],
  /**
   * The signature is frozen: 165 files call this and none of them is edited. Everything the
   * round-14 complaint asked for (fewer, smaller, shorter-lived toasts) happens here and in the
   * component, invisibly to callers.
   */
  showMessage: (message: string, severity: 'success' | 'error', action?: AlertAction) => {
    /* Muted repeat: swallow it and PUSH THE WINDOW OUT, so a caller on a retry cadence keeps the
       corner free rather than re-occupying it the instant the ceiling fires. Checked before `set`
       so a swallowed report costs no re-render at all. */
    const key = repeatKey(severity, message);
    const until = mutedUntil.get(key);
    if (until !== undefined) {
      if (until > Date.now()) {
        mutedUntil.set(key, Date.now() + REPEAT_MUTE_MS);
        return;
      }
      mutedUntil.delete(key);
    }
    set((state) => {
      /* COALESCING. An identical report while the first one is still on screen is not news; it is
         the same news, again. It increments the counter in place — position kept, so the column
         does not reshuffle under the pointer — and bumps `nonce` so the timer starts over, and
         `seq` so eviction counts it as fresh. `bornAt` is deliberately NOT refreshed: the
         component's life ceiling is measured from the first appearance, which is what stops a
         message on a 1.5s retry cadence from living forever. */
      const twin = state.alerts.findIndex((a) => a.severity === severity && a.message === message);
      if (twin !== -1) {
        const alerts = state.alerts.slice();
        const held = alerts[twin];
        alerts[twin] = {
          ...held,
          count: held.count + 1,
          nonce: held.nonce + 1,
          seq: (nextSeq += 1),
          action: held.action ?? action,
        };
        return { alerts };
      }

      const fresh: Alert = {
        message,
        severity,
        id: (nextAlertId += 1),
        action,
        count: 1,
        nonce: 0,
        bornAt: Date.now(),
        seq: (nextSeq += 1),
      };
      const kept = state.alerts.length < MAX_ALERTS ? state.alerts : evictOne(state.alerts);
      return { alerts: [...kept, fresh] };
    });
  },
  closeMessage: (id: number) => {
    set((state) => ({
      alerts: state.alerts.filter((alert) => alert.id !== id),
    }));
  },
  clearAll: () => {
    set({ alerts: [] });
  },
}));
