import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';

// Per-style economics drill-down (GetStyleEconomics): sales margin + dev cost + production + the
// net-after-dev figure. Costing-gated on the server. Fetched on demand (modal open).
export function useStyleEconomics(techCardId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['styleEconomics', techCardId],
    queryFn: () => adminService.GetStyleEconomics({ techCardId: techCardId! }),
    enabled: enabled && !!techCardId,
    staleTime: 2 * 60 * 1000,
  });
}
