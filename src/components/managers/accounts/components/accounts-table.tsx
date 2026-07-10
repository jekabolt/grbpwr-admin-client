import { AdminAccount } from 'api/proto-http/admin';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { formatDateShort } from '../../orders-catalog/components/utility';
import { ACCESS, useDeleteAccount, useSetAccountDisabled } from '../utils/hooks';

const ACCESS_ABBR: Record<string, string> = {
  [ACCESS.READ]: 'r',
  [ACCESS.WRITE]: 'w',
};

function AccessSummary({ account }: { account: AdminAccount }) {
  if (account.isSuper) {
    return (
      <span className='border border-textColor px-1.5 py-0.5'>
        <Text variant='uppercase' size='small'>
          super
        </Text>
      </span>
    );
  }
  const perms = (account.permissions ?? []).filter((p) => p.section);
  if (perms.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        no access
      </Text>
    );
  }
  return (
    <div className='flex flex-wrap justify-center gap-1'>
      {perms.map((p) => (
        <span key={p.section} className='border border-textColor px-1 py-0.5 whitespace-nowrap'>
          <Text size='small'>
            {p.section}
            <span className='text-textInactiveColor'>·{ACCESS_ABBR[p.access ?? ''] ?? '?'}</span>
          </Text>
        </span>
      ))}
    </div>
  );
}

interface Props {
  accounts: AdminAccount[];
  isLoading: boolean;
  currentUsername?: string;
  canWrite: boolean;
  onEdit: (account: AdminAccount) => void;
  onResetPassword: (account: AdminAccount) => void;
}

export function AccountsTable({
  accounts,
  isLoading,
  currentUsername,
  canWrite,
  onEdit,
  onResetPassword,
}: Props) {
  const setDisabled = useSetAccountDisabled();
  const del = useDeleteAccount();
  const [toDelete, setToDelete] = useState<AdminAccount | null>(null);

  return (
    <>
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-9'>
            <tr>
              {['Username', 'Access', 'Status', 'Created', 'Updated', ''].map((h) => (
                <th key={h} className='border border-textColor px-2 h-9'>
                  <Text variant='uppercase' size='small'>
                    {h}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className='text-center py-6'>
                  <Text variant='inactive'>{isLoading ? 'loading…' : 'no accounts'}</Text>
                </td>
              </tr>
            ) : (
              accounts.map((a) => {
                const isSelf = !!currentUsername && a.username === currentUsername;
                return (
                  <tr key={a.username} className='border-b border-textColor last:border-b-0'>
                    <td className='border border-textColor px-2 py-1.5 whitespace-nowrap'>
                      <Text size='small'>
                        {a.username}
                        {isSelf && <span className='text-textInactiveColor'> (you)</span>}
                      </Text>
                    </td>
                    <td className='border border-textColor px-2 py-1.5 text-center'>
                      <AccessSummary account={a} />
                    </td>
                    <td className='border border-textColor px-2 py-1.5 text-center'>
                      <Text size='small' variant={a.disabled ? 'error' : 'default'}>
                        {a.disabled ? 'disabled' : 'active'}
                      </Text>
                    </td>
                    <td className='border border-textColor px-2 py-1.5 text-center whitespace-nowrap'>
                      <Text size='small'>{formatDateShort(a.createdAt)}</Text>
                    </td>
                    <td className='border border-textColor px-2 py-1.5 text-center whitespace-nowrap'>
                      <Text size='small'>{formatDateShort(a.updatedAt)}</Text>
                    </td>
                    <td className='border border-textColor px-2 py-1.5 text-center whitespace-nowrap'>
                      {canWrite ? (
                        <div className='flex items-center justify-center gap-1'>
                          <Button variant='underline' onClick={() => onEdit(a)}>
                            edit
                          </Button>
                          <span className='text-textInactiveColor'>·</span>
                          <Button variant='underline' onClick={() => onResetPassword(a)}>
                            password
                          </Button>
                          <span className='text-textInactiveColor'>·</span>
                          <Button
                            variant='underline'
                            disabled={isSelf || setDisabled.isPending}
                            onClick={() =>
                              setDisabled.mutate({
                                username: a.username ?? '',
                                disabled: !a.disabled,
                              })
                            }
                          >
                            {a.disabled ? 'enable' : 'disable'}
                          </Button>
                          <span className='text-textInactiveColor'>·</span>
                          <Button
                            variant='underline'
                            disabled={isSelf}
                            onClick={() => setToDelete(a)}
                          >
                            delete
                          </Button>
                        </div>
                      ) : (
                        <Text variant='inactive' size='small'>
                          read-only
                        </Text>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmationModal
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        onConfirm={() => {
          if (toDelete?.username) del.mutate({ username: toDelete.username });
          setToDelete(null);
        }}
        title='delete account'
        confirmLabel='delete'
      >
        <Text size='small'>
          Permanently delete <span className='uppercase'>{toDelete?.username}</span> and its
          permissions? This cannot be undone.
        </Text>
      </ConfirmationModal>
    </>
  );
}
