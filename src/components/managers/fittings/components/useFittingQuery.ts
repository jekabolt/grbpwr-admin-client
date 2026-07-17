import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_FittingChangeRequestInsert, common_FittingInsert } from 'api/proto-http/admin';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';

export type FittingFilter = {
  productId?: number;
  modelId?: number;
};

export const fittingKeys = {
  all: ['fittings'] as const,
  lists: () => [...fittingKeys.all, 'list'] as const,
  list: (filter: FittingFilter) => [...fittingKeys.lists(), filter] as const,
  details: () => [...fittingKeys.all, 'detail'] as const,
  detail: (id: number) => [...fittingKeys.details(), id] as const,
};

// Infinite list, optionally filtered by product and/or model. ListFittings returns
// `total` (matching count ignoring pagination), so we page by offset until reached.
export function useInfiniteFittings(filter: FittingFilter = {}, limit: number = 30) {
  return useInfiniteQuery({
    queryKey: [...fittingKeys.list(filter), 'infinite', limit],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.ListFittings({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
        productId: filter.productId ?? 0,
        modelId: filter.modelId ?? 0,
        techCardId: 0,
      });
      const fittings = response.fittings || [];
      const total = response.total ?? 0;
      return {
        fittings,
        total,
        nextOffset: pageParam + limit < total ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFitting(id: number | undefined) {
  return useQuery({
    queryKey: fittingKeys.detail(id!),
    queryFn: async () => {
      const response = await adminService.GetFitting({ id: id! });
      return response.fitting;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateFitting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fitting: common_FittingInsert) => adminService.AddFitting({ fitting }),
    onSuccess: (_data, fitting) => {
      queryClient.invalidateQueries({ queryKey: fittingKeys.lists() });
      if (fitting.techCardId) {
        queryClient.invalidateQueries({
          queryKey: [...techCardKeys.detail(fitting.techCardId), 'fittings'],
        });
      }
    },
  });
}

export function useUpdateFitting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      fitting,
      expectedLockVersion,
    }: {
      id: number;
      fitting: common_FittingInsert;
      expectedLockVersion: number;
    }) => adminService.UpdateFitting({ id, fitting, expectedLockVersion }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: fittingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fittingKeys.detail(variables.id) });
      if (variables.fitting.techCardId) {
        queryClient.invalidateQueries({
          queryKey: [...techCardKeys.detail(variables.fitting.techCardId), 'fittings'],
        });
      }
    },
  });
}

// A stale optimistic-lock (Aborted → 409) reads clearly.
export function fittingSaveErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 409)
    return 'This fitting was changed by someone else — reload and re-apply your edits.';
  return e instanceof Error ? e.message : 'Failed to save fitting';
}

// Dedicated change-request CRUD (S26/§2.7): managed individually so ids are STABLE (carried_from_id
// and the carry-over/resolve flow depend on it). Invalidates the owning fitting's detail so the
// form's echoed change-request set stays fresh, and the carry-over list across the style.
const crKeys = {
  open: (techCardId: number, beforeRound: number) =>
    ['openChangeRequests', techCardId, beforeRound] as const,
};

export function useAddFittingChangeRequest(fittingId: number, techCardId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changeRequest: common_FittingChangeRequestInsert) =>
      adminService.AddFittingChangeRequest({ changeRequest }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fittingKeys.detail(fittingId) });
      if (techCardId) qc.invalidateQueries({ queryKey: ['openChangeRequests', techCardId] });
    },
  });
}

export function useUpdateFittingChangeRequest(fittingId: number, techCardId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changeRequest,
    }: {
      id: number;
      changeRequest: common_FittingChangeRequestInsert;
    }) => adminService.UpdateFittingChangeRequest({ id, changeRequest }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fittingKeys.detail(fittingId) });
      if (techCardId) qc.invalidateQueries({ queryKey: ['openChangeRequests', techCardId] });
    },
  });
}

export function useDeleteFittingChangeRequest(fittingId: number, techCardId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteFittingChangeRequest({ id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fittingKeys.detail(fittingId) });
      if (techCardId) qc.invalidateQueries({ queryKey: ['openChangeRequests', techCardId] });
    },
  });
}

// Carry-over view: OPEN structured remarks from a style's earlier rounds (before this round).
export function useOpenFittingChangeRequests(techCardId?: number, beforeRound = 0, enabled = true) {
  return useQuery({
    queryKey: crKeys.open(techCardId ?? 0, beforeRound),
    queryFn: () =>
      adminService.ListOpenFittingChangeRequests({
        techCardId: techCardId ?? 0,
        beforeRound,
      }),
    enabled: enabled && !!techCardId,
  });
}

export function useDeleteFitting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteFitting({ id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: fittingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: fittingKeys.lists() });
    },
  });
}
