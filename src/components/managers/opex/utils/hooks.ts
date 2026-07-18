import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { OpexLineInsert, OpexRecurringInsert } from 'api/proto-http/admin';

// OPEX v2 (NF-08): monthly line items (each with its own currency, folded to base server-side) plus
// recurring templates a worker materialises into monthly lines. Months are stored on the 1st
// (YYYY-MM-01); the UI works in YYYY-MM and appends -01 at the boundary.
export const opexKeys = {
  all: ['opex'] as const,
  lines: (month: string) => [...opexKeys.all, 'lines', month] as const,
  recurring: (includeArchived: boolean) => [...opexKeys.all, 'recurring', includeArchived] as const,
};

export const monthToApi = (month: string) => (month ? `${month}-01` : '');

export function useOpexLines(month: string, enabled = true) {
  const monthKey = monthToApi(month);
  return useQuery({
    queryKey: opexKeys.lines(month),
    queryFn: () =>
      adminService.ListOpexLines({ monthFrom: monthKey, monthTo: monthKey, category: '' }),
    enabled: enabled && !!month,
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

export function useOpexRecurring(includeArchived: boolean) {
  return useQuery({
    queryKey: opexKeys.recurring(includeArchived),
    queryFn: () => adminService.ListOpexRecurring({ includeArchived }),
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
export function useCostingFxRates(enabled = true) {
  return useQuery({
    queryKey: ['costingFxRates'],
    queryFn: () => adminService.GetCostingFxRates({}),
    enabled,
  });
}
