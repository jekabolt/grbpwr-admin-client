import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ArchiveInsert, common_ArchiveList } from 'api/proto-http/admin';

export const archiveKeys = {
  all: ['archives'] as const,
  lists: () => [...archiveKeys.all, 'list'] as const,
  details: () => [...archiveKeys.all, 'detail'] as const,
  detail: (key: string | number) => [...archiveKeys.details(), key] as const,
};

// A1/A7: the timeline detail URL is /timeline/{pretty}-{code}; `tail` is the segment
// after the last '-'. New rows carry a stable public `code`; rows not yet
// code-backfilled during the cutover fall back to the internal numeric id as their
// link tail (see archvie-item.tsx's buildHandle) — so this must match on EITHER, or
// any id-tail row is listed and clickable but 404s on its own detail page forever.
// Paginates until a match is found (rather than one hardcoded page) so an entry
// past an arbitrary page cutoff isn't permanently unreachable either; bounded by a
// generous safety cap against a runaway loop / misbehaving backend.
async function findArchiveByTail(tail: string): Promise<common_ArchiveList | undefined> {
  const pageSize = 200;
  const maxScanned = 20000;
  let offset = 0;
  for (;;) {
    const page = await adminService.GetArchivesPaged({
      limit: pageSize,
      offset,
      orderFactor: 'ORDER_FACTOR_DESC',
    });
    const archives = page.archives || [];
    const match = archives.find((a) => a.code === tail || (a.id != null && String(a.id) === tail));
    if (match) return match;
    if (archives.length < pageSize) return undefined; // exhausted the list
    offset += pageSize;
    if (offset >= maxScanned) return undefined;
  }
}

// Route-E: the admin detail (GetArchiveByID) keys on the internal numeric id, so we
// resolve tail -> id through the admin list (which carries both) and then load the
// full admin archive by id. The result is a plain common_ArchiveFull whose
// archiveList.id drives the UpdateArchive write.
export function useArchiveDetails(tail: string | undefined) {
  return useQuery({
    queryKey: archiveKeys.detail(tail ?? ''),
    queryFn: async () => {
      const match = tail ? await findArchiveByTail(tail) : undefined;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: archiveKeys.lists() });
      // A8: useArchiveDetails caches the open entry under the code/tail (a
      // string) — invalidating archiveKeys.detail(<numeric id>) here never
      // matched that key, so a just-saved entry could keep serving stale cached
      // data for up to 5 minutes. Invalidate the whole details() prefix instead
      // so it works regardless of which tail form the entry is cached under.
      queryClient.invalidateQueries({ queryKey: archiveKeys.details() });
    },
  });
}

export function useDeleteArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteArchiveById({ id }),
    onSuccess: () => {
      // Same id/tail cache-key mismatch as useUpdateArchive (A8).
      queryClient.removeQueries({ queryKey: archiveKeys.details() });
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
        // A11: the backend already returns the real count; surface it so the
        // header can show "N of TOTAL" instead of only an approximate "N+ loaded".
        total: response.total,
        nextOffset: response.archives?.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}
