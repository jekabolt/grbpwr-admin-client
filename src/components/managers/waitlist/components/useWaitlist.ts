import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';

// The storefront writes ProductWaitlist rows on "notify me" (back-in-stock signup); this is the
// admin-side read of that queue. The server masks email (f***@domain) and blanks names for
// accounts without orders:read — rendered verbatim here, no client-side masking.
export const waitlistKeys = {
  all: ['product-waitlist'] as const,
  list: (productId: number | undefined, limit: number, offset: number) =>
    [...waitlistKeys.all, 'list', productId ?? 0, limit, offset] as const,
};

export function useProductWaitlist(productId: number | undefined, limit: number, offset: number) {
  return useQuery({
    queryKey: waitlistKeys.list(productId, limit, offset),
    queryFn: () =>
      adminService.ListProductWaitlist({
        productId: productId || undefined,
        limit,
        offset,
      }),
    staleTime: 30_000,
  });
}
