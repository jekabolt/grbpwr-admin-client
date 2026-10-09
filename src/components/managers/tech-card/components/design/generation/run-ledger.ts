import type { GetDesignBandResponse } from 'api/proto-http/admin';

/**
 * THE IDEMPOTENCY LEDGER OF GENERATE (`useStartRun`): card + fingerprint → the request id of that
 * intent. Module-level, so a remount never mints a second id for the same intent.
 *
 * AN ID OUTLIVES THE START RESPONSE (Codex c7): it is kept until the run it started shows in a band
 * read (or the start named no run). Deleted right after the response, a delayed or failed refetch
 * left the screen without the run, the retry hold released, and the next press minted a NEW id —
 * a second paid run of the same intent. Kept, that press replays the id and the server answers
 * with the run it already filed.
 */
export const runLedger = new Map<string, string>();

/** Ledger key → the run its id started, until a band read shows that run. */
const awaiting = new Map<string, { card: number; runId: number; requestId: string }>();

/** The start answered with `runId` (0 = no run named): hold the id until the band shows it. */
export function awaitRun(key: string, card: number, runId: number, requestId: string): void {
  if (runId <= 0) {
    if (runLedger.get(key) === requestId) runLedger.delete(key);
    return;
  }
  awaiting.set(key, { card, runId, requestId });
}

/** A band read of `card`: every held id whose run it shows is released. */
export function settleRunLedger(card: number, band: GetDesignBandResponse | undefined): void {
  if (!band || awaiting.size === 0) return;
  const shown = new Set((band.runs ?? []).map((r) => r.id ?? 0));
  for (const [key, a] of awaiting) {
    if (a.card !== card || !shown.has(a.runId)) continue;
    awaiting.delete(key);
    if (runLedger.get(key) === a.requestId) runLedger.delete(key);
  }
}

/** For probes: the id the ledger holds for a key. */
export const ledgerIdOf = (key: string): string | undefined => runLedger.get(key);
