import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ListMediaFacetsResponse, MediaUsage, common_MediaFull } from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useMemo, useState } from 'react';
import { type ScrubMonth } from 'ui';
import { MediaUsageMap } from './media-usage';

const ITEMS_PER_PAGE = 50;

export const mediaKeys = {
  all: ['media'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (filters: { limit: number; offset: number }) => [...mediaKeys.lists(), filters] as const,
  // Under `lists`: every list invalidation (upload, delete, recrop) re-counts the months too,
  // otherwise the scrubber's offsets would index a list that has moved.
  months: () => [...mediaKeys.lists(), 'months'] as const,
  // Under `lists` for the same reason: an upload or a delete changes the library's counts.
  facets: () => [...mediaKeys.lists(), 'facets'] as const,
  usage: (bucket: number) => [...mediaKeys.all, 'usage', bucket] as const,
};

/** One library page by offset. `useMedia`, the window and the deep walk all share this key. */
function mediaPageQuery(limit: number, offset: number) {
  return {
    queryKey: mediaKeys.list({ limit, offset }),
    queryFn: async () => {
      const response = await adminService.ListObjectsPaged({
        limit,
        offset,
        orderFactor: 'ORDER_FACTOR_DESC' as const,
      });
      return response.list || [];
    },
    staleTime: 5 * 60 * 1000,
  };
}

export function useMedia(limit: number = ITEMS_PER_PAGE, offset: number = 0) {
  return useQuery(mediaPageQuery(limit, offset));
}

export function useInfiniteMedia(limit: number = ITEMS_PER_PAGE) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: mediaKeys.lists(),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.ListObjectsPaged({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      // Seed the per-offset page: the phone grid (`useMediaWindow`) reads the same page by that
      // key and does not ask for it again.
      queryClient.setQueryData(mediaKeys.list({ limit, offset: pageParam }), response.list || []);
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

/** Library size per calendar month (UTC), newest first: the date scrubber's index. */
export function useMediaMonths(enabled = true) {
  return useQuery({
    queryKey: mediaKeys.months(),
    queryFn: async (): Promise<ScrubMonth[]> => {
      const response = await adminService.ListMediaMonths({});
      return (response.months ?? [])
        .map((m) => ({ year: m.year ?? 0, month: m.month ?? 0, count: m.count ?? 0 }))
        .filter((m) => m.year > 0 && m.month >= 1 && m.month <= 12);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Счётчики ВСЕЙ библиотеки одним маленьким кубом (тип × размер × занятость), а не по
 * подгруженным страницам: рельс знает настоящие числа до первой прокрутки. Дёшево — строк столько,
 * сколько разных размеров, поэтому спрашивается и страницей, и каждым пикером.
 *
 * Провал не держит экран: `useFilter` без ответа считает по загруженному, как раньше, поэтому
 * повтор один — ждать три ретрая ради цифр, которые и так уже стоят, незачем.
 */
export function useMediaFacets(enabled = true) {
  return useQuery({
    queryKey: mediaKeys.facets(),
    queryFn: (): Promise<ListMediaFacetsResponse> => adminService.ListMediaFacets({}),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Item range the grid shows, inclusive. */
export type MediaRange = { start: number; end: number };

export type MediaWindow = {
  /** The item at this list offset, or undefined while its page is not here. */
  itemAt: (index: number) => common_MediaFull | undefined;
  /** Every page fetched so far, newest first and deduplicated; pages may have gaps between them. */
  loaded: common_MediaFull[];
  /** List offset of a loaded item. */
  indexOf: (id: number | undefined) => number | undefined;
  /**
   * The unbroken run of loaded pages that holds this list offset, in list order. The viewer walks
   * this run only: stepping across a gap would skip hundreds of items without saying so.
   */
  runAround: (index: number) => common_MediaFull[];
};

/** Declared outside the hook: `useQueries` keeps the combined result only for a stable function. */
function combinePages(results: { data?: common_MediaFull[] }[]) {
  return results.map((r) => r.data);
}

/**
 * Sparse window over the library for a grid that knows the total up front (from the months).
 *
 * Fixed pages of 50 at offsets k*50, keyed exactly like `useMedia(50, offset)`, so the cache is
 * shared with every other reader. Only pages that meet `range` ± one page are fetched; a jump to
 * the oldest month asks for the two or three pages around it, not for everything in between.
 * Pages seen earlier stay subscribed (not fetched) so the viewer and usage keep their items.
 */
export function useMediaWindow(
  total: number,
  range: MediaRange | null,
  enabled = true,
): MediaWindow {
  const size = ITEMS_PER_PAGE;
  const last = Math.ceil(total / size) - 1;
  const from = range ? Math.max(0, Math.floor((range.start - size) / size)) : 0;
  const to = range && enabled ? Math.min(last, Math.floor((range.end + size) / size)) : -1;

  const [seen, setSeen] = useState<number[]>([]);
  let grown = seen;
  for (let p = from; p <= to; p++) if (!grown.includes(p)) grown = [...grown, p];
  if (grown !== seen) setSeen([...grown].sort((a, b) => a - b));

  const pagesOn = seen.filter((p) => p <= last);
  const pages = useQueries({
    queries: pagesOn.map((p) => ({
      ...mediaPageQuery(size, p * size),
      enabled: enabled && p >= from && p <= to,
    })),
    combine: combinePages,
  });

  const pagesKey = pagesOn.join(',');
  return useMemo(() => {
    const byPage = new Map<number, common_MediaFull[]>();
    pagesKey
      .split(',')
      .filter(Boolean)
      .forEach((p, i) => {
        const data = pages[i];
        if (data) byPage.set(Number(p), data);
      });
    // A delete or an upload shifts every later page by one, and a page not yet refetched can
    // repeat an item of its neighbour: every id holds one slot, the first one (newest page wins).
    const slots = new Map<number, common_MediaFull>();
    const indexById = new Map<number, number>();
    const loaded: common_MediaFull[] = [];
    for (const p of [...byPage.keys()].sort((a, b) => a - b)) {
      (byPage.get(p) ?? []).forEach((m, i) => {
        if (m.id == null || indexById.has(m.id)) return;
        const at = p * size + i;
        slots.set(at, m);
        indexById.set(m.id, at);
        loaded.push(m);
      });
    }
    const runAround = (index: number) => {
      const p0 = Math.floor(index / size);
      if (!byPage.has(p0)) return [];
      let lo = p0;
      while (byPage.has(lo - 1)) lo--;
      let hi = p0;
      // A short page is the last one: nothing after it belongs to the same run.
      while (byPage.has(hi + 1) && (byPage.get(hi)?.length ?? 0) === size) hi++;
      const run: common_MediaFull[] = [];
      for (let at = lo * size; at < (hi + 1) * size; at++) {
        const m = slots.get(at);
        if (m) run.push(m);
      }
      return run;
    };
    return {
      itemAt: (index: number) => slots.get(index),
      loaded,
      indexOf: (id: number | undefined) => (id == null ? undefined : indexById.get(id)),
      runAround,
    };
  }, [pagesKey, pages, size]);
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

/** Library window `useMediaMap` / `useResolvedMedia` read first (the newest N items). */
export const MEDIA_WINDOW = 500;
/** Deep pages walked past the window for ids it misses: 20 × 500 = the 10 000 newest items. */
const DEEP_MAX_PAGES = 20;

/** Same request + cache key as `useMedia(limit, offset)`, so a walked page is shared with it. */
const libraryPageQuery = (offset: number) => mediaPageQuery(MEDIA_WINDOW, offset);

const EMPTY_KNOWN: ReadonlyMap<number, common_MediaFull> = new Map();

/**
 * id → MediaFull for EVERY id asked for, not only the newest 500 (live bug 06.10: card 38's
 * August references, ids 124–126, fell out of the `useMediaMap` window once beta passed id 722 and
 * drew «media #N not resolved»).
 *
 * Layers: the library window (one cached request, shared with `useMediaMap`) → for the ids that
 * neither the window nor `known` resolves, the library pages PAST the window are walked
 * (offset 500, 1000, …; each page cached under the same key as `useMedia`) until every missing id
 * is found, a short page says the library ended, or the cap is hit. There is no by-ids media RPC
 * (`GetMediaUsage` answers refs, not files), so paging is the by-id path.
 *
 * `known` — what the caller already resolves itself (the card's `resolved*Media`, band pictures,
 * picks of this session): those ids are NOT fetched. The returned map holds the library window
 * plus the deep finds; the caller still layers `known` over it as before.
 *
 * Nothing walks while the window is loading, and nothing walks when the window came back short
 * (the whole library is in it — a missing id was deleted).
 */
export function useResolvedMediaQuery(
  ids: Iterable<number | null | undefined>,
  known: ReadonlyMap<number, unknown> = EMPTY_KNOWN,
): { byId: ReadonlyMap<number, common_MediaFull>; isPending: boolean; isError: boolean } {
  const queryClient = useQueryClient();
  const head = useMedia(MEDIA_WINDOW, 0);
  const library = useMediaMap(MEDIA_WINDOW);
  const windowFull = (head.data?.length ?? 0) >= MEDIA_WINDOW;

  const missing: number[] = [];
  if (head.isSuccess && windowFull) {
    const seen = new Set<number>();
    for (const raw of ids) {
      const id = Number(raw ?? 0);
      if (!(id > 0) || seen.has(id)) continue;
      seen.add(id);
      if (!library.has(id) && !known.has(id)) missing.push(id);
    }
    missing.sort((a, b) => a - b);
  }
  const missingKey = missing.join(',');

  const deep = useQuery({
    queryKey: [...mediaKeys.all, 'byIds', missingKey] as const,
    queryFn: async () => {
      const want = new Set(missingKey.split(',').map(Number));
      const found: common_MediaFull[] = [];
      for (let page = 1; page <= DEEP_MAX_PAGES && want.size > 0; page++) {
        const list = await queryClient.fetchQuery(libraryPageQuery(page * MEDIA_WINDOW));
        for (const item of list) {
          if (item?.id != null && want.has(item.id)) {
            found.push(item);
            want.delete(item.id);
          }
        }
        if (list.length < MEDIA_WINDOW) break;
      }
      return found;
    },
    enabled: missingKey !== '',
    staleTime: 5 * 60 * 1000,
    // A new missing id changes the key: keep the earlier finds on screen while the walk reruns.
    placeholderData: (prev) => prev,
  });

  const byId = useMemo(() => {
    if (!deep.data?.length) return library;
    const m = new Map(library);
    for (const item of deep.data) if (item.id != null && !m.has(item.id)) m.set(item.id, item);
    return m;
  }, [library, deep.data]);

  return {
    byId,
    isPending: head.isPending || (missingKey !== '' && (deep.isPending || deep.isPlaceholderData)),
    isError: head.isError || deep.isError,
  };
}

/** `useResolvedMediaQuery(...).byId` — the drop-in for `useMediaMap()` when the ids are known. */
export function useResolvedMedia(
  ids: Iterable<number | null | undefined>,
  known?: ReadonlyMap<number, unknown>,
): ReadonlyMap<number, common_MediaFull> {
  return useResolvedMediaQuery(ids, known).byId;
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
function combineUsage(results: { data?: MediaUsage[]; isPending: boolean; isError: boolean }[]) {
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

/** File name for a saved original: the media id plus the extension its url carries. */
function originalFileName(m: common_MediaFull, url: string): string {
  const ext = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return ext ? `${m.id}.${ext.toLowerCase()}` : String(m.id);
}

export type BulkDownloadResult = { saved: number; opened: number };

/**
 * Saves the selected ORIGINALS one by one: fetch → blob → object url → anchor click.
 *
 * `fetchMediaBlob` goes through the media proxy when the CDN answers without CORS headers. If even
 * that fails, the file is opened in a new tab instead, so the person can still save it by hand;
 * the count of such files comes back so the caller can say so.
 */
export async function downloadMediaOriginals(
  items: common_MediaFull[],
): Promise<BulkDownloadResult> {
  let saved = 0;
  let opened = 0;
  for (const m of items) {
    const url = m.media?.fullSize?.mediaUrl || m.media?.thumbnail?.mediaUrl;
    if (!url) continue;
    try {
      const blob = await fetchMediaBlob(url);
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = originalFileName(m, url);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick: revoking synchronously can cancel the download in Safari.
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      saved += 1;
    } catch {
      window.open(url, '_blank', 'noopener');
      opened += 1;
    }
  }
  return { saved, opened };
}
