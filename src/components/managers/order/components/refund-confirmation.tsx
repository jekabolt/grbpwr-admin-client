import { common_OrderFull } from 'api/proto-http/admin';
import { REASONS } from 'constants/constants';
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
  refundOrder: () => void;
}) {
  const handleRefundConfirm = () => {
    refundOrder();
  };
  return (
    <ConfirmationModal open={open} onOpenChange={onOpenChange} onConfirm={handleRefundConfirm}>
      <div className='flex flex-col items-center justify-center gap-6'>
        <Text variant='uppercase' className='font-bold whitespace-nowrap'>
          are you sure you want to {selectedProductIds.length ? 'partial' : 'full'} refund this
          order?
        </Text>
        {!selectedProductIds.length && (
          <div className='flex flex-col gap-2'>
            <Text variant='uppercase' className='font-bold'>
              refund reason:
            </Text>
            <div className='grid grid-cols-2 justify-center gap-3 w-full '>
              {REASONS.map((l, i) => (
                <Button
                  key={i}
                  type='button'
                  size='lg'
                  className='border border-textColor uppercase'
                  disabled={orderDetails?.order?.refundReason !== l}
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
