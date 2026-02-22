import { common_OrderFull } from 'api/proto-http/admin';
import { REASONS } from 'constants/constants';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

export function RefundConfirmation({
  orderDetails,
  open,
  selectedProductIds,
  onOpenChange,
  refundOrder,
}: {
  orderDetails?: common_OrderFull;
  open: boolean;
  selectedProductIds: number[];
  onOpenChange: (open: boolean) => void;
  refundOrder: (reason?: string) => void;
}) {
  const isFullRefund = !selectedProductIds.length;
  const existingReason = orderDetails?.order?.refundReason ?? '';
  const [selectedReason, setSelectedReason] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedReason(existingReason);
    } else {
      setSelectedReason('');
    }
  }, [open, existingReason]);

  const handleRefundConfirm = () => {
    refundOrder(isFullRefund ? selectedReason : undefined);
  };

  const canConfirm = !isFullRefund || selectedReason.length > 0;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleRefundConfirm}
      confirmDisabled={!canConfirm}
    >
      <div className='flex flex-col items-center justify-center gap-6'>
        <Text variant='uppercase' className='font-bold whitespace-nowrap'>
          are you sure you want to {selectedProductIds.length ? 'partial' : 'full'} refund this
          order?
        </Text>
        {isFullRefund && (
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
        )}
      </div>
    </ConfirmationModal>
  );
}
