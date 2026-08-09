// Read-only style projections. Keys are exported so writes that change their inputs (notably a
// colourway article pin) can invalidate the exact cached projection.
//
// The single-colourway `useStyleCostEstimate` hook that used to live here is gone: the cost
// estimate is now read for every colourway at once (`useQueries` in cost-estimate-field.tsx),
// because the question people bring to that block is which colourway is dearer — which a
// one-at-a-time picker could only answer in the reader's head. That file builds its query options
// from THIS key, so the cache stays shared and the invalidation below still lands on it.
//
// GetStyleCostEstimate (Q4) is costing-gated server-side: a caller without costing:read gets
// PermissionDenied (HTTP 403). Whoever reads it must keep `retry: false`, so a 403 surfaces
// immediately as query.error instead of being retried like a transient failure.
export const styleReadViewKeys = {
  /**
   * Every colourway estimate of ONE card, as an invalidation prefix.
   *
   * This projection is derived from the card (BOM prices, usages, cost articles) but lives under
   * its own key, so a card save used to leave it untouched: the matrix went on showing the previous
   * plan next to a freshly-recomputed headline. That was survivable while the estimate was fetched
   * on demand for one hand-picked colourway; it is not, now that the whole matrix is on screen
   * whenever the tab is. `useUpdateTechCard` and `useRepriceTechCardBom` invalidate this.
   */
  costEstimates: (techCardId: number) => ['styleCostEstimate', techCardId] as const,
  costEstimate: (techCardId: number, colorwayId: number) =>
    [...styleReadViewKeys.costEstimates(techCardId), colorwayId] as const,
};

/**
 * The card's R&D ledger. Lives HERE, in the keys-only leaf module, rather than beside the component
 * that owns the query: the production-run mutations have to invalidate it, and importing a key out
 * of `dev-expenses-field.tsx` would drag a React component (and its SamplePicker, its economics
 * hook, its modal) into that module graph — a cycle waiting to happen for the sake of one array.
 *
 * `ListTechCardDevExpenses` returns more than expenses: `summary.order_qty` is Σ planned qty over
 * the card's non-cancelled production runs, and the R&D block divides «на изделие» and its coverage
 * track by it. Editing a run therefore stales a number rendered on the costing tab.
 */
export const devExpenseKeys = {
  all: ['techCardDevExpenses'] as const,
  list: (techCardId?: number) => [...devExpenseKeys.all, techCardId ?? 0] as const,
};
