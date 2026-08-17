import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { LibraryFileSort } from 'api/proto-http/admin';
import { tasksKeys } from 'components/managers/tasks/hooks/useTasks';
import { filesService } from '../api/filesService';

/** Порядок сетки. `new` — прежний порядок по дате; имя и размер имеют свои фиксированные
 * направления (А→Я и «крупное сверху»), поэтому направлением их никто не управляет. */
export type FilesSort = 'new' | 'name' | 'size';

export const SORT_LABEL: Record<FilesSort, string> = {
  new: 'newest first',
  name: 'by name',
  size: 'by size',
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

/**
 * ПРОТУХАНИЕ ПОСЛЕ ПРАВКИ ФАЙЛА — ДВУМЯ КОРНЯМИ, а не одним.
 *
 * Плитка файла рисуется не только на холсте: ту же `FileTile` показывают вложения карточки
 * задачи, и там она приезжает из `['tasks','detail',id]` — ключа, который `['files']` не
 * накрывает, потому что деревья не пересекаются. Пока корень был один, карточка задачи до
 * получаса держала СТАРЫЙ счётчик обсуждения и СТАРЫЙ БЕЙДЖ УРОВНЯ.
 *
 * ГРАНИЦА ОБЕЩАНИЯ — ВКЛАДКА, и это надо называть вслух, потому что главный путь к карточке
 * файла её пересекает: плитка вложения открывает карточку в СОСЕДНЕЙ вкладке
 * (`tasks/task-detail/attachment-tiles.tsx`), а у соседней вкладки свой `QueryClient`. Правка
 * уровня, сделанная там, здешний кэш не трогает никак: плитка в задаче будет говорить «вся
 * команда», пока страницу задачи не смонтируют заново. Синхронизации кэшей между вкладками в
 * приложении нет, и заводить её ради одного бейджа дороже, чем она стоит.
 *
 * Значит, эта функция закрывает ровно ОДИН случай — правку и просмотр в одной вкладке: экран
 * файлов и карточка задачи, открытые подряд по маршруту, обсуждение или уровень, изменённые с
 * витрины открытого доступа. Это не весь случай, но это тот, который дешевле починить, чем
 * объяснить.
 *
 * `refetchType: 'none'` намеренно: задачи нужно ПОМЕТИТЬ устаревшими, а не тянуть заново с
 * экрана файлов. Смонтированная карточка задачи перечитается сама, когда до неё дойдут; со
 * стороны файлов лишний поход в чужой раздел на каждую реплику был бы платой ни за что.
 *
 * Ключ задач взят из `tasksKeys.all` — импорт живой, чтобы переименование корня задач ломало
 * сборку здесь, а не молчало.
 */
export function invalidateFileViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: filesKeys.all });
  qc.invalidateQueries({ queryKey: tasksKeys.all, refetchType: 'none' });
}

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
      // Пустая страница при ненулевом total — это рассинхрон count и select под чужим
      // удалением. Без этой проверки offset не растёт, и каждое «показать ещё» подшивает
      // ещё одну пустую страницу, обещая продолжение, которого нет.
      if (!lastPage.files?.length) return undefined;
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
 * screen visibly disagreeing with itself.
 *
 * ЧЕРЕЗ `invalidateFileViews`, А НЕ ПО ОДНОМУ КОРНЮ. Здесь правят ровно то, что плитка
 * вложения задачи и показывает: имя файла (`updateFile`) и его темы (`assignTopics`). Свой
 * `invalidateQueries(filesKeys.all)` оставлял бы карточку задачи со старым именем и старым
 * набором тем — той же половинчатостью, из-за которой вторая инвалидация и появилась.
 * `deleteFile` тем более: удалённый файл обязан пропасть и из вложений. */
export function useFilesMutations() {
  const qc = useQueryClient();
  const invalidate = () => invalidateFileViews(qc);

  const updateFile = useMutation({
    mutationFn: filesService.updateFile,
    onSuccess: invalidate,
  });
  const deleteFile = useMutation({
    // ПОВТОР СНЯТ ТОЧЕЧНО. Глобальный `mutations.retry: 1` (см. `src/index.tsx`) шлёт второй
    // запрос на любой отказ: замерено, что 403 на удаление даёт ДВА DELETE подряд. На отказе
    // повтор не меняет ничего, а на обрыве связи он бьёт вторым разрушительным запросом по
    // файлу, который первый мог уже удалить, — и второй ответ («файла нет») человек прочтёт
    // как причину, по которой удаление не вышло.
    retry: 0,
    mutationFn: filesService.deleteFile,
    onSuccess: invalidate,
  });
  // `createTopic` здесь больше нет: тему заводят либо экраном тем (`topicsService.create`),
  // либо попутно — списком `newTopics` в самом сохранении файла. Мутация-сирота осталась от
  // третьего, снятого способа и только предлагала бы четвёртый путь к одной и той же записи.
  const assignTopics = useMutation({
    mutationFn: filesService.assignTopics,
    onSuccess: invalidate,
  });

  return { updateFile, deleteFile, assignTopics, invalidate };
}
