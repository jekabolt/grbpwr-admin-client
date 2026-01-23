import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';

const ITEMS_PER_PAGE = 16;

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

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteFromBucket({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
    onError: (error) => {
      console.error('Failed to delete media:', error);
    },
  });
}
