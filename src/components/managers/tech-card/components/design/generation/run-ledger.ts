import { ledgerSettle } from '../render/run-ledger';

/**
 * THE ACCEPTED-RUN VISIBILITY HOLD OF FLAT GENERATE (`useStartRun`). The idempotency ledger itself
 * is the shared, operator-scoped ledger in `render/run-ledger.ts`; this map never chooses or mints a
 * request id. It only remembers that an accepted id must not be released until the band actually
 * shows the run it started.
 *
 * AN ID OUTLIVES THE START RESPONSE (Codex c7): it is kept until the run it started shows in a band
 * read (or the start named no run). Deleted right after the response, a delayed or failed refetch
 * left the screen without the run, the retry hold released, and the next press minted a NEW id —
 * a second paid run of the same intent. Kept, that press replays the id and the server answers
 * with the run it already filed.
 */
export const runLedger = new Map<string, string>();

type SharedEntry = { fingerprint: string; operator: string; scope: string };

/** Request id → the run it started, until a band read shows that run. */
const awaiting = new Map<
  string,
  { key: string; card: number; runId: number; requestId: string; shared?: SharedEntry }
>();

/** The start answered with `runId` (0 = no run named): hold the id until the band shows it. */
export function awaitRun(
  key: string,
  card: number,
  runId: number,
  requestId: string,
  shared?: SharedEntry,
): void {
  if (runId <= 0) {
    if (runLedger.get(key) === requestId) runLedger.delete(key);
    if (shared) {
      ledgerSettle(card, shared.scope, shared.fingerprint, 'accepted', requestId, shared.operator);
    }
    return;
  }
  // Keyed by the id, not the fingerprint: a stale accepted answer for an older id must not replace
  // the visibility hold of the newer id now stored under the same intent.
  awaiting.set(requestId, { key, card, runId, requestId, shared });
}

/** A band read of `card`: every held id whose run it shows is released. */
export function settleRunLedger(
  card: number,
  band: { runs?: Array<{ id?: number }> } | undefined,
): void {
  if (!band || awaiting.size === 0) return;
  const shown = new Set((band.runs ?? []).map((r) => r.id ?? 0));
  for (const [requestId, a] of awaiting) {
    if (a.card !== card || !shown.has(a.runId)) continue;
    awaiting.delete(requestId);
    if (runLedger.get(a.key) === a.requestId) runLedger.delete(a.key);
    if (a.shared) {
      ledgerSettle(
        a.card,
        a.shared.scope,
        a.shared.fingerprint,
        'accepted',
        a.requestId,
        a.shared.operator,
      );
    }
  }
}

/** For probes: the id the ledger holds for a key. */
export const ledgerIdOf = (key: string): string | undefined => runLedger.get(key);
