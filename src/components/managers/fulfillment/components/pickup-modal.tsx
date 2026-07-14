import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useSchedulePickup } from '../hooks/useFulfillment';

// End-of-day carrier handover: books a pickup for the warehouse origin (Sendcloud's
// manifest equivalent). Board-level — it touches no single order, it tells the
// carrier to come collect the day's parcels.
export function PickupModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const schedule = useSchedulePickup();

  const [carrierCode, setCarrierCode] = useState('');
  const [date, setDate] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');

  useEffect(() => {
    if (open) return;
    setCarrierCode('');
    setDate('');
    setQuantity(1);
    setFromTime('');
    setToTime('');
  }, [open]);

  const canSubmit = carrierCode.trim().length > 0 && !!date && quantity >= 1 && !schedule.isPending;

  function submit() {
    if (!canSubmit) return;
    schedule.mutate(
      {
        carrierCode: carrierCode.trim(),
        date,
        quantity,
        fromTime: fromTime.trim() || undefined,
        toTime: toTime.trim() || undefined,
      },
      { onSuccess: (r) => r.confirmed && onOpenChange(false) },
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          aria-describedby={undefined}
          className='fixed inset-x-2.5 top-1/2 z-50 flex w-auto -translate-y-1/2 flex-col gap-4 border border-textInactiveColor bg-bgColor p-4 text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[26rem] lg:-translate-x-1/2'
        >
          <div className='flex items-center justify-between gap-2 border-b border-textInactiveColor pb-2'>
            <Dialog.Title className='text-lg uppercase'>schedule pickup</Dialog.Title>
            <Dialog.Close asChild>
              <Button type='button' aria-label='close'>
                [x]
              </Button>
            </Dialog.Close>
          </div>

          <Text variant='label' size='small'>
            Books a carrier collection from the warehouse for the day — the end-of-day handover for
            all parcels labelled so far.
          </Text>

          <div className='grid grid-cols-2 gap-3'>
            <label className='col-span-2 flex flex-col gap-1'>
              <Text variant='label' size='small' component='span'>
                carrier code
              </Text>
              <Input
                name='carrier-code'
                autoFocus
                placeholder='e.g. dhl'
                value={carrierCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCarrierCode(e.target.value)
                }
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text variant='label' size='small' component='span'>
                date
              </Text>
              <Input
                name='pickup-date'
                type='date'
                value={date}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text variant='label' size='small' component='span'>
                parcels
              </Text>
              <Input
                name='pickup-quantity'
                type='number'
                inputMode='numeric'
                min={1}
                value={String(quantity)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                }
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text variant='label' size='small' component='span'>
                from (optional)
              </Text>
              <Input
                name='pickup-from'
                placeholder='09:00:00'
                value={fromTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromTime(e.target.value)}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text variant='label' size='small' component='span'>
                to (optional)
              </Text>
              <Input
                name='pickup-to'
                placeholder='17:00:00'
                value={toTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToTime(e.target.value)}
              />
            </label>
          </div>

          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              loading={schedule.isPending}
              disabled={!canSubmit}
              onClick={submit}
            >
              schedule
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
