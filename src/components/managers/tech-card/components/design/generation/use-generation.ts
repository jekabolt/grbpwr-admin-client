import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  GetDesignBandResponse,
  ListDesignRunsResponse,
  common_DesignBatch,
  common_DesignRun,
  common_DesignRunParams,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { designKeys, newClientRequestId, useDesignWrites } from '../use-design-band';
import { hasLiveRun } from './run-state';

/**
 * THE GENERATIVE HALF OF THE BAND'S SEAM.
 *
 * `use-design-band.ts` is the band's data seam and stays exactly as it was: ONE read, one cache key
 * per card, and every write invalidating exactly it. This file is that seam CONTINUED, not forked —
 * it imports `designKeys` and reuses `useDesignWrites(...).invalidate`, so a run that lands and an
 * upload that lands refresh the same single query, and the bench can never disagree with the
 * history about which instant of the card is on screen.
 *
 * It exists as a second file only because the reading half is shared by organs that must keep
 * working on a contour without generation, while everything here is unreachable there by
 * construction: no run row can exist to cancel or archive.
 */

/** The generative RPCs. Nothing else in the band calls them. */
export function useGenerationWrites(techCardId?: number) {
  const { showMessage } = useSnackBarStore();
  const { invalidate } = useDesignWrites(techCardId);

  const onError = useCallback(
    (error: unknown) => {
      showMessage((error as Error)?.message || 'the run did not start', 'error');
      // Even a refusal moves the day's money on the server (a reservation released, an attempt
      // billed), so the band is re-read rather than left showing a budget from before the attempt.
      invalidate();
    },
    [showMessage, invalidate],
  );

  /**
   * OPEN A PAID JOB.
   *
   * `client_request_id` IS MINTED BY THE CALLER, once per human intent, and is deliberately NOT
   * minted in here: a double click on GENERATE must be ONE payment, and that only works if the
   * retry carries the SAME id. A fresh id per attempt would make the server honestly start a second
   * paid run — which is the exact failure the field exists to prevent.
   *
   * THE INPUTS ARE NOT SENT AND CANNOT BE. The server snapshots the references, the moodboard, the
   * garment description and the bench itself; provenance a caller supplies is a claim, not
   * provenance. Only what is being ASKED FOR travels — views, layout, fix target.
   */
  const startRun = useMutation({
    mutationFn: (input: {
      clientRequestId: string;
      kind: string;
      ask: string;
      params: common_DesignRunParams;
    }) =>
      adminService.StartDesignRun({
        techCardId: techCardId ?? 0,
        clientRequestId: input.clientRequestId,
        kind: input.kind,
        ask: input.ask,
        params: input.params,
      }),
    onSuccess: invalidate,
    onError,
  });

  /**
   * STOP A RUN. `pending` → `cancelled` outright; a run already in flight keeps running with
   * `cancel_requested_at` stamped, because the provider call cannot be recalled and the money it
   * costs is spent either way. The row says so rather than pretending otherwise.
   */
  const cancelRun = useMutation({
    mutationFn: (runId: number) => adminService.CancelDesignRun({ runId }),
    onSuccess: invalidate,
    onError,
  });

  /** Presentational and reversible. It hides the ROW; picture invisibility has its own verb. */
  const archiveRun = useMutation({
    mutationFn: (input: { runId: number; archived: boolean }) =>
      adminService.ArchiveDesignRun({ runId: input.runId, archived: input.archived }),
    onSuccess: invalidate,
    onError,
  });

  /**
   * The TEXT run. It executes inline and comes back finished, but it is still a row in the money
   * register — which is the whole reason it goes through this machine instead of being a free
   * button. `StartDesignRun` refuses `draft_idea` on purpose; this is its only door.
   */
  const draftIdea = useMutation({
    mutationFn: (clientRequestId: string) =>
      adminService.DraftDesignIdea({ techCardId: techCardId ?? 0, clientRequestId }),
    onSuccess: invalidate,
    onError,
  });

  return useMemo(
    () => ({ startRun, cancelRun, archiveRun, draftIdea, invalidate }),
    [startRun, cancelRun, archiveRun, draftIdea, invalidate],
  );
}

export type StartRunInput = {
  /** flat | render | threed. `draft_idea` is refused by the server — it has its own verb. */
  kind: 'flat' | 'render' | 'threed';
  /** The delta phrase the human typed; the caption of the history row. May be empty. */
  ask: string;
  params: common_DesignRunParams;
};

export type StartRunState = {
  /** `onStarted` fires only when the row is actually filed — never on the click. */
  start: (input: StartRunInput, onStarted?: () => void) => void;
  isPending: boolean;
  isError: boolean;
};

/**
 * GENERATE, WITH ITS IDEMPOTENCY LEDGER — the single door every generative screen presses.
 *
 * The id is remembered AGAINST A FINGERPRINT OF WHAT WAS ASKED FOR. Pressing GENERATE again after a
 * failure, with nothing changed, replays the same id and the server hands back the run that already
 * exists instead of starting a second paid one. Changing anything at all mints a new id, because
 * that is a new intent — replaying the old one there would return the OLD run with OK and the
 * screen would report success for a request nobody made. A success clears the ledger, so the next
 * press is a new run rather than an idempotent echo of the last.
 *
 * THIS IS WHERE THE THREE STUDIOS MEET. FLAT, FABRIC RENDER and 3D differ only in `kind` and in what
 * they put in `params`; the money, the idempotency and the invalidation are one mechanism, and a
 * second copy of it is precisely where two screens start disagreeing about what a retry means.
 */
