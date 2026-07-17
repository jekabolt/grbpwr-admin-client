import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_GenderEnum,
  common_TechCardInsert,
  common_TechCardStage,
} from 'api/proto-http/admin';

export type TechCardFilter = {
  stage?: common_TechCardStage;
  gender?: common_GenderEnum;
  brand?: string;
  season?: string;
  name?: string;
  productId?: number;
};

export const techCardKeys = {
  all: ['techCards'] as const,
  lists: () => [...techCardKeys.all, 'list'] as const,
  list: (filter: TechCardFilter) => [...techCardKeys.lists(), filter] as const,
  details: () => [...techCardKeys.all, 'detail'] as const,
  detail: (id: number) => [...techCardKeys.details(), id] as const,
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
        purpose: undefined,
        skuSeason: undefined,
        productId: filter.productId ?? 0,
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

export function useTechCard(id: number | undefined) {
  return useQuery({
    queryKey: techCardKeys.detail(id!),
    queryFn: async () => {
      const response = await adminService.GetTechCard({ id: id! });
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
