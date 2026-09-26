import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

import {
  cardOnScreen,
  designKeys,
  newClientRequestId,
  useDesignWrites,
  type WriteContext,
} from '../use-design-band';
import { refusalFromError, type RunRefusal } from './refusal';
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
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  // Called for the one thing it does besides writing: it marks this card as held on screen
  // (`cardOnScreen`). Its `invalidate` is not re-exported — the refreshes here go to the WRITTEN
  // card (`invalidateWritten`), and nobody read the returned one (review round 3, nit).
  useDesignWrites(techCardId);

  /**
   * THE CARD A WRITE WAS FOR, carried by the mutation itself (`onMutate` → context), for the same
   * reason as the band's own writes (`use-design-band.ts`): the request outlives the screen it left.
   * The re-read goes to THAT card's band, and a refusal is said only while that card is on screen —
   * the page remounts per card, so a late refusal from card A must not print over card B (review
   * round 2, [1]).
   */
  const onMutate = useCallback((): WriteContext => ({ card: techCardId ?? 0 }), [techCardId]);
  const invalidateWritten = useCallback(
    (_data: unknown, _variables: unknown, context?: WriteContext) => {
      qc.invalidateQueries({ queryKey: designKeys.band(context?.card ?? techCardId ?? 0) });
    },
    [qc, techCardId],
  );
  const onError = useCallback(
    (error: unknown, _variables?: unknown, context?: WriteContext) => {
      const card = context?.card ?? techCardId ?? 0;
      // Even a refusal moves money on the server (a reservation released, an attempt billed), so
      // the band is re-read rather than left showing prices from before the attempt.
      qc.invalidateQueries({ queryKey: designKeys.band(card) });
      if (!cardOnScreen(card)) return;
      showMessage((error as Error)?.message || 'the run did not start', 'error');
    },
    [showMessage, qc, techCardId],
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
   *
   * A RERUN IS A RUN NUMBER, FOR EXACTLY THAT REASON. `rerun_of_run_id` names the row to repeat and
   * the SERVER re-reads that row's own frozen snapshot; `ask` and `params` still apply on top, so a
   * rerun with a new delta phrase is the ordinary case. A client that posted the old inputs back
   * could post inputs that never existed, and the history would stop being evidence.
   */
  const startRun = useMutation({
    mutationFn: (input: {
      clientRequestId: string;
      kind: string;
      ask: string;
      params: common_DesignRunParams;
      rerunOfRunId?: number;
    }) =>
      adminService.StartDesignRun({
        techCardId: techCardId ?? 0,
        clientRequestId: input.clientRequestId,
        kind: input.kind,
        ask: input.ask,
        params: input.params,
        // 0 is «an ordinary run» in the contract's own words, so an absent value is spelled as 0
        // rather than left unset — one spelling for one meaning.
        rerunOfRunId: input.rerunOfRunId ?? 0,
      }),
    onMutate,
    onSuccess: invalidateWritten,
    onError,
  });

  /**
   * STOP A RUN. `pending` → `cancelled` outright; a run already in flight keeps running with
   * `cancel_requested_at` stamped, because the provider call cannot be recalled and the money it
   * costs is spent either way. The row says so rather than pretending otherwise.
   */
  const cancelRun = useMutation({
    mutationFn: (runId: number) => adminService.CancelDesignRun({ runId }),
    onMutate,
    onSuccess: invalidateWritten,
    onError,
  });

  /** Presentational and reversible. It hides the ROW; picture invisibility has its own verb. */
  const archiveRun = useMutation({
    mutationFn: (input: { runId: number; archived: boolean }) =>
      adminService.ArchiveDesignRun({ runId: input.runId, archived: input.archived }),
    onMutate,
    onSuccess: invalidateWritten,
    onError,
  });

  /**
   * The TEXT run. It executes inline and comes back finished, but it is still a row in the money
   * register — which is the whole reason it goes through this machine instead of being a free
   * button. `StartDesignRun` refuses `draft_idea` on purpose; this is its only door.
   */
  const draftIdea = useMutation({
    mutationFn: (clientRequestId: string) =>
      adminService.DraftDesignIdea({
        techCardId: techCardId ?? 0,
        clientRequestId,
        // `false` НАЗВАНО ЯВНО — см. довод у второй двери (`head/use-draft-idea.ts`). Эта дверь
        // просит ПРОЗУ, и читатель её ответа режет `output_text` по трём заголовкам; попроси она
        // структуру, читатель нашёл бы ноль заголовков и нарисовал пустой черновик без ошибки.
        construction: false,
      }),
    onMutate,
    onSuccess: invalidateWritten,
    onError,
  });

  return useMemo(
    () => ({ startRun, cancelRun, archiveRun, draftIdea }),
    [startRun, cancelRun, archiveRun, draftIdea],
  );
}

