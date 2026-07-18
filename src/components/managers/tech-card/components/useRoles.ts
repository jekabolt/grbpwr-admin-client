import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardRole } from 'api/proto-http/admin';

// Role assignments (Q5) are managed OUT-OF-BAND via dedicated RPCs, not through the tech-card
// full-replace — so they persist immediately and don't bump the card's lock_version.

const roleKeys = {
  admins: ['admins'] as const,
  assignments: (techCardId: number) => ['techCardRoleAssignments', techCardId] as const,
};

// Lightweight admin-account list for the role pickers.
export function useAdmins() {
  return useQuery({
    queryKey: roleKeys.admins,
    queryFn: () => adminService.ListAdmins({}),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRoleAssignments(techCardId?: number) {
  return useQuery({
    queryKey: roleKeys.assignments(techCardId ?? 0),
    queryFn: () => adminService.ListTechCardRoleAssignments({ techCardId: techCardId ?? 0 }),
    enabled: !!techCardId,
  });
}

export function useAssignRole(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, adminId }: { role: common_TechCardRole; adminId: number }) =>
      adminService.AssignTechCardRole({ techCardId, role, adminId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.assignments(techCardId) }),
  });
}

export function useRemoveRoleAssignment(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminService.RemoveTechCardRoleAssignment({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.assignments(techCardId) }),
  });
}
