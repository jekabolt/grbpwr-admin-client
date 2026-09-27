import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useRef, useState } from 'react';

import {
  isAborted,
  isDefinitiveRefusal,
  refusalFromError,
  type RunRefusal,
} from '../generation/refusal';
import { designKeys } from '../use-design-band';
import { ledgerSend, ledgerSettle, operatorKey, requestFingerprint } from './run-ledger';

/**
 * STARTING A RUN — the one write the two generative screens make.
 *
 * WHY IT IS NOT IN `use-design-band.ts`. That module is the band's write seam and it is frozen for
 * this wave: it carries the six verbs the bench and the shelf already use, and it has no start
 * verb, because the generative half was cut when it was written. This file adds exactly one, and it
 * obeys the seam's own two rules rather than inventing a second dialect — it invalidates THE SAME
 * `designKeys.band(techCardId)` (so the bench, the feed and the studio never show two different
 * instants of one card) and it reads a 409 as «somebody moved first» rather than as our failure.
 * When the seam next opens, this belongs inside `useDesignWrites` and this file disappears.
 */

export type StartRunInput = {
  /**
   * flat | render | threed | recolor | pattern. `draft_idea` is refused by the server — it has its
   * own verb.
   *
   * `recolor` IS THE ON MODEL SCREEN'S VERB (K-17) and it takes THIS door rather than one of its
   * own for the contract's own stated reason: it spends the image key's money, so it must be
   * counted against the day and must show up in the one history. What it needs and what it refuses
   * for free is on `StartDesignRunRequest.kind`; the screen's gate mirrors those refusals.
   *
   * `pattern` JOINED FOR THE SAME REASON AND AT THE SAME COST OF NOT JOINING. It had a hook of its
   * own (`pattern/use-pattern-run.ts`) for one week, and that hook minted its own idempotency key
   * against its own fingerprint — a second answer to «is this press the same intent as the last
   * one», which is exactly the question a duplicated paid job turns on. One verb, one door.
   */
  /**
   * ⚠ `freeform` AND `cutout` JOINED FOR THE THIRD TIME FOR THE SAME REASON — the playground spends
   * the image key's money (and, on the cut-out, the fal key's), so both must be counted against the
   * day and both must show up in the ONE history. They are also the reason this union is a union
   * and not a string: `cutout` is a run kind of its own, not a preset of `freeform`, and a screen
   * that could send either spelling would be a screen whose refusals depend on a typo.
   */
  kind: 'flat' | 'render' | 'threed' | 'recolor' | 'pattern' | 'freeform' | 'cutout';
  /** The delta phrase the human typed; the caption of the history row. May be empty. */
  ask: string;
  params: common_DesignRunParams;
  /**
   * THE RUN THIS ONE REPEATS, or 0 for an ordinary run.
   *
   * A RERUN IS THE SERVER'S JOB, NOT A CLIENT SNAPSHOT. The contract carries `rerun_of_run_id` so
   * that «ask for that again» means «take THAT run's frozen inputs», resolved on the side that
   * holds them. A client that rebuilt the old parameters out of what is on screen would silently
   * substitute today's references and today's bench for the ones the run actually used — and the
   * history would then show two runs claiming the same inputs and holding different pictures.
   */
  rerunOfRunId?: number;
};

export type StartRunState = {
  /**
   * `onAccepted` — called once the door ACCEPTED this press (the run is booked), never on a refusal.
   * PLAYGROUND remembers the prompt's words in «Recently used» there and only there (C-03): a text
   * the server refused is not a text a run was bought with.
   *
   * ⚠ IT TRAVELS WITH THE PRESS AND IS CALLED BY THE MUTATION ITSELF, not handed to `mutate` as a
   * per-call option: react-query drops per-call callbacks once the component that called `mutate`
   * has unmounted, and a playground form is unmounted by |→, Back or the rail while «starting…»
   * (G-01, Fable m-7). The run was booked all the same, so the words are remembered all the same.
   */
  start: (input: StartRunInput, opts?: { onAccepted?: () => void }) => void;
  /**
   * A press is out. With a `scope` this reads the mutation cache, not this component: a form that
   * was left and reopened while its run was starting is still «starting…».
   */
  isPending: boolean;
  /**
   * THE REFUSAL OF THE LAST PRESS, VERBATIM, AND IT SURVIVES THE TOAST.
   *
   * Every refusal already reaches a person as a snackbar — and a snackbar lives for seconds, which
   * is fine for «somebody moved first» and wrong for the refusals a run door collects. Two of them
   * are sentences the operator must ACT on: the server naming which half of the request is missing
   * (`no_source_picture` / `no_target_colour` and their kin), and the route refusing because the
   * provider key is not configured — that one NAMES THE ENVIRONMENT VARIABLE, and a variable name
   * that flashes past is a variable name nobody can pass on.
   *
   * SO THE ERROR IS EXPOSED AND NOT INTERPRETED. Callers render it as it arrived; substituting our
   * own prose for the server's would erase exactly the part that identifies the fault. Null
   * whenever the last press succeeded or nothing has been pressed.
   *
   * ⚠ ЭТО СОБСТВЕННОЕ СОСТОЯНИЕ, А НЕ `mutation.error`, И РАЗНИЦА В ОДНОМ ГЛАГОЛЕ: ошибку
   * react-query нельзя СНЯТЬ, она живёт до следующей мутации. Отказ, который нечем закрыть, стоит
   * на экране поверх работы и после того, как человек его прочёл и исправил, — а исправление
   * здесь как раз может НЕ быть новым нажатием (дописать цвет, добавить фотографию). Поэтому
   * снятие — глагол, и он рядом.
   */
  refusal: RunRefusal | null;
  /** Убрать отказ с экрана. Ничего не отменяет — просто человек его прочёл. */
  dismissRefusal: () => void;
};

