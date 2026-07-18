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

// Minimal inline colourway creation (§35): normally a colourway (product) is created from the
// product manager, which forces a ping-pong away from the tech card just to add a colour before
// its recipe can be edited. This spins up a bare DRAFT — colour identity only, everything else
// (media/prices/tags/translations) is filled in later from the product manager — so the recipe
// editor list below refreshes with the new colourway immediately. Field shape mirrors
// buildColorwayWrite (product/components/utils): every CreateColorwayRequest key must be present
// (even if undefined) to satisfy the generated type; colorCode is the sole required value.
export function useCreateColorway(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (colorCode: string) =>
      adminService.CreateColorway({
        styleId: techCardId,
        merchandising: {
          preorder: '0001-01-01T00:00:00Z',
          colorHexOverride: undefined,
          salePercentage: undefined,
          minTier: 0,
          colorCode,
          dictionaryColor: undefined,
          countryCode: undefined,
        },
        development: undefined,
        thumbnailMediaId: undefined,
        secondaryThumbnailMediaId: undefined,
        mediaIds: undefined,
        tags: undefined,
        prices: undefined,
        translations: undefined,
        costPrice: undefined,
        countryCode: undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
  });
}

export function createColorwayErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 400 || status === 409)
    return 'Could not create the colourway — it may already exist for this colour.';
  return e instanceof Error ? e.message : 'Failed to create colourway';
}
