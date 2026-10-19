import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { AccessLevel, AdminPermission } from 'api/proto-http/admin';
import { isRefusal, notifyFailure } from 'components/shared/notify-failure';

export const accountsKeys = {
  all: ['accounts'] as const,
  current: () => [...accountsKeys.all, 'current'] as const,
  sections: () => [...accountsKeys.all, 'sections'] as const,
  list: () => [...accountsKeys.all, 'list'] as const,
};

// ---- Reads ----

// The calling account's identity + effective permissions. Any authenticated admin
// may call this; it drives which sections the panel exposes.
export function useCurrentAccount() {
  return useQuery({
    queryKey: accountsKeys.current(),
    queryFn: () => adminService.GetCurrentAccount({}),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// Catalog of grantable sections for the permission picker.
export function useAccountSections() {
  return useQuery({
    queryKey: accountsKeys.sections(),
    queryFn: () => adminService.ListAccountSections({}),
    staleTime: 30 * 60_000,
    retry: false,
  });
}

// Every admin account with its permissions. Requires the accounts section (read).
export function useAccounts(enabled = true) {
  return useQuery({
    queryKey: accountsKeys.list(),
    queryFn: () => adminService.ListAccounts({}),
    staleTime: 30_000,
    enabled,
  });
}

// ---- Mutations ----

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      username: string;
      password: string;
      isSuper: boolean;
      permissions: AdminPermission[];
    }) =>
      adminService.CreateAccount({
        username: vars.username,
        password: vars.password,
        isSuper: vars.isSuper,
        permissions: vars.isSuper ? [] : vars.permissions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.list() });
    },
    // A refusal stands in the form (account-form-modal); a lost request is news.
    onError: (error, vars) =>
      !isRefusal(error) && notifyFailure(`ACCOUNT ${vars.username}`, 'not created', error),
  });
}

export function useUpdateAccountPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { username: string; isSuper: boolean; permissions: AdminPermission[] }) =>
      adminService.UpdateAccountPermissions({
        username: vars.username,
        isSuper: vars.isSuper,
        permissions: vars.isSuper ? [] : vars.permissions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.list() });
      queryClient.invalidateQueries({ queryKey: accountsKeys.current() });
    },
    // A refusal stands in the form (account-form-modal); a lost request is news.
    onError: (error, vars) =>
      !isRefusal(error) && notifyFailure(`ACCOUNT ${vars.username}`, 'not saved', error),
  });
}

export function useSetAccountDisabled() {
  const queryClient = useQueryClient();
  // Retry re-sends through the same mutation, so its pending state stays honest.
  const again = useRef<(vars: { username: string; disabled: boolean }) => void>(() => undefined);
  const m = useMutation({
    mutationFn: (vars: { username: string; disabled: boolean }) =>
      adminService.SetAccountDisabled(vars),
    // The enable / disable label flips: that is the receipt.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountsKeys.list() }),
    onError: (error, vars) =>
      notifyFailure(
        `ACCOUNT ${vars.username}`,
        vars.disabled ? 'not disabled' : 'not enabled',
        error,
        () => again.current(vars),
      ),
  });
  again.current = m.mutate;
  return m;
}

export function useResetAccountPassword() {
  return useMutation({
    mutationFn: (vars: { username: string; newPassword: string }) =>
      adminService.ResetAccountPassword(vars),
    // A refusal stands in the dialog (reset-password-modal); a lost request is news.
    onError: (error, vars) =>
      !isRefusal(error) && notifyFailure(`ACCOUNT ${vars.username}`, 'password not reset', error),
  });
}

/**
 * «Чем занимается» — самоописание аккаунта. Прав оно не несёт ни грамма: по нему человека
 * находят в пикере владельцев файла и в упоминаниях, и только. Поэтому СВОЮ специальность
 * человек правит сам, без accounts:write (решение Р1) — поле, которое нельзя заполнить без
 * администратора аккаунтов, остаётся пустым, а пустой справочник обесценивает и пикер, и
 * поиск людей, ради которых он заводился.
 */
export function useSetAccountSpecialties() {
  const queryClient = useQueryClient();
  return useMutation({
    // Словарь приезжает клиенту ИМЕНАМИ (`ListAdminsResponse.specialties`), без id — id
    // специальности в контракте не публикуется вовсе. Поэтому весь выбранный набор уезжает
    // именами в `new_specialties`: сервер схлопывает имя на существующую запись словаря
    // (upsert по уникальному имени), так что повторный выбор ничего не плодит, а имя,
    // набранное в другом регистре, ложится на ту же запись.
    mutationFn: (vars: { username: string; specialties: string[] }) =>
      adminService.SetAccountSpecialties({
        username: vars.username,
        specialtyIds: [],
        newSpecialties: vars.specialties,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.list() });
      queryClient.invalidateQueries({ queryKey: accountsKeys.current() });
      // Пикер владельцев файла и подписи людей читают ListAdmins (ключ `['admins']` в
      // tech-card/components/useRoles). Без этой строки новая специальность не нашлась бы
      // поиском по людям до перезагрузки вкладки.
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    // The chips roll back (specialties-field); the reason goes to the inbox.
    onError: (error, vars) =>
      notifyFailure(`ACCOUNT ${vars.username}`, 'specialties not saved', error),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { username: string }) => adminService.DeleteAccount(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.list() });
    },
    onError: (error, vars) => notifyFailure(`ACCOUNT ${vars.username}`, 'not deleted', error),
  });
}

// ---- Access-level helpers ----

export const ACCESS: Record<'NONE' | 'READ' | 'WRITE', AccessLevel> = {
  NONE: 'ACCESS_LEVEL_UNSPECIFIED',
  READ: 'ACCESS_LEVEL_READ',
  WRITE: 'ACCESS_LEVEL_WRITE',
};

// WRITE implies READ.
export function accessSatisfies(have: AccessLevel | undefined, need: AccessLevel): boolean {
  if (need === ACCESS.WRITE) return have === ACCESS.WRITE;
  if (need === ACCESS.READ) return have === ACCESS.READ || have === ACCESS.WRITE;
  return true;
}
