import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_GenderEnum,
  common_SkuSeason,
  common_TechCardInsert,
  common_TechCardStage,
} from 'api/proto-http/admin';
import { styleReadViewKeys } from 'components/managers/tech-card/components/useStyleReadViews';

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
        collection: undefined,
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

// CONSTRUCTION AUDIT (GetTechCardConstructionAudit) — the machine layer's report on the SAVED
// card: deterministic checks over the stored assembly, plus the list of what the run did NOT
// verify. Read-only and advisory, like useTechCardReadiness: nothing here disables a control or
// refuses a save.
//
// Nested UNDER detail(id), for the same reason `readiness` is, and it is the whole wiring: the
// audit is scored against the card's own saved facts, so «the card changed» is exactly when it
// must be re-run. Every mutation that already invalidates the card detail (UpdateTechCard, the
// colourway recipes, the reprice…) therefore re-audits for free — there is no separate
// invalidation to remember to add to the save handler, and no way for one to be forgotten.
// `active` is NOT a convenience flag — without it this fires on EVERY tech-card open. The card
// page mounts all of its tabs at once, so a component that queries on mount queries for readers who
// never go near CONSTRUCTION. The audit is not free on the server: it loads the whole card and runs
// every check over it. `usePieceShapes(active)` in construction-tab.tsx is gated for exactly this
// reason and is the precedent followed here.
//
// Nested UNDER detail(id) deliberately: every mutation that already invalidates the card detail
// invalidates this too, which is how "re-audit after each successful save" happens with no wiring
// into the save handler at all.
export function useTechCardConstructionAudit(techCardId: number | undefined, active: boolean) {
  return useQuery({
    queryKey: [...techCardKeys.detail(techCardId!), 'construction-audit'],
    queryFn: () => adminService.GetTechCardConstructionAudit({ techCardId: techCardId! }),
    enabled: !!techCardId && active,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── THE MODEL LAYER (AnalyzeTechCardConstruction) ─────────────────────────────────────────────
//
// A MUTATION, NOT A QUERY, and that is the whole shape of the feature. It is never fired on mount,
// never refetched, never cached and never retried: one press, one call, one paid run. React Query's
// `useQuery` would do the opposite of every one of those on its own.

/**
 * THE CLIENT'S BUDGET FOR ONE RUN — 55 s, and the number is derived, not chosen for looking round.
 *
 * The server holds its OpenRouter HTTP client at `defaultTimeout = 60 * time.Second`
 * (`internal/openrouter/openrouter.go`), and beta's DO spec sets neither `OPENROUTER_HTTP_TIMEOUT`
 * nor any other override — so 60 s is the real server ceiling, verified 2026-08-24, not assumed.
 *
 * THE CLIENT MUST GIVE UP FIRST. If this number ever exceeded the server's, the server would be the
 * one to break the run and the screen would still say «the client stopped waiting» — and «who gave
 * up» is exactly the distinction the AI-status wording is built on: `failed` is weather and offers
 * a retry, everything else is a fault and does not. Attribution that lies here turns a broken
 * deployment into «try again», forever. Five seconds is the margin for the answer's trip back.
 *
 * SO: RE-DERIVE THIS IF THE SERVER BUDGET MOVES. Should the server ceiling ever drop below ~70 s,
 * 55 s stops being «below it» in any meaningful margin and this constant has to come down with it.
 */
export const ANALYZE_CLIENT_BUDGET_MS = 55_000;

/**
 * The message a client-budget abort rejects with. A distinct string rather than an `AbortError`
 * check: the transport below never sees the signal (see the note in the hook), so this is the only
 * honest marker of «WE stopped waiting», and the panel words that case differently from a server
 * fault it is not entitled to blame.
 */
export const ANALYZE_ABORTED_BY_CLIENT = 'analysis-aborted-by-client-budget';

export function useAnalyzeTechCardConstruction() {
  return useMutation({
    mutationFn: async (techCardId: number) => {
      // AN `AbortController`, WHOSE SIGNAL THE TRANSPORT DOES NOT RECEIVE — said out loud because
      // the difference matters. The generated client calls `requestHandler({path, method, body})`
      // and there is no channel on that signature to hand a signal down to `fetch`, so the socket
      // is NOT torn down at 55 s: the in-flight request runs to the server's own ceiling and the
      // money for that run is spent either way (it was spent the moment the model was called).
      // What the budget does buy is the only thing worth buying here — the screen stops waiting at
      // a moment WE chose, and can say so truthfully instead of attributing the silence to the
      // server. Teaching the transport about signals is a change to the shared api layer for every
      // call in this admin; it belongs to that decision, not to this button.
      const control = new AbortController();
      const timer = setTimeout(() => control.abort(), ANALYZE_CLIENT_BUDGET_MS);
      try {
        return await Promise.race([
          adminService.AnalyzeTechCardConstruction({ techCardId }),
          new Promise<never>((_resolve, reject) => {
            control.signal.addEventListener(
              'abort',
              () => reject(new Error(ANALYZE_ABORTED_BY_CLIENT)),
              { once: true },
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    // NO `retry`. An automatic second attempt is a second charge for the same fault, and the two
    // faults worth retrying at all (timeout, transport) are the ones a human is told to retry by
    // hand — which is also the only way the operator learns the deployment is unhealthy.
    retry: false,
  });
}

// AddTechCardIssue — filing ONE issue straight into the card, bypassing the form.
//
// The live-card path does NOT use this: there, a filed finding is written into the RHF `issues`
// array and persisted by the ordinary save, so that one save carries both the fix and the issue it
// answers. This exists for the RELEASED card, where there is no save to ride on and where
// acceptance actually happens — see `construction-audit.tsx`.
export function useAddTechCardIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      techCardId,
      operationNumber,
      severity,
      description,
    }: {
      techCardId: number;
      operationNumber: number;
      severity: string;
      description: string;
    }) => adminService.AddTechCardIssue({ techCardId, operationNumber, severity, description }),
    onSuccess: (_data, variables) => {
      // The card detail carries the issues tab's rows, so without this the row just filed is
      // invisible on the tab it was filed to until the page is reloaded. Nested under detail(id),
      // the construction audit re-runs with it — which is correct: an issue is a card fact.
      queryClient.invalidateQueries({ queryKey: techCardKeys.detail(variables.techCardId) });
    },
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
      // The per-colourway cost estimate is derived from the BOM prices, usages and cost articles
      // this mutation just wrote, but it is cached under its OWN key — so without this the costing
      // tab showed a recomputed headline above a matrix still quoting the previous plan.
      queryClient.invalidateQueries({ queryKey: styleReadViewKeys.costEstimates(variables.id) });
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
      // Repricing rewrites BOM unit prices server-side, which is exactly the input the estimate is
      // built from — see the note on styleReadViewKeys.costEstimates.
      queryClient.invalidateQueries({ queryKey: styleReadViewKeys.costEstimates(techCardId) });
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
