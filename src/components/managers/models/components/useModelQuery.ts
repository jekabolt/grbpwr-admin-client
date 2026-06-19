import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ModelInsert } from 'api/proto-http/admin';

export const modelKeys = {
  all: ['models'] as const,
  lists: () => [...modelKeys.all, 'list'] as const,
  details: () => [...modelKeys.all, 'detail'] as const,
  detail: (id: number) => [...modelKeys.details(), id] as const,
};

// Infinite list for the models table. ListModels returns `total` (count ignoring
// pagination), so we page by offset until the loaded count reaches total.
export function useInfiniteModels(limit: number = 30) {
  return useInfiniteQuery({
    queryKey: [...modelKeys.lists(), 'infinite', limit],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.ListModels({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      const models = response.models || [];
      const total = response.total ?? 0;
      return {
        models,
        total,
        nextOffset: pageParam + limit < total ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}

// Flat list of all models, used to populate the model picker in the fitting form
// and to resolve model names in the fittings table.
export function useAllModels(limit: number = 500) {
  return useQuery({
    queryKey: [...modelKeys.lists(), 'all', limit],
    queryFn: async () => {
      const response = await adminService.ListModels({
        limit,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return response.models || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useModel(id: number | undefined) {
  return useQuery({
    queryKey: modelKeys.detail(id!),
    queryFn: async () => {
      const response = await adminService.GetModel({ id: id! });
      return response.model;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (model: common_ModelInsert) => adminService.AddModel({ model }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelKeys.lists() });
    },
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, model }: { id: number; model: common_ModelInsert }) =>
      adminService.UpdateModel({ id, model }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: modelKeys.lists() });
      queryClient.invalidateQueries({ queryKey: modelKeys.detail(variables.id) });
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteModel({ id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: modelKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: modelKeys.lists() });
    },
  });
}
