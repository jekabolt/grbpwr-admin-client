import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';

// Manual costing FX rates (GetCostingFxRates): base(EUR)-per-unit of each currency, the same rates
// the backend uses to fold multi-currency tech-card costing into base. Reused here to express a
// non-EUR selling price in the base currency for per-currency margin. Costing-gated on the server
// (returns empty without costing:read), so only fetch when the caller can read costing.
export function useCostingFxRates(enabled: boolean) {
  return useQuery({
    queryKey: ['costingFxRates'],
    queryFn: () => adminService.GetCostingFxRates({}),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}
