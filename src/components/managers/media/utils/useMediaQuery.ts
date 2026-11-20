import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { common_MediaFull } from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useMemo } from 'react';

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

/** One library page by offset. `useMedia` and the deep walk share this key. */
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
      // Lists, not `all`: usage buckets live under `all`, and a delete does not move the others.
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