export type StartRunInput = {
  /** flat | render | threed. `draft_idea` is refused by the server — it has its own verb. */
  kind: 'flat' | 'render' | 'threed';
  /** The delta phrase the human typed; the caption of the history row. May be empty. */
  ask: string;
  params: common_DesignRunParams;
  /**
   * REPEAT RUN N WITH THE INPUTS THAT RUN ACTUALLY HAD. Omitted (or 0) for an ordinary run. The
   * server re-reads run N's frozen snapshot; nothing about those inputs is composed here.
   */
  rerunOfRunId?: number;
  /**
   * WHAT THE SERVER WILL FREEZE INTO THE RUN, AS SAVED — the words, the fit, the moodboard rows, the
   * callouts and the reference roles (review round 3, m6). It is NOT sent (see `startRun`); it is
   * digested into the fingerprint, because it is part of the intent: after an ambiguous failure an
   * edit of the words or a role, retried with the same VIEWS, would otherwise replay the old id, and
   * the server would hand back the OLD run — with the old prompt — as «started».
   */
  snapshot?: unknown;
};

export type StartRunState = {
  /**
   * `onStarted` fires only when the row is actually filed — never on the click. The promise settles
   * when the server has answered (either way), also after the calling screen has unmounted, and it
   * RESOLVES TO THE SERVER'S REFUSAL, VERBATIM (`null` once the run is filed). The same shape
   * `useDesignRun` gives FABRIC RENDER and 3D, so all three studios print a refusal through one organ
   * (`RunRefusal`) with the server's words.
   *
   * THE REFUSAL IS THE CALLER'S TO KEEP, NOT THIS HOOK'S (review round 3, m2). It lived in the hook's
   * state, and a step switch unmounted the flat row with it: the refusal «that stays until read»
   * survived only as a snackbar. The caller files it where its screen state lives — the flat row in
   * its per-card store (`flat-input.ts`) — and a remounted row shows it again.
   */
  start: (input: StartRunInput, onStarted?: () => void) => Promise<RunRefusal | null>;
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
 * THE LEDGER IS MODULE-LEVEL, KEYED BY CARD AND FINGERPRINT (review round 2, MAJOR B). It lived in a
 * ref of the hook, and a step switch unmounts the flat row while its request is still on the wire:
 * the row that came back had an EMPTY ledger, so a retry of the very same intent minted a new id and
 * bought a second run. The answer is awaited on the mutation's promise, not through the observer's
 * callbacks — those fire only while the screen is mounted — so the ledger is cleared, the success is
 * said and the caller's promise settles even when nobody is watching any more.
 *
 * THIS IS WHERE THE THREE STUDIOS MEET. FLAT, FABRIC RENDER and 3D differ only in `kind` and in what
 * they put in `params`; the money, the idempotency and the invalidation are one mechanism, and a
 * second copy of it is precisely where two screens start disagreeing about what a retry means.
 */
const runLedger = new Map<string, string>();

/**
 * A SHORT, STABLE DIGEST of a JSON-able value (cyrb53: two 32-bit lanes, 53 bits out). It keeps the
 * ledger key readable; a collision would need two different prompts of one card, pressed with one
 * VIEWS selection, to land on the same 53 bits.
 */
export function digestOf(value: unknown): string {
  const text = JSON.stringify(value ?? null) ?? 'null';
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function useStartRun(techCardId?: number): StartRunState {
  const { showMessage } = useSnackBarStore();
  const { startRun } = useGenerationWrites(techCardId);

  const start = useCallback(
    async (input: StartRunInput, onStarted?: () => void): Promise<RunRefusal | null> => {
      const card = techCardId ?? 0;
      if (card <= 0) return null;
      // THE RERUN TARGET IS PART OF THE INTENT, so it is part of the fingerprint. Left out, «rerun
      // run 3» and «rerun run 7» typed with the same delta phrase would replay ONE request id, and
      // the second press would come back OK holding the first run — a success reported for a
      // request nobody made.
      // THE SAVED PROMPT IS PART OF THE INTENT TOO (review round 3, m6) — see `snapshot`.
      const fingerprint = JSON.stringify([
        input.kind,
        input.ask,
        input.params,
        input.rerunOfRunId ?? 0,
        input.snapshot === undefined ? '' : digestOf(input.snapshot),
      ]);
      const key = `${card}:${fingerprint}`;
      let clientRequestId = runLedger.get(key);
      if (!clientRequestId) {
        clientRequestId = newClientRequestId();
        runLedger.set(key, clientRequestId);
      }
      try {
        await startRun.mutateAsync({ ...input, clientRequestId });
      } catch (error) {
        // Beside the snackbar the hook-level `onError` already shows: the snackbar lives for
        // seconds, the refusal stays on the screen until read (CONTRACT §E) — in the CALLER's
        // store (see `start`). A 409 is not kept: the band moved first, and the hook-level handler
        // has already re-read it. The ledger entry stays — the retry of the same intent replays the
        // same id.
        return refusalFromError(error, clientRequestId);
      }
      if (runLedger.get(key) === clientRequestId) runLedger.delete(key);
      // The run comes back PENDING, not done: the pictures arrive when the provider answers.
      // Saying so is the difference between «nothing happened» and «it was booked» — and it is said
      // while the card is on screen, whether or not the row that pressed is still mounted.
      if (cardOnScreen(card)) {
        showMessage('run started — the pictures land in the history when it finishes', 'success');
      }
      // The caller clears its fields HERE and not on the click: clearing the ask before the row is
      // filed would change the fingerprint under a failed attempt, and the retry would mint a fresh
      // id and buy a second picture.
      onStarted?.();
      return null;
    },
    [techCardId, startRun, showMessage],
  );

  // `isPending` is gone (review round 3, nit): nobody read it — the flat row's «starting…» comes
  // from its per-card store, which outlives this hook's observer.
  return useMemo(() => ({ start }), [start]);
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
  // Captured once PER CARD. `initial_page_token` changing under an open continuation would
  // otherwise restart the whole chain from a different place and reshuffle what is already on
  // screen.
  const firstToken = useRef<string>('');
  /**
   * ЧЕЙ ЭТО КУРСОР — ВОПРОС, НА КОТОРЫЙ ОБЯЗАН БЫТЬ ОТВЕТ.
   *
   * `page_token` — величина ОДНОЙ карточки: сервер режет им список прогонов именно этой тех-карты.
   * А компонент между карточками НЕ РАЗМОНТИРУЕТСЯ: клиентский переход на соседнюю карточку, чья
   * полоса уже лежит в кэше React Query, не поднимает `isLoading` вовсе, и вкладка перерисовывается
   * с новым `techCardId` на тех же самых рефах. Курсор карточки A переживал переход, `wanted`
   * переживал его тоже — и первый же рендер карточки B уходил в
   * `ListDesignRuns(tech_card_id = B, page_token = <курсор A>)`, никем не прошенный. Ответом на
   * такой запрос бывает ошибка или ЧУЖОЕ продолжение; второе хуже, потому что выглядит как история.
   *
   * СБРОС ИДЁТ В РЕНДЕРЕ, А НЕ В `useEffect`, и это не вкусовщина. Эффект исполняется после
   * коммита, то есть остаётся ровно один кадр, в котором `enabled` уже сложился из нового
   * `techCardId` и старого курсора — запрос успевает уйти ДО того, как эффект его отменит.
   * Правка состояния при смене пропа прямо в рендере — штатный приём React: он выбрасывает
   * результат текущего рендера и считает его заново, не коммитя промежуточное состояние никуда.
   */
  const cursorOwner = useRef<number>(techCardId ?? 0);
  if (cursorOwner.current !== (techCardId ?? 0)) {
    cursorOwner.current = techCardId ?? 0;
    firstToken.current = '';
    // Продолжение новой карточки никто не просил: «показать все» на карточке A — не согласие
    // вычитать до конца карточку B.
    if (wanted) setWanted(false);
  }
  // Пока полоса новой карточки не прочитана, `nextPageToken` пуст (`EMPTY_BAND`), и запрос не
  // уходит вовсе — курсор захватывается только из ответа, который уже про эту карточку.
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
