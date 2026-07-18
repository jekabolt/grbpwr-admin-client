import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_PromoCodeInsert } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

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

// H2/H8: the backend exposes no EnablePromoCode or UpdatePromoCode RPC — promo
// codes are otherwise append-only (AddPromo) plus one-way (DisablePromoCode).
// Re-enabling a disabled code, or editing any other field of an existing one
// (discount/dates/flags), is implemented here as a frontend-only delete + recreate
// under the same code. This is a real workaround, not a real update: it briefly
// deletes the row (a failure between the two calls loses the code — mutation
// errors surface to the caller so the operator can retry/recreate by hand), and
// resets anything the backend keys off row identity/creation time. A proper fix
// needs a real EnablePromoCode/UpdatePromoCode RPC.
export function useUpdatePromo() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: async ({
      originalCode,
      promo,
    }: {
      originalCode: string;
      promo: common_PromoCodeInsert;
    }) => {
      await adminService.DeletePromoCode({ code: originalCode });
      try {
        return await adminService.AddPromo({ promo });
      } catch (e) {
        // DeletePromoCode above already succeeded by this point (it didn't throw), so the
        // original row is gone even though this mutation is about to report failure. Tag the
        // error so onError can tell the operator the code was actually removed, instead of a
        // generic "update failed" that implies the original code is still intact.
        const err = e instanceof Error ? e : new Error('Failed to recreate promo code');
        (err as Error & { promoDeleted?: boolean }).promoDeleted = true;
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promoKeys.all });
    },
    onError: (error, { originalCode }) => {
      // The delete half of this workaround can succeed even when the overall mutation fails (see
      // mutationFn above). Invalidate unconditionally so the table never keeps showing a code
      // that's actually already been deleted server-side.
      queryClient.invalidateQueries({ queryKey: promoKeys.all });
      const reason = error instanceof Error ? error.message : 'Unknown error';
      const promoDeleted =
        error instanceof Error && (error as Error & { promoDeleted?: boolean }).promoDeleted;
      showMessage(
        promoDeleted
          ? `"${originalCode}" was removed during the update but could not be recreated (${reason}). It no longer exists — create it again.`
          : reason,
        'error',
      );
    },
  });
}
