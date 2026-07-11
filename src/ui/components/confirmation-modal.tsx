import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Button } from './button';

interface Props {
  open: boolean;
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
}

export function ConfirmationModal({
  open,
  children,
  onOpenChange,
  onConfirm,
  onCancel,
  title,
  confirmLabel = 'confirm',
  cancelLabel = 'cancel',
  confirmDisabled,
}: Props) {
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
          {title ? (
            <div className='mb-3 flex items-center justify-between gap-2 border-b border-textInactiveColor pb-2'>
              <DialogPrimitives.Title className='text-lg uppercase'>{title}</DialogPrimitives.Title>
              <DialogPrimitives.Close asChild>
                <Button type='button' className='cursor-pointer'>
                  [x]
                </Button>
              </DialogPrimitives.Close>
            </div>
          ) : (
            <DialogPrimitives.Title className='sr-only'>Confirmation</DialogPrimitives.Title>
          )}
          {children}
          <div className='mt-4 flex justify-end gap-2'>
            <Button type='button' onClick={handleCancel} variant='secondary' size='lg'>
              {cancelLabel}
            </Button>
            <Button
              type='button'
              onClick={handleConfirm}
              variant='main'
              size='lg'
              disabled={confirmDisabled}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
