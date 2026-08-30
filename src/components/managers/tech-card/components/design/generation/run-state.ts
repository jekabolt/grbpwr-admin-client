import type {
  GetDesignBandResponse,
  common_DesignRun,
  common_DesignRunParams,
} from 'api/proto-http/admin';

import { hideBlockReason, stampIsSet, type HideBlockReason, type HideGuard } from '../visibility';
import { viewLabel } from '../views';

/**
 * WHAT A RUN IS DOING RIGHT NOW — pure readers over `common_DesignRun`, no React, no queries.
 *
 * The rules live here rather than inside the history component because three organs ask the same
 * questions of the same row (the history line, the run panel, the poller), and a status vocabulary
 * spelled three times drifts the first time the server adds a member. `status` is an OPEN string on
 * the wire — `pending | running | done | failed | cancelled` today — so every reader below treats an
 * unknown value as «not one of ours» rather than as `done`.
 */

/** The two statuses that mean the band must keep looking. */
export const LIVE_STATUSES: readonly string[] = ['pending', 'running'];

export function runStatus(run: Pick<common_DesignRun, 'status'>): string {
  return (run.status ?? '').trim().toLowerCase();
}

export function isRunLive(run: Pick<common_DesignRun, 'status'>): boolean {
  return LIVE_STATUSES.includes(runStatus(run));
}

/**
 * Asked to stop, but the answer may still arrive AND STILL BE PAID FOR. The contract is explicit
 * that a result landing after this stamp is recorded rather than dropped, so the pill says
 * `cancelling…` and never `cancelled` — the ledger decides which of the two it becomes.
 */
export function isCancelling(
  run: Pick<common_DesignRun, 'status' | 'cancelRequestedAt'>,
): boolean {
  return isRunLive(run) && stampIsSet(run.cancelRequestedAt);
}

/** Does anything on this card still need watching? Drives the poll, and nothing else. */
export function hasLiveRun(band: GetDesignBandResponse): boolean {
  return (band.runs ?? []).some(isRunLive);
}

export function liveRuns(band: GetDesignBandResponse): common_DesignRun[] {
  return (band.runs ?? []).filter(isRunLive);
}

/**
 * HOW MANY TILES TO RESERVE UNDER A RUNNING ROW.
 *
 * `requested_outputs` is the SERVER'S OWN denominator and it is preferred whenever it is stated —
 * the client's arithmetic below is a fallback for a row that predates it, not a second opinion.
 * The fallback repeats the prototype's rule verbatim: a fix asks for one picture, a `one` layout
 * over two or more views comes back as ONE composite, and everything else is one picture per view.
 */
export function expectedTileCount(run: common_DesignRun): number {
  const requested = run.requestedOutputs ?? 0;
  if (requested > 0) return requested;
  const views = run.params?.views ?? [];
  const kind = (run.kind ?? '').trim().toLowerCase();
  if (kind === 'flat') {
    if ((run.params?.fixTarget ?? '').trim()) return 1;
    if ((run.params?.layout ?? '').trim() === 'one' && views.length >= 2) return 1;
    return Math.max(1, views.length);
  }
  if (kind === 'render') return Math.max(1, (run.inputs?.slots ?? []).length);
  return 1;
}

/**
 * The right-hand note of a finished row: how it ended, and — when it ended badly — why.
 *
 * `done · 2 of 3` is not decoration: without the denominator a partial provider answer is
 * indistinguishable from a complete one, and the money was spent either way.
 */
export function runOutcomeNote(run: common_DesignRun): string {
  const status = runStatus(run);
  const delivered = (run.pictures ?? []).length;
  const requested = expectedTileCount(run);
  if (status === 'done') {
    return delivered && requested && delivered < requested
      ? `done · ${delivered} of ${requested}`
      : 'done';
  }
  if (status === 'failed') {
    const why = (run.errorCode ?? '').trim() || (run.lastError ?? '').trim();
    return why ? `failed · ${why}` : 'failed';
  }
  if (status === 'cancelled') return 'cancelled';
  if (isCancelling(run)) return 'cancelling…';
  return status;
}

/**
 * WHY ARCHIVE IS OFF FOR THIS ROW.
 *
 * Archiving hides a row wholesale, so it is refused while ANY picture of the run is protected —
 * otherwise `archive` would quietly do in bulk what the ✕ on each tile refuses to do one at a time.
 * The reasons are the server's own tokens, read through the same guard the tiles read.
 */
export function archiveBlockReason(
  run: common_DesignRun,
  guard: HideGuard,
): HideBlockReason | null {
  for (const picture of run.pictures ?? []) {
    const reason = hideBlockReason(picture.id ?? 0, guard);
    if (reason) return reason;
  }
  return null;
}

/**
 * The caption of a history line.
 *
 * `from references` is claimed ONLY for a run that is provably the first one on the card. The band
 * pages, so «the oldest row I have been given» is not the same statement as «the oldest row there
 * is» — pass `firstRunId` only when the whole history is on screen, and the caption degrades to
 * `run N` rather than lying about which run started this card.
 */
export function runCaption(run: common_DesignRun, firstRunId?: number | null): string {
  const ask = (run.ask ?? '').trim();
  if (ask) return ask;
  const id = run.id ?? 0;
  if (firstRunId && id && id === firstRunId) return 'from references';
  return id ? `run ${id}` : 'run';
}

/** `front, back · per view` — what was asked for, spoken the way the rest of the band spells views. */
export function viewsLine(params?: common_DesignRunParams | null): string {
  const views = (params?.views ?? []).map((v) => viewLabel(v)).filter(Boolean);
  const layout = (params?.layout ?? '').trim();
  const layoutText =
    layout === 'one' ? 'one picture' : layout === 'per_view' ? 'a picture per view' : layout;
  const left = views.length ? views.join(', ') : '—';
  return layoutText ? `${left} · ${layoutText}` : left;
}

/**
 * `fix: back` — the silhouette side this run was asked to repair, or empty when it is an ordinary
 * run. Detail slots are deliberately not targetable by the contract, so there is no second spelling
 * to accept here.
 */
export function fixTargetOf(run: common_DesignRun): string {
  return (run.params?.fixTarget ?? '').trim();
}
