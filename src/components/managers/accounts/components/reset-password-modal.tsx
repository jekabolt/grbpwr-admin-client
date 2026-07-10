import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useResetAccountPassword } from '../utils/hooks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
}

export function ResetPasswordModal({ open, onOpenChange, username }: Props) {
  const reset = useResetAccountPassword();
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open) setPassword('');
  }, [open]);

  const handleConfirm = () => {
    if (!password.trim()) return;
    reset.mutate({ username, newPassword: password });
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleConfirm}
      title={`reset password · ${username}`}
      confirmLabel='reset password'
      confirmDisabled={!password.trim() || reset.isPending}
    >
      <label className='flex flex-col gap-1'>
        <Text variant='label' size='small'>
          new password for {username}
        </Text>
        <Input
          name='resetPassword'
          type='text'
          value={password}
          autoComplete='new-password'
          className='h-9'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
        />
      </label>
    </ConfirmationModal>
  );
}
