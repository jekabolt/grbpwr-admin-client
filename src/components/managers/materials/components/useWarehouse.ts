import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  AdjustMaterialStockRequest,
  IssueMaterialStockRequest,
  ReceiveMaterialStockRequest,
  common_MaterialMovementType,
} from 'api/proto-http/admin';
import { productionRunKeys } from 'components/managers/production-runs/components/useProductionRuns';
import { sampleKeys } from 'components/managers/tech-card/components/useSamples';
import { bomSectionToDbFilter } from './useMaterials';

// Material warehouse (new-flow NF-01). The stock list and movement ledger sit alongside the
// material catalog (useMaterials) but track balances, not nomenclature — a movement invalidates
// stock + movements, never the catalog list.
export const warehouseKeys = {
  all: ['warehouse'] as const,
  stock: (filter: MaterialStockFilter) => [...warehouseKeys.all, 'stock', filter] as const,
  movements: (filter: MovementFilter, limit: number) =>
    [...warehouseKeys.all, 'movements', filter, limit] as const,
  lots: (materialId: number, includeArchived: boolean) =>
    [...warehouseKeys.all, 'lots', materialId, includeArchived] as const,
};

export type MaterialStockFilter = {
  section?: string; // the UI enum constant; folded to the DB short name at the boundary
  q?: string;
  withStockOnly?: boolean;
  belowMinOnly?: boolean;
};

// ListMaterialStock is filtered server-side (no pagination) — one row per catalog material with
// its on-hand balance, valuation and low-stock flag. Money fields are stripped without costing:read.
export function useMaterialStock(filter: MaterialStockFilter) {
  return useQuery({
    queryKey: warehouseKeys.stock(filter),
    queryFn: () =>
      adminService.ListMaterialStock({
        section: bomSectionToDbFilter(filter.section ?? '') ?? '',
        q: filter.q ?? '',
        withStockOnly: filter.withStockOnly ?? false,
        belowMinOnly: filter.belowMinOnly ?? false,
      }),
  });
}

export type MovementFilter = {
  materialId?: number;
  productionRunId?: number;
  sampleId?: number;
  movementType?: common_MaterialMovementType;
  occurredFrom?: string; // YYYY-MM-DD
  occurredTo?: string; // YYYY-MM-DD
};

// Append-only movement ledger, paged by offset until `total` is reached (mirrors ListTechCards).
export function useMaterialMovements(filter: MovementFilter = {}, limit = 50) {
  return useInfiniteQuery({
    queryKey: warehouseKeys.movements(filter, limit),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res = await adminService.ListMaterialMovements({
        limit,
        offset: pageParam,
        materialId: filter.materialId ?? 0,
        productionRunId: filter.productionRunId ?? 0,
        sampleId: filter.sampleId ?? 0,
        movementType: filter.movementType ?? 'MATERIAL_MOVEMENT_TYPE_UNKNOWN',
        occurredFrom: filter.occurredFrom ?? '',
        occurredTo: filter.occurredTo ?? '',
      });
      const movements = res.movements ?? [];
      const total = res.total ?? 0;
      return {
        movements,
        total,
        nextOffset: pageParam + limit < total ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (last) => last.nextOffset,
    initialPageParam: 0,
  });
}

// A stock movement changes balances (and possibly the moving average) — invalidate the whole
// warehouse tree. The catalog (useMaterials) is untouched. Each mutation returns the posted
// MaterialMovement so callers can report `on hand before → after`.
// A movement targeting a run/sample also changes THAT entity's derived data (material plan
// shortages, sample composed cost) — invalidate those trees too, or e.g. issuing to PR-5 from
// the stock tab leaves /production-runs/5's plan stale for the whole 5-min staleTime.
function useMovementMutation<TReq, TRes>(fn: (req: TReq) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_res, req) => {
      qc.invalidateQueries({ queryKey: warehouseKeys.all });
      const target = req as { productionRunId?: number; sampleId?: number };
      if (target.productionRunId) qc.invalidateQueries({ queryKey: productionRunKeys.all });
      if (target.sampleId) qc.invalidateQueries({ queryKey: sampleKeys.all });
    },
  });
}

// Material lots (gap-07 v2 D): received batches (roll / dye-lot) of a material with a running
// remaining quantity, for traceability + colour matching. Read-only from the client — lots are
// created as a side effect of receives; unit_cost is informational (valuation stays moving-avg,
// NOT FIFO). materialId 0 lists across all materials. Lives under the warehouse tree so a receive
// (which invalidates warehouseKeys.all) also refreshes the lot list.
export function useMaterialLots(materialId: number, includeArchived: boolean, enabled = true) {
  return useQuery({
    queryKey: warehouseKeys.lots(materialId, includeArchived),
    queryFn: () => adminService.ListMaterialLots({ materialId, includeArchived }),
    enabled,
  });
}

export function useReceiveMaterialStock() {
  return useMovementMutation((req: ReceiveMaterialStockRequest) =>
    adminService.ReceiveMaterialStock(req),
  );
}

export function useIssueMaterialStock() {
  return useMovementMutation((req: IssueMaterialStockRequest) =>
    adminService.IssueMaterialStock(req),
  );
}

export function useAdjustMaterialStock() {
  return useMovementMutation((req: AdjustMaterialStockRequest) =>
    adminService.AdjustMaterialStock(req),
  );
}
