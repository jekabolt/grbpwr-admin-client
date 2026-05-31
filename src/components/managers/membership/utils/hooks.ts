import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  GetTierAuditLogRequest,
  ListMembersRequest,
  TierCode,
  TierConfigEntry,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

export const membershipKeys = {
  all: ['membership'] as const,
  members: () => [...membershipKeys.all, 'members'] as const,
  membersList: (filters: Record<string, unknown>) =>
    [...membershipKeys.members(), filters] as const,
  member: (id: number) => [...membershipKeys.all, 'member', id] as const,
  tierHistory: (id: number) => [...membershipKeys.all, 'tier-history', id] as const,
  tierConfig: () => [...membershipKeys.all, 'tier-config'] as const,
  hackerInvites: (activeOnly: boolean) =>
    [...membershipKeys.all, 'hacker-invites', activeOnly] as const,
  hackerAccounts: () => [...membershipKeys.all, 'hacker-accounts'] as const,
  auditLog: (filters: Record<string, unknown>) =>
    [...membershipKeys.all, 'audit-log', filters] as const,
};

// ---- Members ----

export type MembersFilters = Partial<Omit<ListMembersRequest, 'limit' | 'offset'>>;

export function useMembers(filters: MembersFilters, limit: number, offset: number) {
  return useQuery({
    queryKey: membershipKeys.membersList({ ...filters, limit, offset }),
    queryFn: () =>
      adminService.ListMembers({
        tier: filters.tier || undefined,
        status: filters.status || undefined,
        spendMinEur: filters.spendMinEur,
        spendMaxEur: filters.spendMaxEur,
        registeredFrom: filters.registeredFrom || undefined,
        registeredTo: filters.registeredTo || undefined,
        daysUntilReviewMax: filters.daysUntilReviewMax,
        email: filters.email || undefined,
        limit,
        offset,
      }),
    staleTime: 60_000,
  });
}

export function useMember(userId: number | null) {
  return useQuery({
    queryKey: membershipKeys.member(userId!),
    queryFn: () => adminService.GetMember({ userId: userId! }),
    enabled: userId !== null && !Number.isNaN(userId),
  });
}

export function useTierHistory(userId: number | null) {
  return useQuery({
    queryKey: membershipKeys.tierHistory(userId!),
    queryFn: () => adminService.GetTierHistory({ userId: userId! }),
    enabled: userId !== null && !Number.isNaN(userId),
  });
}

export function useOverrideTier() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { userId: number; newTier: TierCode; reason: string }) =>
      adminService.OverrideTier(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.member(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.tierHistory(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.members() });
      showMessage('Tier overridden', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to override tier', 'error'),
  });
}

export function useSetMemberStatus() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { userId: number; status: string }) =>
      adminService.SetMemberStatus(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.member(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.members() });
      showMessage('Member status updated', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to update status', 'error'),
  });
}

export function useSoftDeleteMember() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { userId: number }) => adminService.SoftDeleteMember(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.member(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.members() });
      showMessage('Account soft-deleted', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to delete account', 'error'),
  });
}

export function useHardEraseMember() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { userId: number; confirm: boolean }) =>
      adminService.HardEraseMember(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.member(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.members() });
      showMessage('Account erased', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to erase account', 'error'),
  });
}

export function useSendMemberEmail() {
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: {
      userId: number;
      heading: string;
      body: string;
      ctaLabel?: string;
      ctaUrl?: string;
    }) =>
      adminService.SendMemberEmail({
        userId: vars.userId,
        heading: vars.heading,
        body: vars.body,
        ctaLabel: vars.ctaLabel || undefined,
        ctaUrl: vars.ctaUrl || undefined,
      }),
    onSuccess: () => showMessage('Email sent', 'success'),
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to send email', 'error'),
  });
}

// ---- Tier config ----

export function useTierConfig() {
  return useQuery({
    queryKey: membershipKeys.tierConfig(),
    queryFn: () => adminService.GetTierConfig({}),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateTierConfig() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (entries: TierConfigEntry[]) =>
      adminService.UpdateTierConfig({ entries }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.tierConfig() });
      showMessage('Tier configuration saved', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to save config', 'error'),
  });
}

// ---- Hacker ----

export function useHackerInvites(activeOnly: boolean) {
  return useQuery({
    queryKey: membershipKeys.hackerInvites(activeOnly),
    queryFn: () => adminService.ListHackerInvites({ activeOnly }),
    staleTime: 30_000,
  });
}

export function useHackerAccounts() {
  return useQuery({
    queryKey: membershipKeys.hackerAccounts(),
    queryFn: () => adminService.ListHackerAccounts({}),
    staleTime: 30_000,
  });
}

export function useGenerateHackerInvite() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { email?: string; expiresInDays?: number }) =>
      adminService.GenerateHackerInvite({
        email: vars.email || undefined,
        expiresInDays: vars.expiresInDays || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      showMessage('Invite generated', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to generate invite', 'error'),
  });
}

export function useRevokeHackerInvite() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { inviteId: number }) => adminService.RevokeHackerInvite(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      showMessage('Invite revoked', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to revoke invite', 'error'),
  });
}

export function useRevokeHackerStatus() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { userId: number }) => adminService.RevokeHackerStatus(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      showMessage('Hacker status revoked', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to revoke status', 'error'),
  });
}

// ---- Audit + backfill ----

export type AuditFilters = Partial<Omit<GetTierAuditLogRequest, 'limit' | 'offset'>>;

export function useTierAuditLog(filters: AuditFilters, limit: number, offset: number) {
  return useQuery({
    queryKey: membershipKeys.auditLog({ ...filters, limit, offset }),
    queryFn: () =>
      adminService.GetTierAuditLog({
        userId: filters.userId || 0,
        actor: filters.actor || undefined,
        triggerType: filters.triggerType || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        limit,
        offset,
      }),
    staleTime: 30_000,
  });
}

export function useRunTierBackfill() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { confirm: boolean }) => adminService.RunTierBackfill(vars),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      showMessage(
        `Backfill done: ${res.accountsUpgraded ?? 0} upgraded / ${res.accountsProcessed ?? 0} processed`,
        'success',
      );
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Backfill failed', 'error'),
  });
}
