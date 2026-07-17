import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { ColorwayCustoms } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

// Product customs data (proto beefb0e) — an independent panel with its own
// Get/SetProductCustoms RPCs, separate from the main UpsertColorway form. Needed to
// build international (non-EU) shipping labels: the backend rejects an international
// label without an HS code + country of origin.

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
      adminService.GetColorwayCustoms({ productId }).then<CustomsForm>((r) => ({
        hsCode: r.customs?.hsCode ?? '',
        countryOfOrigin: r.customs?.countryOfOrigin ?? '',
        customsDescription: r.customs?.customsDescription ?? '',
      })),
    enabled: productId > 0,
    staleTime: 60_000,
  });
}

export function useSetProductCustoms(productId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (form: CustomsForm) => {
      const customs: ColorwayCustoms = {
        hsCode: form.hsCode.trim(),
        countryOfOrigin: form.countryOfOrigin.trim().toUpperCase(),
        customsDescription: form.customsDescription.trim(),
      };
      return adminService.SetColorwayCustoms({ productId, customs });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customsKey(productId) });
      showMessage('Customs data saved', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save customs', 'error'),
  });
}
