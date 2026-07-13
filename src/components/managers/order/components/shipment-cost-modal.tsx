import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

const inputClass =
  'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// Record the real carrier invoice so contribution margin uses actual logistics instead
// of the quoted rate. Write-only (no read-back on the order) — fire + snackbar.
export function ShipmentCostModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (actualCost: string, returnShippingCost?: string) => void;
}) {
  const { dictionary } = useDictionary();
  const base = dictionary?.baseCurrency || 'EUR';
  const [actual, setActual] = useState('');
  const [ret, setRet] = useState('');

  const submit = () => {
    if (!actual.trim()) return;
    onSubmit(actual, ret);
    setActual('');
    setRet('');
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      title='actual shipping cost'
      confirmLabel='record'
      confirmDisabled={!actual.trim()}
    >
      <div className='flex min-w-[min(90vw,22rem)] flex-col gap-3'>
        <Text variant='inactive' size='small'>
          Real carrier invoice ({base}). Feeds contribution margin — not shown back on the order.
        </Text>
        <label className='flex flex-col gap-1'>
          <Text size='small'>actual shipping cost ({base})</Text>
          <input
            className={inputClass}
            type='number'
            step='0.01'
            min='0'
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder='0.00'
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>return shipping cost ({base}) · optional</Text>
          <input
            className={inputClass}
            type='number'
            step='0.01'
            min='0'
            value={ret}
            onChange={(e) => setRet(e.target.value)}
            placeholder='0.00'
          />
        </label>
      </div>
    </ConfirmationModal>
  );
}
