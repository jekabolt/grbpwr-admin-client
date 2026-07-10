import { AdminAccount } from 'api/proto-http/admin';
import { useState } from 'react';
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
  } = usePermissions();
  const canView = !resolved || canManageAccounts;

  const { data, isLoading, isError, error } = useAccounts(canView);
  const { data: sectionsData, isLoading: sectionsLoading } = useAccountSections();

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [resetting, setResetting] = useState<AdminAccount | null>(null);

  const accounts = data?.accounts ?? [];
  const sections = sectionsData?.sections ?? [];

  if (!canView) {
    return (
      <div className='flex flex-col gap-2 border border-textColor p-6'>
        <Text variant='uppercase' size='large'>
          admin accounts
        </Text>
        <Text variant='inactive'>
          You don’t have access to the accounts section. Ask a super admin to grant it.
        </Text>
      </div>
    );
  }

  return (
    <div className='flex flex-col w-full gap-4 pb-16'>
      <div className='flex items-center justify-between gap-3'>
        <Text variant='uppercase' size='large'>
          admin accounts {accounts.length > 0 && `(${accounts.length})`}
        </Text>
        {canManageAccountsWrite && (
          <Button
            variant='main'
            size='lg'
            onClick={() => {
              setEditing(null);
              setFormMode('create');
            }}
          >
            new account
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
