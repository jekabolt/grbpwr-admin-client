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
  // НАПРАВЛЕНИЕ ТКАНИ gap report (Ф1.8). Its own branch under `all` rather than under `lists()`:
  // it is not a page of ListTechCards but a portfolio-wide read of BOM data, and it must not be
  // dropped by a list invalidation that has nothing to do with it. Declared HERE, next to the keys
  // it sits beside, so `useUpdateTechCard` below can invalidate it without importing the hooks that
  // read it — answering a направление IS a card save, and the whole point of the report is that its
  // number goes down when the operator fixes a line.
  fabricDirectionGaps: () => [...techCardKeys.all, 'fabricDirectionGaps'] as const,
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

// The SAME read for the PRINT page (Ф4): the card PLUS the response-level pattern_viewer_token,
// which the printed tech-pack encodes into its per-scope QR codes. A sibling of useTechCard
// rather than a parameter on it, deliberately: useTechCard returns only response.techCard and
// seeds the whole editing form — widening its return shape would touch every consumer of the
// editor for a field only печать reads. Nested UNDER detail(id) so every mutation that already
// invalidates the card detail invalidates this too.
export function useTechCardPrint(id: number | undefined) {
  return useQuery({
    queryKey: [...techCardKeys.detail(id!), 'print'],
    queryFn: async () => {
      const response = await adminService.GetTechCard({ id: id!, vatCountryCode: undefined });
      return {
        techCard: response.techCard,
        // Empty when the backend predates the viewer or the pattern service is unwired —
        // the печать then falls back to per-sheet QR codes.
        patternViewerToken: response.patternViewerToken ?? '',
      };
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// The SAME card read again, netted at another country's VAT rate — a pricing scenario, not the
// card. Deliberately its own query key rather than a parameter on useTechCard: that read is what
// seeds the whole editing form (mapTechCardToForm), and re-keying it on a dropdown would remount
// the page and re-seed a form the operator may be halfway through editing. This one is read by the
// costing tab alone, for `costing.vat_*` and `colorways[].net_prices`, and only fires once a
// country is actually picked — the domestic figures already come with the page.
// Nested UNDER detail(id) so every mutation that invalidates the card detail invalidates it too.
export function useTechCardVatScenario(id: number | undefined, vatCountryCode: string) {
  return useQuery({
    queryKey: [...techCardKeys.detail(id ?? 0), 'vat', vatCountryCode],
    queryFn: async () => {
      const response = await adminService.GetTechCard({ id: id!, vatCountryCode });
      return response.techCard;
    },
    enabled: !!id && !!vatCountryCode,
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
      // A BOM line's направление is written by THIS mutation and by nothing else, so the gap report
      // is stale the moment a card is saved — including the counter on the tech-cards toolbar chip.
      queryClient.invalidateQueries({ queryKey: techCardKeys.fabricDirectionGaps() });
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

// Reprice (Phase 3): pull the current catalog price into every catalog-linked BOM line of a DRAFT
// card, server-side (the same CATALOG_LATEST ladder the estimate shows). Invalidates the card
// detail — the BOM prices, the costing rollup and the MATERIALS digest all just changed.
export function useRepriceTechCardBom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (techCardId: number) => adminService.RepriceTechCardBom({ techCardId }),
    onSuccess: (_data, techCardId) => {
      queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      queryClient.invalidateQueries({ queryKey: techCardKeys.lists() });
    },
  });
}

// The Phase 2 scalar→BOM migration's exception report for ONE card: hardware/packaging money the
// migration refused to move mechanically, waiting for manual transfer into the BOM. Read-only;
// empty for every card the migration handled cleanly (the overwhelmingly common case), so the
// costing tab shows nothing unless there is genuinely something to do.
export function useCostingMigrationExceptions(techCardId: number | undefined) {
  return useQuery({
    queryKey: [...techCardKeys.detail(techCardId ?? 0), 'costing-migration-exceptions'],
    queryFn: async () => {
      const response = await adminService.ListCostingMigrationExceptions({
        techCardId: techCardId!,
      });
      return response.exceptions ?? [];
    },
    enabled: !!techCardId,
    staleTime: 5 * 60 * 1000,
  });
}