/**
 * `client_request_id` IS THE WHOLE POINT OF THE FIELD, so it is minted the way the contract asks
 * for: ONCE PER HUMAN INTENT, and it survives a retry.
 *
 * Minting it inside the mutation would defeat the mechanism entirely — a retry after a network
 * timeout would carry a fresh id and the server would honestly start a SECOND PAID JOB, having
 * already started the first. So the id is remembered against a fingerprint of what was asked for,
 * in one ledger shared by every screen (`./run-ledger.ts`, which holds the rules): pressing GENERATE
 * again after a lost answer, with nothing changed, replays the same id and the server hands back the
 * run that already exists; changing anything mints a new one, because that is a new intent; an
 * accepted run or a definitive refusal frees the id, so the next press is a new run rather than an
 * echo of the last one.
 */
export function useStartDesignRun(
  techCardId?: number,
  opts?: {
    /**
     * THE FORM THIS PRESS BELONGS TO (`playground:change_color`). It narrows the ledger to that form
     * and, given, «pending» is read from the mutation cache — which outlives an unmounted form
     * (G-01, Codex 1). Absent, pending is this component's own: the other generative screens
     * (fabric render, 3D, pattern) stay mounted for as long as their step is open. The ledger is
     * shared either way, so their key survives an unmount too.
     */
    scope?: string;
  },
): StartRunState {
  const scope = opts?.scope ?? '';
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [refusal, setRefusal] = useState<RunRefusal | null>(null);

  /**
   * ═══ ⚠ THE REFUSAL BELONGS TO ONE CARD, AND THE STUDIO IS NOT REMOUNTED ════════════════════════
   *
   * The two generative screens live inside a tab that SURVIVES the walk from card A to card B
   * (invariant 12, and the draft next door empties itself for exactly this reason). B's screen
   * opened with A's refusal standing over it — words naming a fault of another card, next to a
   * GENERATE that is not refused. The idempotency key cannot leak the same way: the ledger is keyed
   * by the card, and the card is the first field of the fingerprinted request.
   *
   * SO THE REFUSAL DIES WITH THE CARD, IN THE BODY OF THE RENDER. Not in an effect: an effect leaves
   * one COMMITTED frame in which the card is already B and the refusal is still A's, and one frame
   * is enough to read a sentence and act on it.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    // By VALUE: clearing an already-empty refusal would cost a render that changes nothing.
    if (refusal) setRefusal(null);
  }

  const scopedPending = useIsMutating({
    mutationKey: startRunKey(techCardId ?? 0, scope),
    predicate: () => !!scope,
  });

  /**
   * THE DOOR ACCEPTED THIS PRESS — from its answer, or from an answer that came after our deadline
   * had already given up on it (`answerWithin`). Either way the run is booked: the ledger frees the
   * key, the band is re-read, the words are remembered.
   */
  const accepted = (input: SentRun) => {
    qc.invalidateQueries({ queryKey: designKeys.band(input.techCardId) });
    ledgerSettle(input.techCardId, input.scope, input.fingerprint, 'accepted');
    input.onAccepted?.();
    // The screen's own state is cleared only where the answer is ABOUT the card on screen; the
    // switch above has already cleared it otherwise, and writing it again would be a statement
    // about B made by A.
    if (shownCard.current === input.techCardId) setRefusal(null);
    // The run comes back PENDING, not done: the picture arrives in the feed when the provider
    // answers. Saying so is the difference between «nothing happened» and «it was booked».
    showMessage('run started — the pictures land in the history when it finishes', 'success');
  };

  const mutation = useMutation({
    mutationKey: scope ? startRunKey(techCardId ?? 0, scope) : undefined,
    /**
     * ⚠ THE CARD TRAVELS WITH THE REQUEST, IT IS NOT READ FROM THE CLOSURE WHEN THE ANSWER COMES.
     * react-query calls the callbacks with the LATEST options object, so a card switch while the
     * call is in flight would have `onSuccess` invalidating B's band for a run started on A —
     * B repainting for work it does not hold, A never repainting for work it does.
     *
     * ⚠ AND IT HAS A DEADLINE (r2 N5). `fetch` has none: a connection that stays open and never
     * answers kept the mutation — and with it GENERATE and |→ — pending until a reload. After
     * `START_RUN_DEADLINE_MS` the press is given up as «no answer»: the key is kept (the run may
     * exist), the screen unlocks and says so, and the next press replays the same key — which is
     * how the person checks: the server hands back the run if it was booked.
     */
    mutationFn: (input: SentRun) =>
      answerWithin(
        adminService.StartDesignRun({ ...input.wire, clientRequestId: input.clientRequestId }),
        START_RUN_DEADLINE_MS,
        () => accepted(input),
      ),
    onSuccess: (_answer: unknown, input) => accepted(input),
    onError: (error: unknown, input) => {
      ledgerSettle(
        input.techCardId,
        input.scope,
        input.fingerprint,
        isDefinitiveRefusal(error) ? 'refused' : 'unknown',
      );
      const message = (error as Error)?.message?.trim() || 'the run did not start';
      if (isAborted(error)) {
        showMessage(`someone changed this first — ${message}`, 'error');
        qc.invalidateQueries({ queryKey: designKeys.band(input.techCardId) });
        return;
      }
      // ОБА КАНАЛА, И ЭТО НЕ ДУБЛИРОВАНИЕ. Всплывашка — для отказа, который человек просто увидел;
      // поле — для того, на который он обязан подействовать, и оно переживает секунды всплывашки.
      // Классификатор общий с FLAT (`generation/refusal.ts`): что известно об отказе, решает он.
      // ПОЛЕ — ТОЛЬКО СВОЕЙ КАРТОЧКЕ (см. выше); всплывашка принадлежит человеку, а не экрану.
      if (shownCard.current === input.techCardId) {
        setRefusal(refusalFromError(error, input.clientRequestId));
      }
      showMessage(message, 'error');
    },
  });

  const start = useCallback(
    (input: StartRunInput, opts?: { onAccepted?: () => void }) => {
      if (!techCardId || techCardId <= 0) return;
      // THE WIRE OBJECT IS BUILT ONCE, AND THE FINGERPRINT IS TAKEN OF IT (r2 N2): every field that
      // reaches the server is in it — the card (the server scopes its idempotency by it), `rerun_of`
      // («run 7 again» is not «run this») — and nothing that does not.
      const wire = {
        techCardId,
        kind: input.kind,
        ask: input.ask,
        params: input.params,
        rerunOfRunId: input.rerunOfRunId ?? 0,
      };
      const fingerprint = requestFingerprint(wire);
      const clientRequestId = ledgerSend(techCardId, scope, fingerprint);
      mutation.mutate({
        wire,
        techCardId,
        clientRequestId,
        scope,
        fingerprint,
        onAccepted: opts?.onAccepted,
      });
    },
    [techCardId, mutation, scope],
  );

  const dismissRefusal = useCallback(() => setRefusal(null), []);

  return {
    start,
    isPending: mutation.isPending || (!!scope && scopedPending > 0),
    refusal,
    dismissRefusal,
  };
}

