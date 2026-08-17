import { AdminAccount } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { formatDateShort } from '../../orders-catalog/components/utility';
import { ACCESS, useDeleteAccount, useSetAccountDisabled } from '../utils/hooks';
import { SpecialtiesField } from './specialties-field';

const ACCESS_ABBR: Record<string, string> = {
  [ACCESS.READ]: 'R',
  [ACCESS.WRITE]: 'W',
};

function StatusBadge({ disabled }: { disabled?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 border px-1.5 py-0.5',
        disabled ? 'border-error' : 'border-borderColor',
      )}
    >
      <Text variant={disabled ? 'error' : 'uppercase'} size='small'>
        {disabled ? 'disabled' : 'active'}
      </Text>
    </span>
  );
}

function AccessChips({ account }: { account: AdminAccount }) {
  if (account.isSuper) {
    return (
      <span className='inline-flex border border-textColor bg-textColor px-1.5 py-0.5'>
        <Text size='small' className='uppercase text-bgColor'>
          super · full access
        </Text>
      </span>
    );
  }
  const perms = (account.permissions ?? []).filter((p) => p.section);
  if (perms.length === 0) {
    return (
      <Text variant='label' size='small'>
        no sections granted
      </Text>
    );
  }
  return (
    <div className='flex flex-wrap gap-1'>
      {perms.map((p) => (
        <span key={p.section} className='whitespace-nowrap border border-borderColor px-1.5 py-0.5'>
          <Text size='small' className='uppercase'>
            {p.section}
            <span className='text-labelColor'> {ACCESS_ABBR[p.access ?? ''] ?? '?'}</span>
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

  if (isLoading) {
    return (
      <div className='border border-borderColor bg-bgColor'>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'h-24 animate-pulse bg-textInactiveColor/30',
              i > 0 && 'border-t border-hairline',
            )}
          />
        ))}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <CalloutBox tone='note' className='flex flex-col items-center gap-1 p-10 text-center'>
        <Text variant='uppercase'>no accounts yet</Text>
        <Text variant='label' size='small'>
          create the first admin account to grant scoped or full access.
        </Text>
      </CalloutBox>
    );
  }

  return (
    <>
      <div className='border border-borderColor bg-bgColor'>
        {accounts.map((a, i) => {
          const isSelf = !!currentUsername && a.username === currentUsername;
          return (
            <div
              key={a.username}
              className={cn('flex flex-col gap-3 p-3 sm:p-4', i > 0 && 'border-t border-hairline')}
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-baseline gap-2'>
                  <Text size='large' className='uppercase break-all'>
                    {a.username}
                  </Text>
                  {isSelf && (
                    <Text variant='label' size='small'>
                      you
                    </Text>
                  )}
                </div>
                <StatusBadge disabled={a.disabled} />
              </div>

              {/* «Чем занимается» стоит ВЫШЕ доступов и отдельно от них намеренно: это
                  самоописание, а не право. Своё правит сам человек, чужое — только
                  accounts:write. */}
              <div className='flex flex-col gap-1'>
                <Text variant='label' size='micro' component='span' className='uppercase'>
                  what they do
                </Text>
                <SpecialtiesField
                  username={a.username}
                  specialties={a.specialties}
                  // Без имени писать некуда: кнопка правки, которая молча ничего не делает,
                  // хуже её отсутствия.
                  editable={(isSelf || canWrite) && !!a.username}
                />
              </div>

              <AccessChips account={a} />

              <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline pt-2'>
                <Text variant='label' size='small'>
                  created {formatDateShort(a.createdAt)} · updated {formatDateShort(a.updatedAt)}
                </Text>
                {canWrite && (
                  <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                    <Button variant='underline' onClick={() => onEdit(a)}>
                      edit
                    </Button>
                    <Button variant='underline' onClick={() => onResetPassword(a)}>
                      password
                    </Button>
                    <Button
                      variant='underline'
                      disabled={isSelf || setDisabled.isPending}
                      onClick={() =>
                        setDisabled.mutate({ username: a.username ?? '', disabled: !a.disabled })
                      }
                    >
                      {a.disabled ? 'enable' : 'disable'}
                    </Button>
                    <Button variant='underline' disabled={isSelf} onClick={() => setToDelete(a)}>
                      delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmationModal
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        onConfirm={() => {
          if (toDelete?.username) del.mutate({ username: toDelete.username });
          setToDelete(null);
        }}
        title='delete account'
        confirmLabel='delete account'
      >
        <Text size='small'>
          Permanently delete <span className='uppercase'>{toDelete?.username}</span> and its
          permissions? This cannot be undone.
        </Text>
      </ConfirmationModal>
    </>
  );
}
