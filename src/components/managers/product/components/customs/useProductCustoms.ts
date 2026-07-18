import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { ColorwayCustoms } from 'api/proto-http/admin';

// Colourway customs data — an independent panel with its own Get/SetColorwayCustoms RPCs, separate
// from the main colourway save. Needed to build international (non-EU) shipping labels: the backend
// rejects an international label without an HS code + country of origin.

export interface CustomsForm {
  hsCode: string;
  countryOfOrigin: string; // ISO 3166-1 alpha-2
  customsDescription: string;
}

export const emptyCustoms: CustomsForm = {
  hsCode: '',
  countryOfOrigin: '',
  customsDescription: '',
};

const customsKey = (productId: number) => ['product-customs', productId] as const;

export function useProductCustoms(productId: number) {
  return useQuery({
    queryKey: customsKey(productId),
    queryFn: () =>
      adminService.GetColorwayCustoms({ colorwayId: productId }).then<CustomsForm>((r) => ({
        hsCode: r.customs?.hsCode ?? '',
        countryOfOrigin: r.customs?.countryOfOrigin ?? '',
        customsDescription: r.customs?.customsDescription ?? '',
      })),
    enabled: productId > 0,
    staleTime: 60_000,
  });
}

// Toast-free on purpose: this mutation is driven from two call sites with different feedback — the
// standalone "save customs" button (its own success/error toast) and the main colourway Save, which
// flushes a dirty customs block and reports a *non-fatal* failure so it can't revert the save. Each
// caller owns its message; cache invalidation stays here because it is always correct.
export function useSetProductCustoms(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: CustomsForm) => {
      const customs: ColorwayCustoms = {
        hsCode: form.hsCode.trim(),
        countryOfOrigin: form.countryOfOrigin.trim().toUpperCase(),
        customsDescription: form.customsDescription.trim(),
      };
      return adminService.SetColorwayCustoms({ colorwayId: productId, customs });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customsKey(productId) });
    },
  });
}
