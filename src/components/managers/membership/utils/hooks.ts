import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  GetTierAuditLogRequest,
  ListMembersRequest,
  TierCode,
  TierConfigEntry,
} from 'api/proto-http/admin';
import { isRefusal, notifyFailure } from 'components/shared/notify-failure';

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
  return useMutation({
    mutationFn: (vars: { userId: number; newTier: TierCode; reason: string }) =>
      adminService.OverrideTier(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.member(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.tierHistory(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.members() });
    },
    // A refusal of the reason / tier stands in the form (member-actions); a lost request is news.
    onError: (error, vars) =>
      !isRefusal(error) && notifyFailure(`MEMBER ${vars.userId}`, 'tier not changed', error),
  });
}

export function useSetMemberStatus() {
  const queryClient = useQueryClient();
  // Retry re-sends through the same mutation, so its pending state stays honest.
  const again = useRef<(vars: { userId: number; status: string }) => void>(() => undefined);
  const m = useMutation({
    mutationFn: (vars: { userId: number; status: string }) => adminService.SetMemberStatus(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.member(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.members() });
    },
    onError: (error, vars) =>
      notifyFailure(`MEMBER ${vars.userId}`, 'status not changed', error, () =>
        again.current(vars),
      ),
  });
  again.current = m.mutate;
  return m;
}

export function useSoftDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: number }) => adminService.SoftDeleteMember(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.member(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.members() });
    },
    onError: (error, vars) => notifyFailure(`MEMBER ${vars.userId}`, 'not deleted', error),
  });
}

export function useHardEraseMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: number; confirm: boolean }) => adminService.HardEraseMember(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.member(vars.userId) });
      queryClient.invalidateQueries({ queryKey: membershipKeys.members() });
    },
    onError: (error, vars) => notifyFailure(`MEMBER ${vars.userId}`, 'not erased', error),
  });
}

export function useSendMemberEmail() {
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
    // A refusal stands in the dialog (send-email-modal); a lost request is news.
    onError: (error, vars) =>
      !isRefusal(error) && notifyFailure(`MEMBER ${vars.userId}`, 'email not sent', error),
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
  return useMutation({
    mutationFn: (entries: TierConfigEntry[]) => adminService.UpdateTierConfig({ entries }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.tierConfig() });
    },
    // A refusal stands above the save bar (tier-config page); a lost request is news.
    onError: (error) => !isRefusal(error) && notifyFailure('TIER CONFIG', 'not saved', error),
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
  return useMutation({
    mutationFn: (vars: { email?: string; expiresInDays?: number }) =>
      adminService.GenerateHackerInvite({
        email: vars.email || undefined,
        expiresInDays: vars.expiresInDays || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.all });
    },
    // A refusal stands under the form (invites); a lost request is news.
    onError: (error) => !isRefusal(error) && notifyFailure('INVITE', 'not generated', error),
  });
}

export function useRevokeHackerInvite() {
  const queryClient = useQueryClient();
  // Retry re-sends through the same mutation, so its pending state stays honest.
  const again = useRef<(vars: { inviteId: number }) => void>(() => undefined);
  const m = useMutation({
    mutationFn: (vars: { inviteId: number }) => adminService.RevokeHackerInvite(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.all });
    },
    onError: (error, vars) =>
      notifyFailure(`INVITE ${vars.inviteId}`, 'not revoked', error, () => again.current(vars)),
  });
  again.current = m.mutate;
  return m;
}

export function useRevokeHackerStatus() {
  const queryClient = useQueryClient();
  // Retry re-sends through the same mutation, so its pending state stays honest.
  const again = useRef<(vars: { userId: number }) => void>(() => undefined);
  const m = useMutation({
    mutationFn: (vars: { userId: number }) => adminService.RevokeHackerStatus(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipKeys.all });
    },
    onError: (error, vars) =>
      notifyFailure(`MEMBER ${vars.userId}`, 'hacker not revoked', error, () =>
        again.current(vars),
      ),
  });
  again.current = m.mutate;
  return m;
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
  return useMutation({
    mutationFn: (vars: { confirm: boolean }) => adminService.RunTierBackfill(vars),
    // The counts land on the button that started it (audit page).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membershipKeys.all }),
    onError: (error) => notifyFailure('BACKFILL', 'failed', error),
  });
}
