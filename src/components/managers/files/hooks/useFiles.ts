import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { filesService } from '../api/filesService';

export const filesKeys = {
  all: ['files'] as const,
  list: (topicId: number, untopiced: boolean, search: string) =>
    [...filesKeys.all, 'list', topicId, untopiced, search] as const,
  file: (id: number) => [...filesKeys.all, 'file', id] as const,
  topics: () => [...filesKeys.all, 'topics'] as const,
};

const PAGE_SIZE = 60;

/**
 * staleTime is well under the 6h life of the presigned urls a response carries. A
 * cached page older than its urls would render broken thumbnails and dead download
 * links — the data would still be correct, which is exactly what makes that failure
 * confusing to look at.
 */
const URL_SAFE_STALE_TIME = 30 * 60 * 1000;

export function useFileTopics() {
  return useQuery({
    queryKey: filesKeys.topics(),
    queryFn: () => filesService.listTopics(),
    staleTime: URL_SAFE_STALE_TIME,
  });
}

export function useLibraryFiles(args: {
  topicId: number;
  untopiced: boolean;
  search: string;
}) {
  const { topicId, untopiced, search } = args;
  return useInfiniteQuery({
    queryKey: filesKeys.list(topicId, untopiced, search),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      filesService.listFiles({
        topicId,
        untopiced,
        search,
        limit: PAGE_SIZE,
        offset: pageParam as number,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + (p.files?.length ?? 0), 0);
      const total = Number(lastPage.total ?? 0);
      return loaded < total ? loaded : undefined;
    },
    staleTime: URL_SAFE_STALE_TIME,
  });
}

export function useLibraryFile(id: number | undefined) {
  return useQuery({
    queryKey: filesKeys.file(id ?? 0),
    queryFn: () => filesService.getFile(id as number),
    enabled: !!id,
    staleTime: URL_SAFE_STALE_TIME,
  });
}

/** Every mutation invalidates both the grid and the rail: a topic change moves a file
 * between rails and shifts two counts, so refreshing one without the other leaves the
 * screen visibly disagreeing with itself. */
export function useFilesMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: filesKeys.all });
  };

  const updateFile = useMutation({
    mutationFn: filesService.updateFile,
    onSuccess: invalidate,
  });
  const deleteFile = useMutation({
    mutationFn: filesService.deleteFile,
    onSuccess: invalidate,
  });
  const createTopic = useMutation({
    mutationFn: (args: { name: string; description?: string }) =>
      filesService.createTopic(args.name, args.description),
    onSuccess: invalidate,
  });

  return { updateFile, deleteFile, createTopic, invalidate };
}
