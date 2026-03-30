import { common_OrderFull } from 'api/proto-http/admin';
import { REASONS } from 'constants/constants';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Checkbox from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

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
  refundOrder: (payload: { reason: string; refundShipping?: boolean }) => void;
}) {
  const isFullRefund = !selectedUnitKeys.length;
  const existingReason = orderDetails?.order?.refundReason ?? '';
  const [selectedReason, setSelectedReason] = useState('');
  const [refundShipping, setRefundShipping] = useState(false);

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
    refundOrder(
      isFullRefund ? { reason: selectedReason } : { reason: selectedReason, refundShipping },
    );
  };

  const canConfirm = selectedReason.length > 0;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleRefundConfirm}
      confirmDisabled={!canConfirm}
    >
      <div className='flex flex-col items-center justify-center gap-6'>
        <Text variant='uppercase' className='font-bold whitespace-nowrap'>
          are you sure you want to {selectedUnitKeys.length ? 'partial' : 'full'} refund this order?
        </Text>
        {!isFullRefund && (
          <label htmlFor='refund-shipping' className='flex items-center gap-2 cursor-pointer'>
            <Checkbox
              name='refund-shipping'
              checked={refundShipping}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                setRefundShipping(checked === true)
              }
            />
            <Text variant='uppercase' className='font-bold'>
              include shipping fee in refund
            </Text>
          </label>
        )}
        <div className='flex flex-col gap-2'>
          {existingReason && (
            <Text variant='uppercase' className='font-bold'>
              current refund reason: {existingReason}
            </Text>
          )}
          <Text variant='uppercase' className='font-bold'>
            {existingReason ? 'change refund reason:' : 'refund reason:'}
          </Text>
          <div className='grid grid-cols-2 justify-center gap-3 w-full '>
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
