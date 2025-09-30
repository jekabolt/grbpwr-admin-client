import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addArchive, deleteArchive, getArchive, getArchiveItems, updateArchive } from 'api/archive';
import { common_ArchiveInsert } from 'api/proto-http/admin';

export const archiveKeys = {
  all: ['archives'] as const,
  lists: () => [...archiveKeys.all, 'list'] as const,
  list: (filters: { limit: number; offset: number }) => [...archiveKeys.lists(), filters] as const,
  details: () => [...archiveKeys.all, 'detail'] as const,
  detail: (id: number) => [...archiveKeys.details(), id] as const,
};

export function useArchives(limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: archiveKeys.list({ limit, offset }),
    queryFn: async () => {
      const response = await getArchive({
        limit,
        offset,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return response.archives || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useArchiveDetails(
  id: number | undefined,
  archiveData?: { heading?: string; tag?: string },
) {
  return useQuery({
    queryKey: archiveKeys.detail(id!),
    queryFn: async () => {
      const response = await getArchiveItems({
        id: id!,
        heading: archiveData?.heading || 'string',
        tag: archiveData?.tag || 'string',
      });
      return response.archive;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archiveData: common_ArchiveInsert) => addArchive({ archiveInsert: archiveData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: archiveKeys.lists() });
    },
  });
}

export function useUpdateArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archiveData }: { id: number; archiveData: common_ArchiveInsert }) =>
      updateArchive({ id, archiveInsert: archiveData }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: archiveKeys.lists() });
      queryClient.invalidateQueries({ queryKey: archiveKeys.detail(variables.id) });
    },
  });
}

export function useDeleteArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteArchive({ id }),
    onSuccess: (data, id) => {
      queryClient.removeQueries({ queryKey: archiveKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: archiveKeys.lists() });
    },
  });
}

export function useInfiniteArchives(limit: number = 50) {
  return useInfiniteQuery({
    queryKey: [...archiveKeys.lists(), 'infinite'],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await getArchive({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return {
        archives: response.archives || [],
        nextOffset: response.archives?.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}
