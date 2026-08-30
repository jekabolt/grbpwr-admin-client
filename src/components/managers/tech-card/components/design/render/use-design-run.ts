import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useRef } from 'react';

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

/** grpc-gateway maps `codes.Aborted` onto HTTP 409 — somebody else moved first. */
function isAborted(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 409;
}

export type StartRunInput = {
  /** flat | render | threed. `draft_idea` is refused by the server — it has its own verb. */
  kind: 'flat' | 'render' | 'threed';
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

  const mutation = useMutation({
    mutationFn: (input: StartRunInput & { clientRequestId: string }) =>
      adminService.StartDesignRun({
        techCardId: techCardId ?? 0,
        clientRequestId: input.clientRequestId,
        kind: input.kind,
        ask: input.ask,
        params: input.params,
        rerunOfRunId: input.rerunOfRunId ?? 0,
      }),
    onSuccess: () => {
      ledger.current = null;
      qc.invalidateQueries({ queryKey: designKeys.band(techCardId ?? 0) });
      // The run comes back PENDING, not done: the picture arrives in the feed when the provider
      // answers. Saying so is the difference between «nothing happened» and «it was booked».
      showMessage('run started — the pictures land in the history when it finishes', 'success');
    },
    onError: (error: unknown) => {
      const message = (error as Error)?.message || 'the run did not start';
      if (isAborted(error)) {
        showMessage(`someone changed this first — ${message}`, 'error');
        qc.invalidateQueries({ queryKey: designKeys.band(techCardId ?? 0) });
        return;
      }
      showMessage(message, 'error');
    },
  });

  const start = useCallback(
    (input: StartRunInput) => {
      if (!techCardId || techCardId <= 0) return;
      // THE FINGERPRINT COVERS EVERY FIELD THAT REACHES THE WIRE. `rerun_of_run_id` is part of the
      // intent — «run 7 again» is not the same request as «run this» — so leaving it out would
      // replay one idempotency key across two different jobs and hand back the wrong run.
      const fingerprint = JSON.stringify([
        input.kind,
        input.ask,
        input.params,
        input.rerunOfRunId ?? 0,
      ]);
      if (ledger.current?.fingerprint !== fingerprint) {
        ledger.current = { fingerprint, id: newClientRequestId() };
      }
      mutation.mutate({ ...input, clientRequestId: ledger.current.id });
    },
    [techCardId, mutation],
  );

  return { start, isPending: mutation.isPending };
}
