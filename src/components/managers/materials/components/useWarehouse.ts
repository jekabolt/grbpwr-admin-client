import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  AdjustMaterialStockRequest,
  IssueMaterialStockRequest,
  ReceiveMaterialStockRequest,
  common_MaterialMovementType,
} from 'api/proto-http/admin';
import { bomSectionToDbFilter } from './useMaterials';

// Material warehouse (new-flow NF-01). The stock list and movement ledger sit alongside the
// material catalog (useMaterials) but track balances, not nomenclature — a movement invalidates
// stock + movements, never the catalog list.
export const warehouseKeys = {
  all: ['warehouse'] as const,
  stock: (filter: MaterialStockFilter) => [...warehouseKeys.all, 'stock', filter] as const,
  movements: (filter: MovementFilter, limit: number) =>
    [...warehouseKeys.all, 'movements', filter, limit] as const,
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
function useMovementMutation<TReq, TRes>(fn: (req: TReq) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: warehouseKeys.all }),
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
