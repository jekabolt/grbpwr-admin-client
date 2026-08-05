import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRunInsert, common_ProductionRunLine } from 'api/proto-http/admin';
import { stockChangeHistoryKeys } from 'components/managers/product/components/stock/useStockChangeHistory';
import { runStatusToDbFilter } from './options';

// Read-modify-write a single section of a run's insert (R-17). UpdateProductionRun is a full
// replace, so each detail-page section (lines / marker / costs) re-fetches the run immediately
// before saving and overrides ONLY its own keys — that fetch is what stops a marker edit from
// sending stale lines back over concurrently-saved ones. `mergeLines` derives the new lines FROM
// the fresh ones (receive uses it to stamp counted quantities per (product, size)).
//
// `lockVersion` is the CALLER's, and that is the whole point. This hook used to send the version it
// had just read one line earlier — the value the lock exists to compare AGAINST the caller's view of
// the run. It therefore always matched, and every save on this path was a last-write-wins that
// merely looked locked. The version has to come from the payload the operator was actually looking
// at when they made the edit (`run.lockVersion`, which rides on both the list and detail payloads);
// a concurrent writer is then caught (Aborted → HTTP 409) instead of silently overwritten. A run
// predating the field reads 0, which the backend documents as the explicit opt-out — unchanged.
export function useUpdateRunSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      lockVersion,
      patch,
      mergeLines,
    }: {
      id: number;
      lockVersion: number;
      patch: Partial<common_ProductionRunInsert>;
      mergeLines?: (fresh: common_ProductionRunLine[]) => common_ProductionRunLine[];
    }) => {
      const fresh = await adminService.GetProductionRun({ id });
      const base = (fresh.run?.run ?? {}) as common_ProductionRunInsert;
      const run = { ...base, ...patch };
      if (mergeLines) run.lines = mergeLines(base.lines ?? []);
      return adminService.UpdateProductionRun({ id, run, expectedLockVersion: lockVersion });
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: productionRunKeys.all });
      qc.invalidateQueries({ queryKey: productionRunKeys.detail(v.id) });
    },
    // A rejected save leaves the screen showing the version the server just refused. Refetch on
    // failure too, so "обновите страницу" lands on a page that is already reloading itself instead
    // of one the operator must reload by hand before a retry can succeed.
    onError: (_e, v) => {
      qc.invalidateQueries({ queryKey: productionRunKeys.all });
      qc.invalidateQueries({ queryKey: productionRunKeys.detail(v.id) });
    },
  });
}

// #9: an optimistic-lock conflict (Aborted → HTTP 409) means another writer saved the run between
// this section's read and write. Surface a reload-and-retry hint rather than the raw gateway text;
// silently retrying would re-introduce the last-write-wins the lock exists to prevent.
export function updateRunErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 409) return 'Партия изменена в другом окне — обновите страницу';
  return e instanceof Error ? e.message : 'Could not save the run changes';
}

export const productionRunKeys = {
  all: ['productionRuns'] as const,
  list: (techCardId: number, status: string, staleDays = 0, overdueOnly = false) =>
    [...productionRunKeys.all, 'list', techCardId, status, staleDays, overdueOnly] as const,
  detail: (id: number) => [...productionRunKeys.all, 'detail', id] as const,
};

// #10: stale_days > 0 asks the backend for only the non-terminal runs that have sat at least that
// long (the "stale" set the attention strip counts), replacing a client scan of two full status
// pages. 0 = no staleness filter.
// overdueOnly asks the backend for only the OPEN runs past their promised date — the same predicate
// the card badge renders. Server-side because the client holds one page: a local filter would answer
// "late among the first N", which is a different and quietly wrong question.
// `enabled` exists for the tech card, which asks for one style's runs and must not fire the query
// while the card is unsaved: techCardId 0 is sent as `undefined`, i.e. "every run in the system".
export function useProductionRuns(
  techCardId: number,
  status: string,
  staleDays = 0,
  overdueOnly = false,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: productionRunKeys.list(techCardId, status, staleDays, overdueOnly),
    queryFn: () =>
      adminService.ListProductionRuns({
        techCardId: techCardId || undefined,
        // Backend stores status as its lowercase name; send that, not the enum constant.
        status: runStatusToDbFilter(status),
        limit: 200,
        offset: 0,
        staleDays: staleDays || undefined,
        overdueOnly: overdueOnly || undefined,
      }),
  });
}

export function useProductionRun(id: number, enabled: boolean) {
  return useQuery({
    queryKey: productionRunKeys.detail(id),
    queryFn: () => adminService.GetProductionRun({ id }),
    enabled,
  });
}

// Estimated material requirement of a run against stock (GetProductionRunMaterialPlan). Lives under
// the run's detail key so an issue (which invalidates that key) refreshes the plan's shortages.
export function useMaterialPlan(runId: number, enabled: boolean) {
  return useQuery({
    queryKey: [...productionRunKeys.detail(runId), 'materialPlan'],
    queryFn: () => adminService.GetProductionRunMaterialPlan({ runId }),
    enabled,
  });
}

