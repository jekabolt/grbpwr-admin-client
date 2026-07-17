import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ArchiveInsert } from 'api/proto-http/admin';

// R3: the admin archive surface keys on internal numeric ids. GetArchivesPaged is the ADMIN list
// (carries id + code, unlike the storefront projection), so the timeline list, hero picker and
// card-delete all read real ids; the edit page resolves code -> id through it (see useArchiveDetails).
// A curated brand timeline is small, so one generous page covers the code->id lookup.
const ARCHIVE_LOOKUP_LIMIT = 1000;

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
      const response = await adminService.GetArchivesPaged({
        limit,
        offset,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return response.archives || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Route-E: the timeline detail URL is /timeline/{pretty}-{code}; `tail` is the segment after the last
// '-' — the archive's stable public `code`. The admin detail (GetArchiveByID) keys on the internal
// numeric id, so we resolve code -> id through the admin list (which carries both) and then load the
// full admin archive by id. The result is a plain common_ArchiveFull whose archiveList.id drives the
// UpdateArchive write.
export function useArchiveDetails(tail: string | undefined) {
  return useQuery({
    queryKey: archiveKeys.detail(tail ?? ''),
    queryFn: async () => {
      const list = await adminService.GetArchivesPaged({
        limit: ARCHIVE_LOOKUP_LIMIT,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      const match = list.archives?.find((a) => a.code === tail);
      if (match?.id == null) return undefined;
      const response = await adminService.GetArchiveByID({ id: match.id });
      return response.archive;
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
      const response = await adminService.GetArchivesPaged({
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
