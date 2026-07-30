import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { EmployeeInsert, OpexRecurringInsert } from 'api/proto-http/admin';
import { opexKeys } from 'components/managers/opex/utils/hooks';

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

// empSalary v3: a salary template IS an OpexRecurring linked to an employee (employee_id set,
// category 'salaries'). Created from the registry so a person's cost can be booked without leaving
// the screen. Invalidates BOTH the OPEX cache (the recurring list the salary cross-reference reads)
// and the employee cache (its coverage view flips from "no salary" to "booked" on success).
export function useUpsertSalaryTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, recurring }: { id: number; recurring: OpexRecurringInsert }) =>
      adminService.UpsertOpexRecurring({ id, recurring }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: opexKeys.all });
      qc.invalidateQueries({ queryKey: employeeKeys.all });
    },
  });
}