export function useStartRun(techCardId?: number): StartRunState {
  const { showMessage } = useSnackBarStore();
  const { startRun } = useGenerationWrites(techCardId);
  const ledger = useRef<{ fingerprint: string; id: string } | null>(null);

  const start = useCallback(
    (input: StartRunInput, onStarted?: () => void) => {
      if (!techCardId || techCardId <= 0) return;
      const fingerprint = JSON.stringify([input.kind, input.ask, input.params]);
      if (ledger.current?.fingerprint !== fingerprint) {
        ledger.current = { fingerprint, id: newClientRequestId() };
      }
      startRun.mutate(
        { ...input, clientRequestId: ledger.current.id },
        {
          onSuccess: () => {
            ledger.current = null;
            // The run comes back PENDING, not done: the pictures arrive when the provider answers.
            // Saying so is the difference between «nothing happened» and «it was booked».
            showMessage(
              'run started — the pictures land in the history when it finishes',
              'success',
            );
            // The caller clears its fields HERE and not on the click: clearing the ask before the
            // row is filed would change the fingerprint under a failed attempt, and the retry would
            // mint a fresh id and buy a second picture.
            onStarted?.();
          },
        },
      );
    },
    [techCardId, startRun, showMessage],
  );

  return { start, isPending: startRun.isPending, isError: startRun.isError };
}

/**
 * WHILE A RUN IS IN FLIGHT, RE-READ THE BAND.
 *
 * A run is the one thing on this card that changes without anybody touching the screen, and
 * `status` is the field the contract says to poll. The poll INVALIDATES the single band query
 * rather than opening a second one: a second observer with its own options would fight the seam's
 * deliberate `retry` guard (a rolled-back binary answers 501 to every ask, and a poll would turn
 * that into a storm) and would let the bench and the history hold two different instants.
 *
 * It stops the moment nothing is live. `document.hidden` is honoured because a background tab that
 * polls for an hour is how a tab-switching operator's laptop gets warm for nothing.
 */
export function useRunPolling(techCardId: number | undefined, band: GetDesignBandResponse) {
  const { invalidate } = useDesignWrites(techCardId);
  const live = hasLiveRun(band);
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  useEffect(() => {
    if (!live || !techCardId) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      invalidateRef.current();
    }, 4000);
    return () => window.clearInterval(id);
  }, [live, techCardId]);

  return live;
}

/**
 * `0:14` since a stamp, reticking every second. Empty while the stamp is unset — a run that has not
 * started has no elapsed time, and `0:00` would claim it just did.
 *
 * NO ETA IS DRAWN ANYWHERE. The prototype's `~25 s` was a constant of the prototype; nothing on the
 * wire states how long a profile takes, and a made-up denominator on a progress line is a promise
 * the product cannot keep.
 */
export function useElapsed(stamp?: string | null): string {
  const started = stamp ? new Date(stamp).getTime() : NaN;
  const valid = Number.isFinite(started);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!valid) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [valid]);

  if (!valid) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type MoreHistory = {
  runs: common_DesignRun[];
  batches: common_DesignBatch[];
  /** There is another server page beyond what has been fetched. */
  hasMore: boolean;
  loading: boolean;
  fetchMore: () => void;
};

/**
 * THE REST OF THE HISTORY, ON DEMAND.
 *
 * The band ships the FIRST page of the merged feed and a cursor. This continues that cursor, and it
 * continues it with `include_archived = true` because the contract demands it: the first page is
 * deliberately unfiltered, and flipping the filter mid-pagination changes the row set the cursor was
 * cut from, silently dropping or repeating the rows around the seam.
 *
 * NOTHING IS FETCHED UNTIL THE HUMAN ASKS. The whole point of the first page is that a card with
 * forty runs opens at the speed of four.
 *
 * The caller MERGES AND DEDUPES BY ID. The band's own page is re-read on every write, so its cursor
 * can move under an already-fetched continuation; deduping is what keeps that from showing the same
 * run twice, and it is cheaper than throwing the fetched pages away on every invalidation.
 */
export function useMoreHistory(
  techCardId: number | undefined,
  band: GetDesignBandResponse,
): MoreHistory {
  const [wanted, setWanted] = useState(false);
  // Captured once. `initial_page_token` changing under an open continuation would otherwise restart
  // the whole chain from a different place and reshuffle what is already on screen.
  const firstToken = useRef<string>('');
  if (!firstToken.current) firstToken.current = (band.nextPageToken ?? '').trim();
  const token = firstToken.current;

  const query = useInfiniteQuery({
    queryKey: [...designKeys.band(techCardId ?? 0), 'more'] as const,
    enabled: wanted && !!techCardId && !!token,
    initialPageParam: token,
    queryFn: ({ pageParam }) =>
      adminService.ListDesignRuns({
        techCardId: techCardId ?? 0,
        limit: 12,
        pageToken: pageParam,
        includeArchived: true,
      }),
    getNextPageParam: (last: ListDesignRunsResponse) =>
      (last.nextPageToken ?? '').trim() || undefined,
    staleTime: 60_000,
  });

  const pages = query.data?.pages ?? [];
  const runs = useMemo(() => pages.flatMap((p) => p.runs ?? []), [pages]);
  const batches = useMemo(() => pages.flatMap((p) => p.batches ?? []), [pages]);

  const fetchMore = useCallback(() => {
    if (!wanted) {
      setWanted(true);
      return;
    }
    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
  }, [wanted, query]);

  // Before the first ask, the band's own cursor is the only evidence that more exists.
  const hasMore = wanted ? !!query.hasNextPage : !!token;

  return {
    runs,
    batches,
    hasMore,
    loading: query.isFetching,
    fetchMore,
  };
}
