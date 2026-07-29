import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useSchedulePickup } from '../hooks/useFulfillment';

// Today as YYYY-MM-DD from local wall-clock parts (matches the SchedulePickup date field).
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// ffPickup v2 — end-of-day carrier handover, prefilled so it is a two-tap action.
// SchedulePickup exists; the modal seeds date = today and the parcel count from the
// day's shipments.
//
// Gap note: the board card carries no "labelled at" timestamp and no carrier, so we
// cannot isolate "labels created today" precisely. `defaultQuantity` therefore comes
// from the in-transit lane count (parcels shipped and not yet delivered) as an honest
// estimate of what is waiting for collection; the operator confirms carrier + count.
export function PickupModal({
  open,
  onOpenChange,
  defaultQuantity = 1,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultQuantity?: number;
}) {
  const schedule = useSchedulePickup();

  const [carrierCode, setCarrierCode] = useState('');
  const [date, setDate] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');

  // Prefill from today's shipments whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setCarrierCode('');
    setDate(todayISO());
    setQuantity(Math.max(1, defaultQuantity));
    setFromTime('');
    setToTime('');
  }, [open, defaultQuantity]);

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
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      title='schedule pickup'
      confirmLabel='schedule'
      confirmDisabled={!canSubmit}
      closeOnConfirm={false}
      width='md'
    >
      <div className='flex flex-col gap-2.5'>
        <Text size='micro' variant='label' component='span'>
          Books a carrier collection from the warehouse — the end-of-day handover for the parcels
          shipped so far. Count is prefilled from today’s in-transit parcels; adjust if needed.
        </Text>

        <Field label='carrier code'>
          <Input
            name='carrier-code'
            autoFocus
            placeholder='e.g. dhl'
            value={carrierCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCarrierCode(e.target.value)}
          />
        </Field>

        <div className='grid grid-cols-2 gap-2'>
          <Field label='date'>
            <Input
              name='pickup-date'
              type='date'
              value={date}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
            />
          </Field>
          <Field label='parcels'>
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
          </Field>
          <Field label='from (optional)'>
            <Input
              name='pickup-from'
              placeholder='09:00:00'
              value={fromTime}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromTime(e.target.value)}
            />
          </Field>
          <Field label='to (optional)'>
            <Input
              name='pickup-to'
              placeholder='17:00:00'
              value={toTime}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToTime(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </ConfirmationModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='flex flex-col gap-1'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </label>
  );
}
