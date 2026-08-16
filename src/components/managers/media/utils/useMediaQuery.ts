import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { common_MediaFull } from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { useMemo } from 'react';

const ITEMS_PER_PAGE = 50;

export const mediaKeys = {
  all: ['media'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (filters: { limit: number; offset: number }) => [...mediaKeys.lists(), filters] as const,
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

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteFromBucket({ id }),
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
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
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}
