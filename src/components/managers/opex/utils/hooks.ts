import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { OpexLineInsert, OpexRecurringInsert } from 'api/proto-http/admin';

// OPEX v2 (NF-08): monthly line items (each with its own currency, folded to base server-side) plus
// recurring templates a worker materialises into monthly lines. Months are stored on the 1st
// (YYYY-MM-01); the UI works in YYYY-MM and appends -01 at the boundary.
export const opexKeys = {
  all: ['opex'] as const,
  lines: (month: string) => [...opexKeys.all, 'lines', month] as const,
  linesRange: (from: string, to: string) => [...opexKeys.all, 'linesRange', from, to] as const,
  recurring: (includeArchived: boolean) => [...opexKeys.all, 'recurring', includeArchived] as const,
};

export const monthToApi = (month: string) => (month ? `${month}-01` : '');

/**
 * Every OPEX read is costing-gated server-side and returns PermissionDenied (HTTP 403) without
 * `costing:read` — it is NOT shaped into an empty success. requestHandler puts the HTTP status on
 * the thrown Error, so callers can tell "you may not read this" apart from a transient failure and
 * render a no-access state instead of a retry button that can never succeed.
 */
export function isPermissionDenied(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 403;
}

export function useOpexLines(month: string, enabled = true) {
  const monthKey = monthToApi(month);
  return useQuery({
    queryKey: opexKeys.lines(month),
    queryFn: () =>
      adminService.ListOpexLines({ monthFrom: monthKey, monthTo: monthKey, category: '' }),
    enabled: enabled && !!month,
    // retry:false so a 403 surfaces immediately as query.error rather than being retried like a
    // transient failure (see isPermissionDenied).
    retry: false,
  });
}

// opxMonth v2 / opxNav v3: one query fetches a whole span of months (ListOpexLines already takes a
// month RANGE), so the rail's per-month counts, the 12-month strip's per-month totals and the
// selected month's lines all come from a single request grouped client-side — there is no per-month
// aggregate RPC to lean on. Inclusive months, YYYY-MM.
export function useOpexLinesRange(monthFrom: string, monthTo: string, enabled = true) {
  return useQuery({
    queryKey: opexKeys.linesRange(monthFrom, monthTo),
    queryFn: () =>
      adminService.ListOpexLines({
        monthFrom: monthToApi(monthFrom),
        monthTo: monthToApi(monthTo),
        category: '',
      }),
    enabled: enabled && !!monthFrom && !!monthTo,
    retry: false,
  });
}

export function useUpsertOpexLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lines: OpexLineInsert[]) => adminService.UpsertOpexLines({ lines }),
    onSuccess: () => qc.invalidateQueries({ queryKey: opexKeys.all }),
  });
}

export function useDeleteOpexLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteOpexLine({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: opexKeys.all }),
  });
}

// `enabled` exists so the page can keep this read off the wire entirely for a viewer without
// costing:read — ListOpexRecurring denies them outright, and a query that can only ever 403 has
// nothing to show and no retry worth offering.
export function useOpexRecurring(includeArchived: boolean, enabled = true) {
  return useQuery({
    queryKey: opexKeys.recurring(includeArchived),
    queryFn: () => adminService.ListOpexRecurring({ includeArchived }),
    enabled,
    retry: false,
  });
}

export function useUpsertOpexRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, recurring }: { id: number; recurring: OpexRecurringInsert }) =>
      adminService.UpsertOpexRecurring({ id, recurring }),
    onSuccess: () => qc.invalidateQueries({ queryKey: opexKeys.all }),
  });
}

export function useArchiveOpexRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.ArchiveOpexRecurring({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: opexKeys.all }),
  });
}

// Manual costing FX rates — the same rates the backend folds OPEX amounts to base with. The wizard
// reads them only to preview the base-currency value and warn when a chosen currency has no rate
// (the line would be booked "uncosted"). Cached broadly; only fetched while a form needs it.
//
// CAVEAT: GetCostingFxRates is mapped to TECH-CARDS read on the backend (internal/rbac/rbac.go),
// not to costing/analytics — so an operator with costing but no tech-cards section gets
// PermissionDenied here even though the server folds their OPEX lines perfectly well on save. An
// empty `rates` from a denied read is therefore NOT evidence that a currency has no rate; callers
// must branch on `isError` before claiming a line will be booked UNCOSTED. retry:false keeps that
// distinction cheap to make.
export function useCostingFxRates(enabled = true) {
  return useQuery({
    queryKey: ['costingFxRates'],
    queryFn: () => adminService.GetCostingFxRates({}),
    enabled,
    retry: false,
  });
}
