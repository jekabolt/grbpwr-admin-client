import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { filesKeys, invalidateFileViews } from '../hooks/useFiles';

/** Три положения рельса витрины. `all` — оба особых уровня разом, `team` тут не бывает. */
export type SharedFilter = 'all' | 'link' | 'people';

export const SHARED_PAGE_SIZE = 50;

/**
 * Ключи ВЛОЖЕНЫ в `filesKeys.all` (`['files']`) намеренно: карточка и холст инвалидируют весь
 * этот префикс после смены доступа, и витрина обязана протухать вместе с ними. Свой корень
 * означал бы экран, который после «закрыть доступ» в другой вкладке продолжает показывать файл
 * открытым — то есть врёт ровно про то, ради чего он существует.
 */
export const sharedKeys = {
  all: [...filesKeys.all, 'shared'] as const,
  page: (level: string, offset: number) => [...sharedKeys.all, 'page', level, offset] as const,
  count: (level: string) => [...sharedKeys.all, 'count', level] as const,
};

/**
 * Ответ несёт presigned-ссылки превью (живут 6 часов). Страница, пролежавшая в кэше дольше, чем
 * они, рисовала бы битые миниатюры при полностью верных данных — тот же довод и то же число, что
 * у сетки библиотеки.
 */
const URL_SAFE_STALE_TIME = 30 * 60 * 1000;

function levelParam(filter: SharedFilter): string {
  return filter === 'all' ? '' : filter;
}

/** Страница витрины. `total` — со стороны сервера: список постраничный, и счёт на клиенте
 * означал бы «3 из 40», не означающее ни того, ни другого. */
export function useSharedFiles(filter: SharedFilter, offset: number, enabled = true) {
  const level = levelParam(filter);
  return useQuery({
    queryKey: sharedKeys.page(level, offset),
    queryFn: () =>
      adminService.ListSharedLibraryFiles({ level, limit: SHARED_PAGE_SIZE, offset }),
    staleTime: URL_SAFE_STALE_TIME,
    // Тот же `retry: false`, что у трёх секций карточки, и по той же причине: до выката шлюз
    // отвечает Unimplemented (501), а на 403 и 501 повтор не меняет ничего — он лишь удваивает
    // каждый из трёх запросов экрана и вдвое оттягивает момент, когда человек прочтёт отказ.
    retry: false,
    // Аккаунт без files:read получил бы 403 на каждый из трёх запросов ещё до того, как экран
    // успеет сказать ему «доступа нет». Молчать тут честнее, чем шуметь в консоль отказами.
    enabled,
  });
}

/**
 * Счётчик уровня для рельса. `limit: 1` — нужен только `total`, а страница по этому ключу и не
 * рисуется.
 *
 * Считаются ДВА уровня, а не три: они не пересекаются по построению (уровень у файла один), и
 * «всё особое» — это их сумма. Третий запрос ради числа, которое уже известно сложением, был бы
 * лишним походом на каждый заход.
 */
export function useSharedCount(level: 'link' | 'people', enabled = true) {
  return useQuery({
    queryKey: sharedKeys.count(level),
    queryFn: () => adminService.ListSharedLibraryFiles({ level, limit: 1, offset: 0 }),
    staleTime: URL_SAFE_STALE_TIME,
    retry: false,
    select: (r) => Number(r.total ?? 0),
    enabled,
  });
}

/**
 * «Закрыть доступ» — это `level: 'team'`, а не удаление ссылки.
 *
 * Один вызов возвращает файл всей команде: у уровня `link` он мгновенно убивает выданный токен
 * (маршрут проверяет уровень НА СТРОКЕ ФАЙЛА, поэтому совпадения поколения мало), у уровня
 * `people` — возвращает файл в общие выдачи. `adminIds` уходит пустым, но сервер список НЕ
 * стирает: возврат team → people не заставит набирать людей заново.
 */
export function useCloseSharedAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: number) =>
      adminService.SetLibraryFileAccess({ fileId, level: 'team', adminIds: [], linkTtl: 0 }),
    // Весь префикс `['files']`: закрытый файл меняет и витрину, и её счётчики, и сетку, и
    // карточку — перечислять их поимённо значит однажды забыть одну. Плюс корень задач: бейдж
    // уровня едет и на плитке вложения задачи — см. `invalidateFileViews`.
    onSuccess: () => invalidateFileViews(qc),
  });
}
