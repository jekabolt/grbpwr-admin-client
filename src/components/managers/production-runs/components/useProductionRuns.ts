import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRunInsert, common_ProductionRunLine } from 'api/proto-http/admin';
import { stockChangeHistoryKeys } from 'components/managers/product/components/stock/useStockChangeHistory';
import { runStatusToDbFilter } from './options';

// Read-modify-write a single section of a run's insert (R-17). Each detail-page section
// (lines / marker / costs) re-fetches the latest run immediately before saving and overrides
// ONLY its own keys — a marker edit can't clobber concurrently-saved lines, and vice versa.
// #9: the fetched run's lock_version is now echoed back as expected_lock_version, so the server
// rejects (Aborted → HTTP 409) if a concurrent writer bumped it in the fetch→save gap instead of
// silently last-write-winning. A run predating the field reads lock_version 0 → legacy behaviour.
// `mergeLines` derives the new lines FROM the fresh ones (receive uses it to stamp counted
// quantities per (product, size) without replacing concurrently-edited lines wholesale).
export function useUpdateRunSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      mergeLines,
    }: {
      id: number;
      patch: Partial<common_ProductionRunInsert>;
      mergeLines?: (fresh: common_ProductionRunLine[]) => common_ProductionRunLine[];
    }) => {
      const fresh = await adminService.GetProductionRun({ id });
      const base = (fresh.run?.run ?? {}) as common_ProductionRunInsert;
      const expectedLockVersion = fresh.run?.lockVersion ?? 0;
      const run = { ...base, ...patch };
      if (mergeLines) run.lines = mergeLines(base.lines ?? []);
      return adminService.UpdateProductionRun({ id, run, expectedLockVersion });
    },
    onSuccess: (_d, v) => {
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
  if (status === 409) return 'Партия была изменена в другом окне — обновите страницу и повторите';
  return e instanceof Error ? e.message : 'Не удалось сохранить изменения партии';
}

export const productionRunKeys = {
  all: ['productionRuns'] as const,
  list: (techCardId: number, status: string, staleDays = 0) =>
    [...productionRunKeys.all, 'list', techCardId, status, staleDays] as const,
  detail: (id: number) => [...productionRunKeys.all, 'detail', id] as const,
};

// #10: stale_days > 0 asks the backend for only the non-terminal runs that have sat at least that
// long (the "stale" set the attention strip counts), replacing a client scan of two full status
// pages. 0 = no staleness filter.
export function useProductionRuns(techCardId: number, status: string, staleDays = 0) {
  return useQuery({
    queryKey: productionRunKeys.list(techCardId, status, staleDays),
    queryFn: () =>
      adminService.ListProductionRuns({
        techCardId: techCardId || undefined,
        // Backend stores status as its lowercase name; send that, not the enum constant.
        status: runStatusToDbFilter(status),
        limit: 200,
        offset: 0,
        staleDays: staleDays || undefined,
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

// Create (id = 0) or update. planned_unit_cost is snapshotted server-side from the tech card
// / release; actuals are computed on read — we only ever send the ProductionRunInsert.
export function useSaveProductionRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, run }: { id: number; run: common_ProductionRunInsert }) =>
      id
        ? adminService.UpdateProductionRun({ id, run, expectedLockVersion: 0 })
        : adminService.CreateProductionRun({ run }),
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

// Receive posts each line's received_qty into that line's own product (NF-06 — no run-level
// product) and optionally sets each product's cost_price from the run's actual unit cost.
// received/defect quantities must already be persisted on the run's lines (via UpdateProductionRun)
// before calling this — the receive RPC itself carries no quantities.
export function useReceiveProductionRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { runId: number; updateCostPrice: boolean }) =>
      adminService.ReceiveProductionRun(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productionRunKeys.all });
      // Receive posts stock (and possibly cost_price) into each line's PRODUCT — the
      // product stock-history views must not keep pre-receive data for 5 minutes.
      qc.invalidateQueries({ queryKey: stockChangeHistoryKeys.all });
    },
  });
}

// Friendly copy for the delete guard. FAILED_PRECONDITION (received/closed) → 400; NOT_FOUND → 404.
export function deleteRunErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 404) return 'Партия не найдена';
  if (status === 400 || status === 412)
    return 'Партия уже принята — её нельзя удалить; создайте корректирующую';
  return e instanceof Error ? e.message : 'Не удалось удалить партию';
}
