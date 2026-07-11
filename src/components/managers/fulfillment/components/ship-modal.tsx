import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

// Tracking-code entry for shipping an order. Shipping is a real, irreversible
// transition (it emails the customer), so this is a deliberate two-step: enter a
// non-empty tracking code, then confirm. The parent closes it on success.
export function ShipModal({
  open,
  onOpenChange,
  orderLabel,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderLabel: string;
  saving?: boolean;
  onConfirm: (trackingCode: string) => void;
}) {
  const [tracking, setTracking] = useState('');
  useEffect(() => {
    if (open) setTracking('');
  }, [open]);

  const canSubmit = tracking.trim().length > 0 && !saving;
  function submit() {
    if (!canSubmit) return;
    onConfirm(tracking.trim());
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-40 bg-overlay' />
        <Dialog.Content
          aria-describedby={undefined}
          className='fixed inset-x-2.5 top-1/2 z-50 flex w-auto -translate-y-1/2 flex-col gap-4 border border-textColor bg-bgColor p-4 text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[26rem] lg:-translate-x-1/2'
        >
          <div className='flex items-center justify-between gap-2 border-b border-textColor pb-2'>
            <Dialog.Title className='text-lg uppercase'>ship order {orderLabel}</Dialog.Title>
            <Dialog.Close asChild>
              <Button type='button' aria-label='close'>
                [x]
              </Button>
            </Dialog.Close>
          </div>

          <label className='flex flex-col gap-1'>
            <Text variant='label' size='small' component='span'>
              tracking code
            </Text>
            <Input
              name='tracking-code'
              autoFocus
              placeholder='e.g. 1Z999AA10123456784'
              value={tracking}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTracking(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </label>

          <Text variant='label' size='small'>
            Records the tracking code, moves the order to shipped and emails the customer.
          </Text>

          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              loading={saving}
              disabled={!canSubmit}
              onClick={submit}
            >
              ship
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
