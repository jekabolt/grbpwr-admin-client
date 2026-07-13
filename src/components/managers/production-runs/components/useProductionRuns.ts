import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRunInsert } from 'api/proto-http/admin';
import { runStatusToDbFilter } from './options';

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
    onSuccess: () => qc.invalidateQueries({ queryKey: productionRunKeys.all }),
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
