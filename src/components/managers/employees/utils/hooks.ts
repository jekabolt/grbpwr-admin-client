import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { EmployeeInsert } from 'api/proto-http/admin';

// Employee registry (gap-07 v2 A): the people an OPEX salary recurring template can point at.
// Analytics-gated (mirrors OPEX). default_monthly_cost only pre-fills an OPEX template — it is
// never itself a booked figure; the journal (OpexRecurring) stays the source of truth for cost.
export const employeeKeys = {
  all: ['employees'] as const,
  list: (includeArchived: boolean) => [...employeeKeys.all, 'list', includeArchived] as const,
};

export function useEmployees(includeArchived: boolean, enabled = true) {
  return useQuery({
    queryKey: employeeKeys.list(includeArchived),
    queryFn: () => adminService.ListEmployees({ includeArchived }),
    enabled,
  });
}

export function useUpsertEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, employee }: { id: number; employee: EmployeeInsert }) =>
      adminService.UpsertEmployee({ id, employee }),
    onSuccess: () => qc.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export function useArchiveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.ArchiveEmployee({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}
