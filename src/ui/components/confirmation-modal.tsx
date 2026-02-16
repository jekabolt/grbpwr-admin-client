import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Button } from './button';

interface Props {
  open: boolean;
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmationModal({ open, children, onOpenChange, onConfirm, onCancel }: Props) {
  const handleCancel = () => {
    onOpenChange(false);
    onCancel?.();
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex h-auto w-auto -translate-y-1/2 flex-col border border-textInactiveColor bg-bgColor p-2.5 text-textColor lg:inset-x-auto lg:left-1/2 lg:min-w-80 lg:-translate-x-1/2'>
          <DialogPrimitives.Description className='sr-only'>
            Confirmation
          </DialogPrimitives.Description>
          <DialogPrimitives.Title className='sr-only'>Confirmation</DialogPrimitives.Title>
          {children}
          <div className='mt-4 flex justify-end gap-2'>
            <Button type='button' onClick={handleConfirm} variant='main' size='lg'>
              confirm
            </Button>
            <Button type='button' onClick={handleCancel} variant='main' size='lg'>
              cancel
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
