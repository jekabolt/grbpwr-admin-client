import { AdminAccount } from 'api/proto-http/admin';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { AccountFormModal } from './components/account-form-modal';
import { AccountsTable } from './components/accounts-table';
import { ResetPasswordModal } from './components/reset-password-modal';
import { SpecialtiesField } from './components/specialties-field';
import { useAccountSections, useAccounts } from './utils/hooks';
import { usePermissions } from './utils/permissions';

export function Accounts() {
  const {
    canManageAccounts,
    canManageAccountsWrite,
    account: current,
    resolved,
  } = usePermissions();
  const canView = !resolved || canManageAccounts;

  const { data, isLoading, isError, error } = useAccounts(canView);
  const { data: sectionsData, isLoading: sectionsLoading } = useAccountSections();

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [resetting, setResetting] = useState<AdminAccount | null>(null);

  const accounts = data?.accounts ?? [];
  const sections = sectionsData?.sections ?? [];

  // РАЗДЕЛ ЗАКРЫТ, НО СВОЙ АККАУНТ — НЕ РАЗДЕЛ. Чужие учётки и доступы отсюда не видны, а
  // «чем занимается» человек указывает себе сам, без accounts:write (решение Р1): поле,
  // которое нельзя заполнить без администратора аккаунтов, остаётся пустым — и пустым
  // остаётся пикер владельцев файла, ради которого оно и заводилось.
  if (!canView) {
    return (
      <div className='flex w-full flex-col gap-gutter pb-16'>
        <div className='flex flex-col gap-2.5 border border-borderColor bg-bgColor p-block'>
          <Text variant='uppercase'>мой аккаунт · {current?.username ?? '—'}</Text>
          <Text variant='label' size='micro'>
            список аккаунтов и доступы закрыты правами: их выдаёт супер-админ. это не мешает
            указать, чем вы занимаетесь.
          </Text>
          <div className='flex flex-col gap-1'>
            <Text variant='label' size='micro' component='span' className='uppercase'>
              чем занимается
            </Text>
            <SpecialtiesField
              username={current?.username}
              specialties={current?.specialties}
              editable={!!current?.username}
            />
          </div>
        </div>
      </div>
    );
  }

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
