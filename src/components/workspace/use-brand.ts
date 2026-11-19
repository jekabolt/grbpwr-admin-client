import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, authService } from 'api/api';
import type { TeamBrand } from 'api/proto-http/admin';
import { accountsKeys } from 'components/managers/accounts/utils/hooks';

// The brand block's one save (W-spec §4): the logo first, only when it changed, then the brand
// text. The answer is re-read through GetCurrentAccount, so every paper sees the new brand.

export interface BrandValues {
  brandName: string;
  contactEmail: string;
  website: string;
  legalEntity: string;
  street: string;
  city: string;
  country: string;
}

/** `keep` = the logo is untouched; `set` = a new picture (base64); `remove` = no logo. */
export type LogoChange = { kind: 'keep' } | { kind: 'set'; base64: string } | { kind: 'remove' };

export const EMPTY_BRAND: BrandValues = {
  brandName: '',
  contactEmail: '',
  website: '',
  legalEntity: '',
  street: '',
  city: '',
  country: '',
};

export function brandValues(b: TeamBrand | null | undefined): BrandValues {
  if (!b) return EMPTY_BRAND;
  const [street = '', city = '', country = ''] = b.legalAddress ?? [];
  return {
    brandName: b.brandName ?? '',
    contactEmail: b.contactEmail ?? '',
    website: b.website ?? '',
    legalEntity: b.legalEntity ?? '',
    street,
    city,
    country,
  };
}

const trim = (s: string) => s.trim();

/** The field a refusal key points at (server keys `bad_email` / `bad_website` / `bad_text` / `bad_address`). */
export function refusedField(e: unknown): keyof BrandValues | 'logo' | null {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (msg.includes('bad_logo')) return 'logo';
  if (msg.includes('bad_email')) return 'contactEmail';
  if (msg.includes('bad_website')) return 'website';
  if (msg.includes('bad_address')) return 'street';
  if (msg.includes('bad_text')) return 'brandName';
  return null;
}

export function useSaveBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { values: BrandValues; logo: LogoChange }) => {
      if (v.logo.kind !== 'keep')
        await authService.SetTeamLogo({ logo: v.logo.kind === 'set' ? v.logo.base64 : '' });
      const b = v.values;
      return adminService.SetTeamBrand({
        brandName: trim(b.brandName),
        contactEmail: trim(b.contactEmail),
        website: trim(b.website),
        legalEntity: trim(b.legalEntity),
        legalAddress: [b.street, b.city, b.country].map(trim),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: accountsKeys.current() }),
  });
}
