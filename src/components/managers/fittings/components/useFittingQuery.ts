import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_FittingInsert } from 'api/proto-http/admin';
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
    mutationFn: ({ id, fitting }: { id: number; fitting: common_FittingInsert }) =>
      adminService.UpdateFitting({ id, fitting }),
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
