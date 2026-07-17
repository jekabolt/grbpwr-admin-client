import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardColorwayUsage } from 'api/proto-http/admin';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';

// Colourway-owned recipe write (H1/§2.3): UpdateColorwayRecipe FULL-REPLACES a colourway's usages,
// keyed by bom_line_key, under the shared tech_card.lock_version. Invalidate the tech-card detail so
// the read model (colorways[].usages) refreshes. A stale expected_colorway_version → Aborted (409).
export function useUpdateColorwayRecipe(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      colorwayId,
      expectedColorwayVersion,
      usages,
    }: {
      colorwayId: number;
      expectedColorwayVersion: number;
      usages: common_TechCardColorwayUsage[];
    }) => adminService.UpdateColorwayRecipe({ colorwayId, expectedColorwayVersion, usages }),
    onSuccess: () => qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
  });
}

export function recipeSaveErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 409)
    return 'This style changed since you loaded it — reload and re-apply the recipe.';
  return e instanceof Error ? e.message : 'Failed to save recipe';
}
