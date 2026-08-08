import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';

// Read-only style projections. Keys are exported so writes that change their inputs (notably a
// colourway article pin) can invalidate the exact cached projection.
export const styleReadViewKeys = {
  costEstimate: (techCardId: number, colorwayId: number) =>
    ['styleCostEstimate', techCardId, colorwayId] as const,
};

// GetStyleCostEstimate (Q4) — the transparent plan cost of one colourway — is costing-gated
// server-side: a caller without costing:read gets PermissionDenied (HTTP 403). retry:false so a
// 403 surfaces immediately as query.error instead of being retried like a transient failure; the
// component reads error.status === 403 to render the "no access" note.
export function useStyleCostEstimate(
  techCardId: number | undefined,
  colorwayId: number | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: styleReadViewKeys.costEstimate(techCardId ?? 0, colorwayId ?? 0),
    queryFn: () =>
      adminService.GetStyleCostEstimate({
        techCardId: techCardId ?? 0,
        colorwayId: colorwayId ?? 0,
      }),
    enabled: enabled && !!techCardId && !!colorwayId,
    retry: false,
  });
}
