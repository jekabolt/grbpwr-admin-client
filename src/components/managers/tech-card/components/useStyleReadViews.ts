import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';

// Read-only style projections — no mutations, so no cache invalidation is needed. Each is keyed
// off the tech card and, for the cost estimate, the colourway being priced.
const styleReadViewKeys = {
  costEstimate: (techCardId: number, colorwayId: number) =>
    ['styleCostEstimate', techCardId, colorwayId] as const,
  cutList: (techCardId: number) => ['styleCutList', techCardId] as const,
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

// GetStyleCutList (Q6) expands a style's cut-pieces for production (mirrored pieces folded ×2
// into total_per_garment). A plain read projection — NOT costing-gated.
export function useStyleCutList(techCardId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: styleReadViewKeys.cutList(techCardId ?? 0),
    queryFn: () => adminService.GetStyleCutList({ techCardId: techCardId ?? 0 }),
    enabled: enabled && !!techCardId,
  });
}