/**
 * How long a start may go unanswered before it is given up as «no answer». The door books a run and
 * returns — the paid work happens later, in the worker — so a live answer takes seconds; this is
 * generous on purpose: giving up early only costs a replay of the same key, never a second run.
 */
export const START_RUN_DEADLINE_MS = 45_000;

/**
 * The call's own answer, or — once `ms` pass without one — a rejection with NO status (the same
 * shape as a dropped connection, so every reader treats it as «not known»). An answer that arrives
 * after the deadline is not lost: a late success still reaches `late`, because that run was booked.
 */
function answerWithin<T>(call: Promise<T>, ms: number, late: (answer: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let over = false;
    const timer = setTimeout(() => {
      over = true;
      reject(new Error(`no answer from the server in ${Math.round(ms / 1000)} s`));
    }, ms);
    call.then(
      (answer) => {
        if (over) late(answer);
        else {
          clearTimeout(timer);
          resolve(answer);
        }
      },
      (error: unknown) => {
        if (over) return;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** What one press carries into the mutation — everything its answer needs, nothing from a closure. */
type SentRun = {
  /** The request exactly as it goes on the wire, minus the key — and what the fingerprint is of. */
  wire: {
    techCardId: number;
    kind: StartRunInput['kind'];
    ask: string;
    params: common_DesignRunParams;
    rerunOfRunId: number;
  };
  clientRequestId: string;
  techCardId: number;
  /** `''` = a screen that names no form; the ledger is shared either way. */
  scope: string;
  fingerprint: string;
  onAccepted?: () => void;
};

/** The mutation key of a scoped form's presses — the cache is asked «is one of them out?». */
export function startRunKey(techCardId: number, scope: string) {
  // The operator is in the key for the ledger's reason (r2 N4): B, signing into A's tab while A's
  // start hangs, must not see B's own form «starting…» for A's press.
  return ['design', 'start-run', operatorKey(), techCardId, scope] as const;
}

/**
 * «IS A RUN OF THIS FORM STARTING?» — for a door that stands OUTSIDE the form (the playground's |→).
 * Reads the same mutation cache the scoped hook writes.
 */
export function useStartRunPending(techCardId: number, scope: string): boolean {
  const n = useIsMutating({
    mutationKey: startRunKey(techCardId, scope),
    predicate: () => !!scope && techCardId > 0,
  });
  return n > 0;
}
