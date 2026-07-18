import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

const inputClass = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// Record the real carrier invoice so contribution margin uses actual logistics instead
// of the quoted rate. Prefilled from the order's current actualCost/returnShippingCost
// (common.Shipment) so re-opening this no longer starts blank — the operator sees what's
// already recorded and is knowingly editing it, not blind-resubmitting.
export function ShipmentCostModal({
  open,
  onOpenChange,
  onSubmit,
  currentActualCost,
  currentReturnShippingCost,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (actualCost: string, returnShippingCost?: string) => void;
  // Currently recorded values (EUR) from the order's shipment, used to prefill the form.
  currentActualCost?: string;
  currentReturnShippingCost?: string;
}) {
  const { dictionary } = useDictionary();
  const base = dictionary?.baseCurrency || 'EUR';
  const [actual, setActual] = useState(currentActualCost ?? '');
  const [ret, setRet] = useState(currentReturnShippingCost ?? '');
  const hasExisting = !!currentActualCost;

  // Re-sync from the order's current values every time the modal opens (or those values
  // change under it) instead of always starting blank — this is what lets the operator see
  // what's already recorded before overwriting it.
  useEffect(() => {
    if (open) {
      setActual(currentActualCost ?? '');
      setRet(currentReturnShippingCost ?? '');
    }
  }, [open, currentActualCost, currentReturnShippingCost]);

  const submit = () => {
    if (!actual.trim()) return;
    onSubmit(actual, ret);
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      title='actual shipping cost'
      confirmLabel={hasExisting ? 'save' : 'record'}
      confirmDisabled={!actual.trim()}
    >
      <div className='flex min-w-[min(90vw,22rem)] flex-col gap-3'>
        <Text variant='inactive' size='small'>
          Real carrier invoice ({base}). Feeds contribution margin — shown on the order summary once
          recorded.
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
