import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { AccessLevel, AdminPermission } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

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
  const { showMessage } = useSnackBarStore();
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
      showMessage('Account created', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to create account', 'error'),
  });
}

export function useUpdateAccountPermissions() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
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
      showMessage('Permissions updated', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to update permissions', 'error'),
  });
}

export function useSetAccountDisabled() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { username: string; disabled: boolean }) =>
      adminService.SetAccountDisabled(vars),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.list() });
      showMessage(vars.disabled ? 'Account disabled' : 'Account enabled', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to update account', 'error'),
  });
}

export function useResetAccountPassword() {
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { username: string; newPassword: string }) =>
      adminService.ResetAccountPassword(vars),
    onSuccess: () => showMessage('Password reset', 'success'),
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to reset password', 'error'),
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
  const { showMessage } = useSnackBarStore();
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
      showMessage('специальности сохранены', 'success');
    },
    onError: (error) =>
      showMessage(
        error instanceof Error ? error.message : 'не удалось сохранить специальности',
        'error',
      ),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { username: string }) => adminService.DeleteAccount(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.list() });
      showMessage('Account deleted', 'success');
    },
    onError: (error) =>
      showMessage(error instanceof Error ? error.message : 'Failed to delete account', 'error'),
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
