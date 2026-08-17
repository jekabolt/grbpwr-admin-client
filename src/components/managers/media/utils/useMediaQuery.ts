import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { MediaUsage, common_MediaFull } from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { useMemo } from 'react';
import { MediaUsageMap } from './media-usage';

const ITEMS_PER_PAGE = 50;

export const mediaKeys = {
  all: ['media'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (filters: { limit: number; offset: number }) => [...mediaKeys.lists(), filters] as const,
  usage: (bucket: number) => [...mediaKeys.all, 'usage', bucket] as const,
};

export function useMedia(limit: number = ITEMS_PER_PAGE, offset: number = 0) {
  return useQuery({
    queryKey: mediaKeys.list({ limit, offset }),
    queryFn: async () => {
      const response = await adminService.ListObjectsPaged({
        limit,
        offset,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return response.list || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useInfiniteMedia(limit: number = ITEMS_PER_PAGE) {
  return useInfiniteQuery({
    queryKey: mediaKeys.lists(),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.ListObjectsPaged({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return {
        media: response.list || [],
        nextOffset: response.list?.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}

// id → MediaFull map over the most-recent `limit` library items. Used to resolve media
// referenced only by id (colourway swatches, construction-description reference images) that
// the tech card's resolved sketch media (moodboard/technical only) doesn't carry. Best-effort: media older
// than `limit` items back won't resolve — the proper fix is the backend resolving all
// referenced media. One cached request (5 min).
export function useMediaMap(limit = 500) {
  const { data } = useMedia(limit, 0);
  return useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const item of data ?? []) if (item?.id != null) m.set(item.id, item);
    return m;
  }, [data]);
}

/**
 * Ширина корзины, которой кэшируется занятость.
 *
 * КЛЮЧ — ДИАПАЗОН id, А НЕ СПИСОК ВИДИМОГО. Список видимых кадров меняется от каждой буквы в
 * поиске, каждой полки отбора и каждой подгруженной страницы; ключ, собранный по нему, протухал
 * бы на любое движение, и сетка заново спрашивала бы ровно то, что уже знает. Диапазон стабилен:
 * страница из пятидесяти плиток укладывается в один-два запроса, а прокрутка вниз чаще всего не
 * стоит ни одного — id соседних загрузок лежат в той же сотне.
 *
 * Цена — до сотни id в запросе вместо ровно нужных, включая дырки от удалённых: сервер отвечает
 * на несуществующий id пустым списком, а не ошибкой, и берёт до пятисот id за раз (см.
 * `maxMediaUsageIds` в apisrv). Сотня держит и запас до потолка, и длину GET-строки.
 */
const USAGE_BUCKET = 100;

/**
 * Занятость меняется реже самой библиотеки, но именно ею гейтится удаление, поэтому те же пять
 * минут, что и у списка. Протухшее «занято» — лишний отказ показать удаление, протухшее
 * «свободно» — старое поведение: бакет откажет сам, и полоса набора это назовёт.
 */
const USAGE_STALE_TIME = 5 * 60 * 1000;

/** id корзины, в которую попадает медиа. Корзина `b` покрывает id от `b*100+1` до `b*100+100`. */
const usageBucketOf = (id: number) => Math.floor((id - 1) / USAGE_BUCKET);

/**
 * Склейка корзин в одну карту.
 *
 * ОБЪЯВЛЕНА СНАРУЖИ ХУКА, И ЭТО НЕ СТИЛЬ. `useQueries` кэширует результат `combine` при двух
 * условиях сразу: не изменились ответы И `combine` та же по ссылке (`queriesObserver`,
 * `#combineResult`). Стрелка, написанная прямо в вызове, — новая функция на каждый рендер, то
 * есть кэш промахивается всегда; а `replaceEqualDeep`, которым результат схлопывают, `Map` не
 * умеет сравнивать и отдаёт новую. Карта меняла бы ссылку на каждый рендер, и мемоизация в
 * `useFilter` не срабатывала бы ни разу — ровно та же беда, от которой список медиа собирают
 * один раз на ответ (см. `media` в index.tsx).
 */
function combineUsage(
  results: { data?: MediaUsage[]; isPending: boolean; isError: boolean }[],
) {
  const usage: MediaUsageMap = new Map();
  for (const result of results) {
    for (const u of result.data ?? []) {
      // Сервер отвечает на КАЖДЫЙ запрошенный id, в том числе пустым списком — поэтому ключ
      // ставится всегда, и «нет ключа» остаётся честным «ещё не спрашивали».
      if (u.mediaId != null) usage.set(u.mediaId, u.refs ?? []);
    }
  }
  // Провал корзины ОБЯЗАН быть отличим от медленной корзины: и то и другое оставляет id без
  // ключа, но «ещё едет» проходит, а «не доехало» — это молчаливое «не проверено» навсегда,
  // ровно с той же ценой, что и ложное «свободно».
  return {
    usage,
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
  };
}

/**
 * Где используется снимок, пачкой по видимым id.
 *
 * `enabled=false` не «не показывать ответ», а НЕ СПРАШИВАТЬ ВОВСЕ: в диалоге выбора медиа под
 * слот занятость не нужна ни на одном экране, и запрос там был бы чистой платой за прокрутку
 * чужой сетки.
 */
export function useMediaUsage(media: common_MediaFull[], enabled = true) {
  const buckets = useMemo(() => {
    if (!enabled) return [];
    const set = new Set<number>();
    for (const m of media) {
      if (m.id != null && m.id > 0) set.add(usageBucketOf(m.id));
    }
    return [...set].sort((a, b) => a - b);
  }, [media, enabled]);

  return useQueries({
    queries: buckets.map((bucket) => ({
      queryKey: mediaKeys.usage(bucket),
      queryFn: async () => {
        const from = bucket * USAGE_BUCKET + 1;
        const mediaIds = Array.from({ length: USAGE_BUCKET }, (_, i) => from + i);
        const response = await adminService.GetMediaUsage({ mediaIds });
        return response.usages || [];
      },
      staleTime: USAGE_STALE_TIME,
    })),
    combine: combineUsage,
  });
}

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteFromBucket({ id }),
    retry: false,
    onSuccess: () => {
      // СПИСКИ, А НЕ ВСЁ ПОДРЯД. Под `all` с появлением занятости лежат ещё и корзины, а
      // удаление одного кадра не меняет того, где стоят ОСТАЛЬНЫЕ: сброс `all` гнал бы за
      // каждый удалённый файл лишний веер запросов, каждый из которых — UNION по семнадцати
      // таблицам. Ключ занятости при этом нарочно оставлен под `all`, чтобы его можно было
      // сбросить целиком одной строкой, когда это понадобится.
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
  });
}

export type BulkDeleteResult = { deleted: number[]; failed: { id: number; reason: string }[] };

/**
 * Удаление пачкой. Бакет умеет удалять только по одному, поэтому запросы идут подряд, а НЕ
 * `Promise.all`: отказ на одном id не должен уносить остальные, и порядок отказов должен
 * совпадать с порядком, в котором человек их видит.
 *
 * Возвращается разбор, а не бросается исключение: удаление двадцати снимков, где два стоят на
 * витрине, — это НЕ провал операции, это восемнадцать удалённых и два названных отказа.
 * Список инвалидируется один раз в конце, иначе сетка перерисовывалась бы на каждом ответе.
 */
export function useDeleteManyMedia() {
  const queryClient = useQueryClient();
  return useMutation<BulkDeleteResult, Error, number[]>({
    mutationFn: async (ids: number[]) => {
      const deleted: number[] = [];
      const failed: { id: number; reason: string }[] = [];
      for (const id of ids) {
        try {
          await adminService.DeleteFromBucket({ id });
          deleted.push(id);
        } catch (error) {
          failed.push({
            id,
            reason:
              error instanceof Error ? error.message : 'the bucket refused without an explanation',
          });
        }
      }
      return { deleted, failed };
    },
    retry: false,
    onSettled: () => {
      // Списки, а не `all` — по той же причине, что и у одиночного удаления выше.
      queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    },
  });
}
