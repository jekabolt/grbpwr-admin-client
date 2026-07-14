import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRunInsert, common_ProductionRunLine } from 'api/proto-http/admin';
import { stockChangeHistoryKeys } from 'components/managers/product/components/stock/useStockChangeHistory';
import { runStatusToDbFilter } from './options';

// Read-modify-write a single section of a run's insert (R-17). UpdateProductionRun is a
// full-replace with no lock_version, so each detail-page section (lines / marker / costs)
// re-fetches the latest run immediately before saving and overrides ONLY its own keys — a
// marker edit can't clobber concurrently-saved lines, and vice versa. The race window shrinks
// to the fetch→save gap; a true lock_version on runs is a backend follow-up.
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
      const run = { ...base, ...patch };
      if (mergeLines) run.lines = mergeLines(base.lines ?? []);
      return adminService.UpdateProductionRun({ id, run });
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: productionRunKeys.all });
      qc.invalidateQueries({ queryKey: productionRunKeys.detail(v.id) });
    },
  });
}

export const productionRunKeys = {
  all: ['productionRuns'] as const,
  list: (techCardId: number, status: string) =>
    [...productionRunKeys.all, 'list', techCardId, status] as const,
  detail: (id: number) => [...productionRunKeys.all, 'detail', id] as const,
};

export function useProductionRuns(techCardId: number, status: string) {
  return useQuery({
    queryKey: productionRunKeys.list(techCardId, status),
    queryFn: () =>
      adminService.ListProductionRuns({
        techCardId: techCardId || undefined,
        // Backend stores status as its lowercase name; send that, not the enum constant.
        status: runStatusToDbFilter(status),
        limit: 200,
        offset: 0,
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
        ? adminService.UpdateProductionRun({ id, run })
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
