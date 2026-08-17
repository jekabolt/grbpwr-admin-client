import { AdminAccount } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { AccountFormModal } from './components/account-form-modal';
import { AccountsTable } from './components/accounts-table';
import { ResetPasswordModal } from './components/reset-password-modal';
import { useAccountSections, useAccounts } from './utils/hooks';
import { usePermissions } from './utils/permissions';

export function Accounts() {
  const {
    canManageAccounts,
    canManageAccountsWrite,
    account: current,
    resolved,
    isLoading: accountLoading,
  } = usePermissions();
  // Гейт остаётся fail-open ровно в том виде, в каком был: закрываем экран, только когда
  // личность приехала и она НЕ управляет аккаунтами. Легаси-бэкенд, у которого
  // GetCurrentAccount падает, по-прежнему оставляет раздел открытым.
  const denied = resolved && !canManageAccounts;

  // `enabled` ждёт, пока личность отстреляется. Раньше `!resolved` в первые миллисекунды
  // означал «показывать всё», и `ListAccounts` уходил в сеть ещё до того, как выяснялось,
  // что человеку туда нельзя: 403 в логе и попытка прочитать чужие учётки на каждую
  // перезагрузку /accounts под ограниченным аккаунтом.
  const { data, isLoading, isError, error } = useAccounts(!accountLoading && !denied);
  const { data: sectionsData, isLoading: sectionsLoading } = useAccountSections();

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [resetting, setResetting] = useState<AdminAccount | null>(null);

  const accounts = data?.accounts ?? [];
  const sections = sectionsData?.sections ?? [];

  // Пока личность в пути — ни шапки, ни скелета: под ограниченным аккаунтом это был бы
  // заголовок «admin accounts» на полсекунды перед редиректом.
  if (accountLoading) return null;

  // РАЗДЕЛ ЗАКРЫТ, НО СВОЙ АККАУНТ — НЕ РАЗДЕЛ: человек уезжает на «мой профиль», где правит
  // своё самоописание без accounts:write (решение Р1). Карточка живёт ТАМ, а не веткой здесь —
  // один экран на один адрес, и на /me нет ни импорта списка аккаунтов, ни модалок прав.
  if (denied) return <Navigate to={ROUTES.me} replace />;

  return (
    <div className='flex w-full flex-col gap-4 pb-16'>
      <div className='flex flex-wrap items-end justify-between gap-3 border-b border-textInactiveColor pb-3'>
        <div className='flex flex-col gap-1'>
          <Text variant='uppercase' size='large'>
            admin accounts{accounts.length > 0 && ` · ${accounts.length}`}
          </Text>
          <Text variant='label' size='small'>
            Super accounts see everything; scoped accounts see only the sections they’re granted.
          </Text>
        </div>
        {canManageAccountsWrite && (
          <Button
            variant='main'
            size='lg'
            onClick={() => {
              setEditing(null);
              setFormMode('create');
            }}
          >
            + new account
          </Button>
        )}
      </div>

      {isError && (
        <Text variant='error' size='small'>
          {error instanceof Error ? error.message : 'Failed to load accounts'}
        </Text>
      )}

      <AccountsTable
        accounts={accounts}
        isLoading={isLoading}
        currentUsername={current?.username}
        canWrite={canManageAccountsWrite}
        onEdit={(a) => {
          setEditing(a);
          setFormMode('edit');
        }}
        onResetPassword={(a) => setResetting(a)}
      />

      <AccountFormModal
        open={formMode !== null}
        onOpenChange={(o) => !o && setFormMode(null)}
        mode={formMode ?? 'create'}
        account={editing}
        sections={sections}
        sectionsLoading={sectionsLoading}
      />

      <ResetPasswordModal
        open={resetting !== null}
        onOpenChange={(o) => !o && setResetting(null)}
        username={resetting?.username ?? ''}
      />
    </div>
  );
}
