import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardRole, common_TechCardRoleAssignment } from 'api/proto-http/admin';

// Role assignments (Q5) are managed OUT-OF-BAND via dedicated RPCs, not through the tech-card
// full-replace — so they persist immediately and don't bump the card's lock_version.

const roleKeys = {
  admins: ['admins'] as const,
  assignments: (techCardId: number) => ['techCardRoleAssignments', techCardId] as const,
};

// The panel-wide people list — every picker of a PERSON reads this one, not ListAccounts:
// tech-card roles, file owners, task assignees, fulfillment cards. `ListAdmins` is allowlisted
// (any authenticated account may call it) and carries no permissions, so a picker no longer
// demands the accounts section from a screen that has nothing to do with managing accounts.
//
// IT IS A SOURCE OF OPTIONS, NEVER OF CAPTIONS. Disabled accounts are excluded on purpose —
// offering work to somebody who cannot log in is the wrong answer — so whoever already holds
// something must be named from the record itself; resolve a name through this list and the
// person disappears from the screen the day their account is switched off.
//
// `enabled` exists for read-only views that render the same component without its picker: the
// hook is called before that branch (hooks cannot be conditional), and the request would be
// spent on a list nobody is going to see.
export function useAdmins(enabled = true) {
  return useQuery({
    queryKey: roleKeys.admins,
    queryFn: () => adminService.ListAdmins({}),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

// `seed` is the SAME list off the card read (GetTechCard.role_assignments), which the page already
// holds by the time this panel mounts. Handed in as initialData it makes the list RPC on mount what
// it always was — a second read of data in hand — and removes it: the first render is populated
// instead of flashing "loading…", and the global 5-minute staleTime keeps the query quiet until an
// assign/remove invalidates the key. The refetch stays exactly where it earns its call, after a
// mutation, which is the only moment the list can have moved out from under this cache.
export function useRoleAssignments(
  techCardId?: number,
  seed?: common_TechCardRoleAssignment[],
) {
  return useQuery({
    queryKey: roleKeys.assignments(techCardId ?? 0),
    queryFn: () => adminService.ListTechCardRoleAssignments({ techCardId: techCardId ?? 0 }),
    enabled: !!techCardId,
    initialData: seed ? { assignments: seed } : undefined,
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
