import * as DialogPrimitives from '@radix-ui/react-dialog';
import { AdminAccount, AdminPermission, AdminSectionInfo } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import { useCreateAccount, useUpdateAccountPermissions } from '../utils/hooks';
import { PermissionPicker } from './permission-picker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  account?: AdminAccount | null;
  sections: AdminSectionInfo[];
  sectionsLoading?: boolean;
}

export function AccountFormModal({
  open,
  onOpenChange,
  mode,
  account,
  sections,
  sectionsLoading,
}: Props) {
  const create = useCreateAccount();
  const update = useUpdateAccountPermissions();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSuper, setIsSuper] = useState(false);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the modal opens or the target account changes.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setPassword('');
    if (mode === 'edit' && account) {
      setUsername(account.username ?? '');
      setIsSuper(account.isSuper ?? false);
      setPermissions((account.permissions ?? []).filter((p): p is AdminPermission => !!p.section));
    } else {
      setUsername('');
      setIsSuper(false);
      setPermissions([]);
    }
  }, [open, mode, account]);

  const isEdit = mode === 'edit';
  const pending = create.isPending || update.isPending;

  const handleSubmit = () => {
    setError(null);
    if (!isEdit) {
      if (!username.trim()) return setError('Username is required');
      if (!password.trim()) return setError('Password is required');
    }
    if (!isSuper && permissions.length === 0) {
      return setError('Grant at least one section, or make the account super');
    }

    const done = { onSuccess: () => onOpenChange(false) };
    if (isEdit) {
      update.mutate({ username, isSuper, permissions }, done);
    } else {
      create.mutate({ username: username.trim(), password, isSuper, permissions }, done);
    }
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor p-3 text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[560px] lg:-translate-x-1/2'>
          <div className='mb-3 flex items-center justify-between gap-2 border-b border-textColor pb-2'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              {isEdit ? `edit — ${username}` : 'new account'}
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            {isEdit ? 'Edit admin account permissions' : 'Create a new admin account'}
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-4'>
            {!isEdit && (
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <div className='flex flex-col gap-1'>
                  <Text variant='inactive' size='small'>
                    username
                  </Text>
                  <Input
                    name='newUsername'
                    value={username}
                    autoComplete='off'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setUsername(e.target.value)
                    }
                  />
                </div>
                <div className='flex flex-col gap-1'>
                  <Text variant='inactive' size='small'>
                    password
                  </Text>
                  <Input
                    name='newPassword'
                    type='text'
                    value={password}
                    autoComplete='new-password'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPassword(e.target.value)
                    }
                  />
                </div>
              </div>
            )}

            <div className='border border-textColor p-3'>
              <ToggleSwitch
                checked={isSuper}
                label='super admin — full access to every section'
                onCheckedChange={setIsSuper}
              />
            </div>

            {!isSuper && (
              <PermissionPicker
                sections={sections}
                value={permissions}
                onChange={setPermissions}
                loading={sectionsLoading}
              />
            )}

            {error && (
              <Text variant='error' size='small'>
                {error}
              </Text>
            )}
          </div>

          <div className='mt-4 flex justify-end gap-2'>
            <Button type='button' onClick={() => onOpenChange(false)} variant='secondary' size='lg'>
              cancel
            </Button>
            <Button
              type='button'
              onClick={handleSubmit}
              variant='main'
              size='lg'
              loading={pending}
              disabled={pending}
            >
              {isEdit ? 'save' : 'create'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
