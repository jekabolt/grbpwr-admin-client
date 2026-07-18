import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_PromoCodeInsert } from 'api/proto-http/admin';

const ITEMS_PER_PAGE = 50;

export const promoKeys = {
  all: ['promo'] as const,
  lists: () => [...promoKeys.all, 'list'] as const,
};

// H5: the backend has no "check code exists" lookup, so a generate/uniqueness
// check needs the full code set client-side. A promo list is small (like the
// archive code->id lookup elsewhere), so one generous page covers it; this is a
// proactive early warning, not the sole guard — AddPromo still enforces real
// uniqueness authoritatively (see usePromo.ts's submitCreate error handling).
const CODE_UNIQUENESS_LOOKUP_LIMIT = 1000;

export function useExistingPromoCodes() {
  return useQuery({
    queryKey: [...promoKeys.all, 'allCodes'],
    queryFn: async () => {
      const response = await adminService.ListPromos({
        limit: CODE_UNIQUENESS_LOOKUP_LIMIT,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
      });
      return new Set(
        (response.promoCodes || [])
          .map((p) => p.promoCodeInsert?.code?.trim().toUpperCase())
          .filter((c): c is string => !!c),
      );
    },
    staleTime: 60 * 1000,
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

// H2/H8: re-enabling a disabled code, and editing any other field of an existing
// one (discount/dates/flags), both go through the atomic UpdatePromoCode RPC —
// the row is looked up by promo.code and its id/usage/creation data are preserved
// (no more delete+recreate workaround, and no partial-failure window where the
// row could be dropped and not restored).
export function useUpdatePromo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (promo: common_PromoCodeInsert) => adminService.UpdatePromoCode({ promo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promoKeys.all });
    },
  });
}
