import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibraryFileSort } from 'api/proto-http/admin';
import { filesService } from '../api/filesService';

/** Порядок сетки. `new` — прежний порядок по дате; имя и размер имеют свои фиксированные
 * направления (А→Я и «крупное сверху»), поэтому направлением их никто не управляет. */
export type FilesSort = 'new' | 'name' | 'size';

export const SORT_LABEL: Record<FilesSort, string> = {
  new: 'сначала новые',
  name: 'по имени',
  size: 'по размеру',
};

function sortBy(sort: FilesSort): LibraryFileSort | undefined {
  if (sort === 'name') return 'LIBRARY_FILE_SORT_NAME';
  if (sort === 'size') return 'LIBRARY_FILE_SORT_SIZE';
  return undefined;
}

export type FilesFilter = {
  /** Пересечение: файл обязан нести ВСЕ эти темы. */
  topicIds: number[];
  untopiced: boolean;
  search: string;
  sort: FilesSort;
};

export const filesKeys = {
  all: ['files'] as const,
  // Ключ несёт ОТСОРТИРОВАННЫЙ список тем: [3,1] и [1,3] — один и тот же фильтр, и два
  // разных ключа под ним означали бы два запроса и две копии кэша на одну выдачу.
  list: (f: FilesFilter) =>
    [
      ...filesKeys.all,
      'list',
      [...f.topicIds].sort((a, b) => a - b).join(','),
      f.untopiced,
      f.search,
      f.sort,
    ] as const,
  /** Сколько всего найдётся по этому запросу БЕЗ фильтра тем — для «искать во всех темах (N)». */
  searchTotal: (search: string) => [...filesKeys.all, 'search-total', search] as const,
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

export function useLibraryFiles(filter: FilesFilter) {
  const { topicIds, untopiced, search, sort } = filter;
  return useInfiniteQuery({
    queryKey: filesKeys.list(filter),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      filesService.listFiles({
        topicIds,
        untopiced,
        search,
        sortBy: sortBy(sort),
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

/**
 * Второй счёт: сколько тот же запрос находит БЕЗ фильтра тем.
 *
 * Спрашивается только тогда, когда внутри выбранных чипов не нашлось ничего — иначе это
 * лишний запрос на каждое нажатие клавиши. Ответ и есть число в кнопке «искать во всех
 * темах (N)»: без него кнопка обещает результат, которого может не быть.
 */
export function useSearchTotalEverywhere(search: string, enabled: boolean) {
  return useQuery({
    queryKey: filesKeys.searchTotal(search),
    queryFn: () => filesService.listFiles({ search, limit: 1, offset: 0 }),
    enabled: enabled && !!search.trim(),
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
  const assignTopics = useMutation({
    mutationFn: filesService.assignTopics,
    onSuccess: invalidate,
  });

  return { updateFile, deleteFile, createTopic, assignTopics, invalidate };
}