// Create (no id) or update (id + the lock version that came WITH the run being edited).
// planned_unit_cost is snapshotted server-side from the tech card / release; actuals are computed
// on read — we only ever send the ProductionRunInsert.
//
// The update arm used to hardcode `expectedLockVersion: 0`, which the contract documents as the
// explicit OPT-OUT of the optimistic lock ("0 keeps the legacy last-write-wins behaviour"): an edit
// through this hook would silently overwrite whatever another window had saved in the meantime,
// while every other run write on the page was locked. The version is now part of the input type, so
// it cannot be dropped again, and it must be the one read alongside the run — refetching it here
// would only re-read the value we are trying to detect a change in. `common_ProductionRun.
// lock_version` rides on the list and detail payloads for exactly this reason.
export type SaveProductionRunInput =
  | { id?: undefined; lockVersion?: undefined; run: common_ProductionRunInsert }
  | { id: number; lockVersion: number; run: common_ProductionRunInsert };

export function useSaveProductionRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveProductionRunInput) =>
      input.id
        ? adminService.UpdateProductionRun({
            id: input.id,
            run: input.run,
            expectedLockVersion: input.lockVersion,
          })
        : adminService.CreateProductionRun({ run: input.run }),
    onSuccess: () => qc.invalidateQueries({ queryKey: productionRunKeys.all }),
  });
}

export function useDeleteProductionRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteProductionRun({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: productionRunKeys.all }),
  });
}

// The atomic receiving command (Phase 4, receipt v1): the counted quantities travel IN the call,
// per line by the plan lines' stable line_key — the old two-step (stamp counts via
// UpdateProductionRun, then a quantity-less receive) is gone, and with it the state where counts
// were saved but stock was not posted. idempotencyKey is minted once per user intent (per modal
// open), so a network retry REPLAYS the original success instead of double-booking.
export function usePostRunReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      runId: number;
      lines: { lineKey: string; goodQty: number; defectQty: number; defectDisposition?: string }[];
      idempotencyKey: string;
      expectedLockVersion: number;
      note?: string;
      updateCostPrice: boolean;
      // Phase 5: true books this delivery WITHOUT declaring the run complete (the run moves to
      // partially received). Omitted/false = FINAL, exactly what every pre-Phase-5 build sent.
      partial?: boolean;
    }) =>
      adminService.PostProductionRunReceipt({
        runId: input.runId,
        // The generated type requires the field; scrap is the server default for old payload shapes.
        lines: input.lines.map((l) => ({
          ...l,
          defectDisposition: l.defectDisposition ?? 'scrap',
        })),
        idempotencyKey: input.idempotencyKey,
        expectedLockVersion: input.expectedLockVersion,
        note: input.note ?? '',
        updateCostPrice: input.updateCostPrice,
        partial: input.partial ?? false,
        // Contract field from a parallel feature (waitlist notify on receipt) — no UI here yet;
        // undefined keeps the wire payload identical to before the regen.
        notifyWaitlist: undefined,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: productionRunKeys.all });
      qc.invalidateQueries({ queryKey: productionRunKeys.detail(v.runId) });
      // The receipt posts stock (and possibly cost_price) into each line's PRODUCT — the
      // product stock-history views must not keep pre-receive data for 5 minutes.
      qc.invalidateQueries({ queryKey: stockChangeHistoryKeys.all });
    },
  });
}

// Reversal of one receipt (Phase 6): stock back out, scoped accounting compensation, cost_price
// rollback, run status recompute — one transaction server-side. The reason is mandatory; the
// server refuses when reversed units were already sold (with the exact shortfall in the message).
export function useReverseRunReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      runId: number;
      receiptId: number;
      reason: string;
      expectedLockVersion: number;
    }) =>
      adminService.ReverseProductionRunReceipt({
        runId: input.runId,
        receiptId: input.receiptId,
        reason: input.reason,
        expectedLockVersion: input.expectedLockVersion,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: productionRunKeys.all });
      qc.invalidateQueries({ queryKey: productionRunKeys.detail(v.runId) });
      // The reversal moves product stock back out (and possibly cost_price) — same cache blast
      // radius as the receipt itself.
      qc.invalidateQueries({ queryKey: stockChangeHistoryKeys.all });
    },
  });
}

// Friendly copy for the reversal's refusals: the server's FailedPrecondition messages are already
// operator-facing (shortfall list, closed period, already reversed) — surface them verbatim.
export function reversalErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  const msg = e instanceof Error ? e.message : '';
  if (status === 409) return 'Партия изменена в другом окне — обновите страницу и повторите';
  if (status === 412 || status === 400)
    return msg || 'Реверс невозможен в текущем состоянии квитанции';
  return msg || 'Не удалось отменить приёмку';
}

// Friendly copy for the receipt command's refusals. 409 (Aborted) = the run changed under the
// count; 412/400 (FailedPrecondition) = already received / cancelled / nothing counted;
// AlreadyExists (409 via grpc-gateway is Conflict too, so match the message) = an idempotency key
// reused with a different payload — a client bug worth naming.
export function receiptErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  const msg = e instanceof Error ? e.message : '';
  if (msg.includes('idempotency key'))
    return 'Эта приёмка уже была проведена с другими цифрами — обновите страницу';
  if (status === 409) return 'Партия изменена в другом окне — обновите страницу и пересчитайте';
  if (status === 412 || status === 400) return msg || 'Приёмка невозможна в текущем статусе партии';
  return msg || 'Не удалось провести приёмку';
}

// Friendly copy for the delete guard. FAILED_PRECONDITION (received/closed) → 400; NOT_FOUND → 404.
export function deleteRunErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 404) return 'Run not found';
  if (status === 400 || status === 412)
    return "This run has already been received — it can't be deleted; create a correcting run instead";
  return e instanceof Error ? e.message : 'Could not delete the run';
}
