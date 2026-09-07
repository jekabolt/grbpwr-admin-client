import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useRef, useState } from 'react';

import { isAborted, refusalFromError, type RunRefusal } from '../generation/refusal';
import { designKeys, newClientRequestId } from '../use-design-band';

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
  start: (input: StartRunInput) => void;
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
 * already started the first. So the id is remembered against a fingerprint of what was asked for:
 * pressing GENERATE again after a failure, with nothing changed, replays the same id and the server
 * hands back the run that already exists; changing anything mints a new one, because that is a new
 * intent. A success clears the ledger, so the next press is a new run rather than an idempotent
 * echo of the last one.
 */
export function useStartDesignRun(techCardId?: number): StartRunState {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const ledger = useRef<{ fingerprint: string; id: string } | null>(null);
  const [refusal, setRefusal] = useState<RunRefusal | null>(null);

  /**
   * ═══ ⚠ THE LEDGER AND THE REFUSAL BELONG TO ONE CARD, AND THE STUDIO IS NOT REMOUNTED ═════════
   *
   * The two generative screens live inside a tab that SURVIVES the walk from card A to card B
   * (invariant 12, and the draft next door empties itself for exactly this reason). This hook was
   * the last thing on them still holding A's answer: B's screen opened with A's refusal standing
   * over it — words naming a fault of another card, next to a GENERATE that is not refused — and
   * the ledger held A's `client_request_id`, minted against a fingerprint that did not name the
   * card at all. A press on B with the same kind, the same words and the same pictures replayed
   * that id, and the server reads an idempotency key against the CARD it was minted for
   * (`designSameStartRequest`): it hands back «that is not this request», i.e. a refusal for a run
   * a person is entitled to buy.
   *
   * SO BOTH DIE WITH THE CARD, IN THE BODY OF THE RENDER. Not in an effect: an effect leaves one
   * COMMITTED frame in which the card is already B and the refusal is still A's, and one frame is
   * enough to read a sentence and act on it.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    ledger.current = null;
    // By VALUE: clearing an already-empty refusal would cost a render that changes nothing.
    if (refusal) setRefusal(null);
  }

  const mutation = useMutation({
    /**
     * ⚠ THE CARD TRAVELS WITH THE REQUEST, IT IS NOT READ FROM THE CLOSURE WHEN THE ANSWER COMES.
     * react-query calls the callbacks with the LATEST options object, so a card switch while the
     * call is in flight would have `onSuccess` invalidating B's band for a run started on A —
     * B repainting for work it does not hold, A never repainting for work it does.
     */
    mutationFn: (input: StartRunInput & { clientRequestId: string; techCardId: number }) =>
      adminService.StartDesignRun({
        techCardId: input.techCardId,
        clientRequestId: input.clientRequestId,
        kind: input.kind,
        ask: input.ask,
        params: input.params,
        rerunOfRunId: input.rerunOfRunId ?? 0,
      }),
    onSuccess: (_answer: unknown, input) => {
      qc.invalidateQueries({ queryKey: designKeys.band(input.techCardId) });
      // The screen's own state is cleared only where the answer is ABOUT the card on screen; the
      // switch above has already cleared it otherwise, and writing it again would be a statement
      // about B made by A.
      if (shownCard.current === input.techCardId) {
        ledger.current = null;
        setRefusal(null);
      }
      // The run comes back PENDING, not done: the picture arrives in the feed when the provider
      // answers. Saying so is the difference between «nothing happened» and «it was booked».
      showMessage('run started — the pictures land in the history when it finishes', 'success');
    },
    onError: (error: unknown, input) => {
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
    (input: StartRunInput) => {
      if (!techCardId || techCardId <= 0) return;
      // THE FINGERPRINT COVERS EVERY FIELD THAT REACHES THE WIRE — THE CARD INCLUDED. `techCardId`
      // is the first field of the request and the server's own idempotency key is scoped by it, so
      // a fingerprint that left it out could replay one id across two cards. `rerun_of_run_id` is
      // part of the intent too — «run 7 again» is not the same request as «run this» — so leaving
      // it out would replay one idempotency key across two different jobs and hand back the wrong
      // run.
      const fingerprint = JSON.stringify([
        techCardId,
        input.kind,
        input.ask,
        input.params,
        input.rerunOfRunId ?? 0,
      ]);
      if (ledger.current?.fingerprint !== fingerprint) {
        ledger.current = { fingerprint, id: newClientRequestId() };
      }
      mutation.mutate({ ...input, techCardId, clientRequestId: ledger.current.id });
    },
    [techCardId, mutation],
  );

  const dismissRefusal = useCallback(() => setRefusal(null), []);

  return { start, isPending: mutation.isPending, refusal, dismissRefusal };
}
