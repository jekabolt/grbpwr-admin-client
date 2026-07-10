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
      title={`reset password — ${username}`}
      confirmLabel='reset'
      confirmDisabled={!password.trim() || reset.isPending}
    >
      <div className='flex flex-col gap-2'>
        <Text variant='inactive' size='small'>
          new password for {username}
        </Text>
        <Input
          name='resetPassword'
          type='text'
          value={password}
          autoComplete='new-password'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
        />
      </div>
    </ConfirmationModal>
  );
}
