import { AdminAccount } from 'api/proto-http/admin';
import { useState } from 'react';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
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

  /**
   * СВОИ СПЕЦИАЛЬНОСТИ БЕРУТСЯ ИЗ `ListAdmins`, А НЕ ИЗ `GetCurrentAccount`.
   *
   * `GetCurrentAccount` собирает ответ из клеймов токена и в базу за специальностями не
   * ходит — поле там всегда пустое. Покажи мы его, экран после перезагрузки рисовал бы
   * «ничего не указано» у человека, у которого всё указано, а следующая добавка ушла бы
   * набором из одного элемента и СТЁРЛА бы остальные: запись — это replace всего набора.
   * `ListAdmins` доступен любому аутентифицированному и несёт специальности каждого.
   */
  const { data: adminsData } = useAdmins();
  const mySpecialties = current?.username
    ? adminsData?.admins?.find((a) => a.username === current.username)?.specialties
    : undefined;

  // РАЗДЕЛ ЗАКРЫТ, НО СВОЙ АККАУНТ — НЕ РАЗДЕЛ. Чужие учётки и доступы отсюда не видны, а
  // «чем занимается» человек указывает себе сам, без accounts:write (решение Р1): поле,
  // которое нельзя заполнить без администратора аккаунтов, остаётся пустым — и пустым
  // остаётся пикер владельцев файла, ради которого оно и заводилось.
  if (!canView) {
    return (
      <div className='flex w-full flex-col gap-gutter pb-16'>
        <Section
          title={`мой аккаунт · ${current?.username ?? '—'}`}
          question='— список аккаунтов и доступы выдаёт супер-админ'
        >
          <Text variant='label' size='micro'>
            чужие учётки и права отсюда не видны. это не мешает указать, чем вы занимаетесь: по
            этой подписи вас находят, когда назначают владельца файла.
          </Text>
          <GroupLabel>чем занимается</GroupLabel>
          <SpecialtiesField
            username={current?.username}
            specialties={mySpecialties}
            editable={!!current?.username}
          />
        </Section>
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
