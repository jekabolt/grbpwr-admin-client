import { useEffect, useState } from 'react';
import { errorSentence, isRefusal } from 'components/shared/notify-failure';
import { CalloutBox, ConfirmationModal, Input, Text } from 'ui';
import { useResetAccountPassword } from '../utils/hooks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  /** The dialog closed on a reset password: the caller shows the receipt. */
  onReset?: () => void;
}

export function ResetPasswordModal({ open, onOpenChange, onReset, username }: Props) {
  const reset = useResetAccountPassword();
  const [password, setPassword] = useState('');
  // The server's refusal of the password stands in the dialog until the next edit.
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setRefusal(null);
    }
  }, [open]);

  const handleConfirm = () => {
    if (!password.trim()) return;
    reset.mutate(
      { username, newPassword: password },
      {
        onSuccess: () => {
          onOpenChange(false);
          onReset?.();
        },
        onError: (e) => {
          if (isRefusal(e)) return setRefusal(errorSentence(e, 'not reset'));
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleConfirm}
      title={`reset password · ${username}`}
      confirmLabel='reset password'
      confirmDisabled={!password.trim() || reset.isPending}
      closeOnConfirm={false}
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
          aria-invalid={refusal !== null || undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setRefusal(null);
            setPassword(e.target.value);
          }}
        />
      </label>
      {refusal && (
        <CalloutBox tone='error' className='mt-2'>
          <Text size='micro' component='span' role='alert'>
            <b>not reset</b> · {refusal}
          </Text>
        </CalloutBox>
      )}
    </ConfirmationModal>
  );
}
