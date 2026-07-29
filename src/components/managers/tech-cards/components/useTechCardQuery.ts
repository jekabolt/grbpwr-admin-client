import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_GenderEnum,
  common_SkuSeason,
  common_TechCardInsert,
  common_TechCardStage,
} from 'api/proto-http/admin';

export type TechCardFilter = {
  stage?: common_TechCardStage;
  gender?: common_GenderEnum;
  brand?: string;
  skuSeason?: common_SkuSeason;
  name?: string;
  productId?: number;
  purpose?: string;
  // One id is enough at whatever level of the tree the operator picked: the server matches a card
  // whose category_id OR top/sub/type equals any of these, so the client never expands the tree.
  categoryIds?: number[];
};

export const techCardKeys = {
  all: ['techCards'] as const,
  lists: () => [...techCardKeys.all, 'list'] as const,
  list: (filter: TechCardFilter) => [...techCardKeys.lists(), filter] as const,
  details: () => [...techCardKeys.all, 'detail'] as const,
  detail: (id: number) => [...techCardKeys.details(), id] as const,
  // Nested UNDER detail(id) so it is invalidated by every mutation that already invalidates the card
  // detail (UpdateTechCard, the colourway recipes, the fitting resolvers…). The checklist is scored
  // against the card's own saved facts, so "the card changed" is exactly when it must be refetched —
  // there is no separate invalidation to remember to add.
  readiness: (id: number) => [...techCardKeys.detail(id), 'readiness'] as const,
  pipeline: () => [...techCardKeys.all, 'pipeline'] as const,
};

// Infinite list, optionally filtered. ListTechCards returns `total` (matching count
// ignoring pagination), so we page by offset until reached.
export function useInfiniteTechCards(filter: TechCardFilter = {}, limit: number = 30) {
  return useInfiniteQuery({
    queryKey: [...techCardKeys.list(filter), 'infinite', limit],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.ListTechCards({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
        stage: filter.stage ?? 'TECH_CARD_STAGE_UNKNOWN',
        gender: filter.gender ?? 'GENDER_ENUM_UNKNOWN',
        brand: filter.brand ?? '',
        name: filter.name ?? '',
        purpose: filter.purpose,
        skuSeason: filter.skuSeason,
        productId: filter.productId ?? 0,
        categoryIds: filter.categoryIds,
      });
      const techCards = response.techCards || [];
      const total = response.total ?? 0;
      return {
        techCards,
        total,
        nextOffset: pageParam + limit < total ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}

// Development board (GetStylePipeline, gap-01): per-stage counts + a few light preview cards per
// column, in one call instead of six ListTechCards. cardsPerStage caps the preview list per stage.
export function useStylePipeline(cardsPerStage = 6) {
  return useQuery({
    queryKey: [...techCardKeys.pipeline(), cardsPerStage],
    queryFn: () => adminService.GetStylePipeline({ cardsPerStage }),
    staleTime: 5 * 60 * 1000,
  });
}

// Stage/release checklist (GetTechCardReadiness): what the SERVER says is still missing before this
// style can advance a stage or be released, evaluated against the saved card.
// ADVISORY — it reports, it does not authorise. Stage and approval_state stay free-standing fields
// on UpdateTechCard, so nothing read from here may disable a control or refuse a save.
export function useTechCardReadiness(techCardId: number | undefined) {
  return useQuery({
    queryKey: techCardKeys.readiness(techCardId!),
    queryFn: () => adminService.GetTechCardReadiness({ techCardId: techCardId! }),
    enabled: !!techCardId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTechCard(id: number | undefined) {
  return useQuery({
    queryKey: techCardKeys.detail(id!),
    queryFn: async () => {
      // No vat_country_code: the margin numbers are wanted at the company's domestic rate.
      const response = await adminService.GetTechCard({ id: id!, vatCountryCode: undefined });
      return response.techCard;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// Fittings anchored to this tech card (ListFittings filtered by tech_card_id). Used for
// the read-only "fittings" block and the POM actuals fitting picker.
export function useTechCardFittings(techCardId?: number) {
  return useQuery({
    queryKey: [...techCardKeys.detail(techCardId ?? 0), 'fittings'],
    queryFn: async () => {
      const response = await adminService.ListFittings({
        limit: 100,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
        productId: 0,
        modelId: 0,
        techCardId: techCardId ?? 0,
      });
      return response.fittings || [];
    },
    enabled: !!techCardId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTechCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (techCard: common_TechCardInsert) => adminService.CreateTechCard({ techCard }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: techCardKeys.lists() });
      // The pipeline board is a separate key — a create/stage-change/delete must move the
      // card between columns, not leave it parked for the 5-min staleTime.
      queryClient.invalidateQueries({ queryKey: techCardKeys.pipeline() });
    },
  });
}

export function useUpdateTechCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      techCard,
      expectedLockVersion,
    }: {
      id: number;
      techCard: common_TechCardInsert;
      expectedLockVersion: number;
    }) => adminService.UpdateTechCard({ id, techCard, expectedLockVersion }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: techCardKeys.lists() });
      queryClient.invalidateQueries({ queryKey: techCardKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: techCardKeys.pipeline() });
    },
  });
}

export function useDeleteTechCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteTechCard({ id }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: techCardKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: techCardKeys.lists() });
      queryClient.invalidateQueries({ queryKey: techCardKeys.pipeline() });
    },
  });
}
