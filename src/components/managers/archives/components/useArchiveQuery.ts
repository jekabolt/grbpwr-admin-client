import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService, frontendService } from 'api/api';
import { common_ArchiveFull, common_ArchiveInsert, common_ArchiveList } from 'api/proto-http/admin';

// R3/storefront-projections: the archive list & detail RPCs return the storefront projection now
// (StorefrontArchiveList/Full — code-keyed, structurally identical to the admin models for the fields
// the admin UI reads, but with no numeric `id`). We surface them as the admin common_* types so the
// existing archive/hero screens keep compiling; see the id/code note on useArchiveDetails.

export const archiveKeys = {
  all: ['archives'] as const,
  lists: () => [...archiveKeys.all, 'list'] as const,
  list: (filters: { limit: number; offset: number }) => [...archiveKeys.lists(), filters] as const,
  details: () => [...archiveKeys.all, 'detail'] as const,
  detail: (key: string | number) => [...archiveKeys.details(), key] as const,
};

export function useArchives(limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: archiveKeys.list({ limit, offset }),
    queryFn: async () => {
      const response = await frontendService.GetArchivesPaged({
        limit,
        offset,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return (response.archives || []) as unknown as common_ArchiveList[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Route-E: the timeline detail URL is /timeline/{pretty}-{code}; `tail` is the segment after the last
// '-' — the archive's stable public `code`. The legacy numeric-id lookup is gone (every archive is
// code-backfilled): the detail always resolves by code. The returned StorefrontArchiveFull is
// structurally compatible with common_ArchiveFull for the form's read fields (it drops only the
// numeric id, which the admin write path sources from the URL tail, not from here).
export function useArchiveDetails(tail: string | undefined) {
  return useQuery({
    queryKey: archiveKeys.detail(tail ?? ''),
    queryFn: async () => {
      const response = await frontendService.GetArchive({
        id: undefined,
        heading: undefined,
        tag: undefined,
        code: tail,
      });
      return response.archive as unknown as common_ArchiveFull | undefined;
    },
    enabled: !!tail,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archiveData: common_ArchiveInsert) =>
      adminService.AddArchive({ archiveInsert: archiveData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: archiveKeys.lists() });
    },
  });
}

export function useUpdateArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archiveData }: { id: number; archiveData: common_ArchiveInsert }) =>
      adminService.UpdateArchive({ id, archiveInsert: archiveData }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: archiveKeys.lists() });
      queryClient.invalidateQueries({ queryKey: archiveKeys.detail(variables.id) });
    },
  });
}

export function useDeleteArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteArchiveById({ id }),
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
      const response = await frontendService.GetArchivesPaged({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return {
        archives: (response.archives || []) as unknown as common_ArchiveList[],
        nextOffset: response.archives?.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}
