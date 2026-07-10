import { common_OrderFull, type RefundReason } from 'api/proto-http/admin';
import { REASONS } from 'constants/constants';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Checkbox from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

// Maps the free-text refund reasons to the structured RefundReason enum, which drives the
// return-analysis breakdown. Anything unmapped falls back to OTHER.
const REFUND_REASON_CODE: Record<string, RefundReason> = {
  'size issues': 'REFUND_REASON_WRONG_SIZE',
  'damaged or defective': 'REFUND_REASON_DEFECTIVE',
  'wrong item received': 'REFUND_REASON_NOT_AS_DESCRIBED',
  'item does not match description': 'REFUND_REASON_NOT_AS_DESCRIBED',
  'quality not as expected': 'REFUND_REASON_NOT_AS_DESCRIBED',
  'changed my mind': 'REFUND_REASON_CHANGED_MIND',
  'ordered by mistake': 'REFUND_REASON_CHANGED_MIND',
};

function reasonCodeFor(reason: string): RefundReason {
  return REFUND_REASON_CODE[reason.trim().toLowerCase()] ?? 'REFUND_REASON_OTHER';
}

export function RefundConfirmation({
  orderDetails,
  open,
  selectedUnitKeys,
  onOpenChange,
  refundOrder,
}: {
  orderDetails?: common_OrderFull;
  open: boolean;
  selectedUnitKeys: string[];
  onOpenChange: (open: boolean) => void;
  refundOrder: (payload: {
    reason: string;
    refundShipping?: boolean;
    reasonCode?: RefundReason;
  }) => void;
}) {
  const isFullRefund = !selectedUnitKeys.length;
  const existingReason = orderDetails?.order?.refundReason ?? '';
  const [selectedReason, setSelectedReason] = useState('');
  const [refundShipping, setRefundShipping] = useState(false);

  // Units selected for partial refund, grouped per order line (qty = how many of that item).
  const selectedSummary = useMemo(() => {
    const counts = new Map<number, number>();
    selectedUnitKeys.forEach((k) => {
      const id = parseInt(k.split('-')[0], 10);
      if (!Number.isNaN(id)) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([id, qty]) => {
      const item = orderDetails?.orderItems?.find((oi) => oi.id === id);
      return { id, qty, name: item?.translations?.[0]?.name ?? `item ${id}` };
    });
  }, [selectedUnitKeys, orderDetails?.orderItems]);

  useEffect(() => {
    if (open) {
      setSelectedReason(existingReason);
      setRefundShipping(false);
    } else {
      setSelectedReason('');
      setRefundShipping(false);
    }
  }, [open, existingReason]);

  const handleRefundConfirm = () => {
    const reasonCode = reasonCodeFor(selectedReason);
    refundOrder(
      isFullRefund
        ? { reason: selectedReason, reasonCode }
        : { reason: selectedReason, refundShipping, reasonCode },
    );
  };

  const canConfirm = selectedReason.length > 0;

  const order = orderDetails?.order;
  const currency = order?.currency ?? '';
  const total = order?.totalPrice?.value;
  const unitCount = selectedUnitKeys.length;
  const confirmLabel = isFullRefund
    ? `refund whole order${total ? ` · ${total} ${currency}` : ''}`
    : `refund ${unitCount} unit${unitCount === 1 ? '' : 's'}`;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleRefundConfirm}
      title={isFullRefund ? 'full refund' : 'partial refund'}
      confirmLabel={confirmLabel}
      cancelLabel='cancel'
      confirmDisabled={!canConfirm}
    >
      <div className='flex flex-col gap-4 lg:w-[420px]'>
        {/* Scope — full refund is loud, partial lists exactly what's affected */}
        {isFullRefund ? (
          <div className='space-y-1 border border-error p-3'>
            <Text variant='error' className='font-bold'>
              full refund — entire order
            </Text>
            <Text size='small'>
              Refunds ALL items{total ? ` (${total} ${currency})` : ''} including shipping. This
              can’t be undone. To refund only some units, close this and tick them in the items
              table.
            </Text>
          </div>
        ) : (
          <div className='space-y-2 border border-textColor p-3'>
            <Text variant='uppercase' className='font-bold'>
              partial refund — {unitCount} unit{unitCount === 1 ? '' : 's'}
            </Text>
            <div className='space-y-1'>
              {selectedSummary.map((s) => (
                <div key={s.id} className='flex items-center justify-between gap-3'>
                  <Text size='small'>{s.name}</Text>
                  <Text size='small'>×{s.qty}</Text>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isFullRefund && (
          <label htmlFor='refund-shipping' className='flex items-center gap-2 cursor-pointer'>
            <Checkbox
              name='refund-shipping'
              checked={refundShipping}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                setRefundShipping(checked === true)
              }
            />
            <Text variant='uppercase'>include shipping fee in refund</Text>
          </label>
        )}

        <div className='flex flex-col gap-2'>
          {existingReason && (
            <Text variant='inactive' size='small'>
              current reason: {existingReason}
            </Text>
          )}
          <Text variant='uppercase'>refund reason {canConfirm ? '' : '(required)'}</Text>
          <div className='grid grid-cols-2 gap-2'>
            {REASONS.map((l, i) => (
              <Button
                key={i}
                type='button'
                size='lg'
                className={cn('border border-textColor uppercase', {
                  'bg-textColor text-bgColor': selectedReason === l,
                })}
                onClick={() => setSelectedReason(l)}
              >
                {l}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </ConfirmationModal>
  );
}
