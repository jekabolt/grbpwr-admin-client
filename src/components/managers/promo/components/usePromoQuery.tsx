import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';

const ITEMS_PER_PAGE = 50;

export const promoKeys = {
  all: ['promo'] as const,
  lists: () => [...promoKeys.all, 'list'] as const,
  list: (filters: { limit: number; offset: number }) => [...promoKeys.lists(), filters] as const,
};

export function usePromo(limit: number = ITEMS_PER_PAGE, offset: number = 0) {
  return useQuery({
    queryKey: promoKeys.list({ limit, offset }),
    queryFn: async () => {
      const response = await adminService.ListPromos({
        limit,
        offset,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return response.promoCodes || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useInfinitePromo(limit: number = ITEMS_PER_PAGE) {
  return useInfiniteQuery({
    queryKey: promoKeys.lists(),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.ListPromos({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return {
        promoCodes: response.promoCodes || [],
        nextOffset: response.promoCodes?.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeletePromo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => adminService.DeletePromoCode({ code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promoKeys.all });
    },
  });
}

export function useDisablePromo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => adminService.DisablePromoCode({ code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promoKeys.all });
    },
  });
}

export function useAddPromo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (promo: Parameters<typeof adminService.AddPromo>[0]['promo']) =>
      adminService.AddPromo({ promo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promoKeys.all });
    },
  });
}
