import { common_OrderFull } from 'api/proto-http/frontend';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { Shipping } from './shipping-information/shipping';
import { TrackingNumber } from './shipping-information/tracking-number';

interface Props {
  orderDetails: common_OrderFull | undefined;
  isPrinting: boolean;
  orderStatus: string | undefined;
  isEdit: boolean;
  canEdit?: boolean;
  trackingNumber: string;
  toggleTrackNumber: () => void;
  handleTrackingNumberChange: (event: any) => void;
  saveTrackingNumber: () => void;
}

/**
 * ordAddr v2 — both addresses side by side, no toggle. Ship-to is what the packer reads
 * and bill-to is what the invoice needs, so hiding one behind a button only ever hid the
 * one you wanted. When billing equals shipping the second column says so rather than
 * printing the same lines twice. Tracking-number edit (ordActions) rides underneath, kept
 * exactly as it was.
 */
export function ShippingBillingToggle({
  orderDetails,
  isPrinting,
  orderStatus,
  isEdit,
  canEdit = true,
  trackingNumber,
  toggleTrackNumber,
  handleTrackingNumberChange,
  saveTrackingNumber,
}: Props) {
  const shipping = orderDetails?.shipping?.addressInsert;
  const billing = orderDetails?.billing?.addressInsert;
  const sameAsShipping =
    !!shipping && !!billing && JSON.stringify(shipping) === JSON.stringify(billing);

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        {shipping && (
          <div className='space-y-1'>
            <GroupLabel>ship to</GroupLabel>
            <Shipping shipping={shipping} />
          </div>
        )}
        {billing && (
          <div className='space-y-1'>
            <GroupLabel>bill to</GroupLabel>
            {sameAsShipping ? (
              <Text size='micro' variant='label'>
                same as shipping
              </Text>
            ) : (
              <Shipping shipping={billing} />
            )}
          </div>
        )}
      </div>

      <TrackingNumber
        isEdit={isEdit}
        isPrinting={isPrinting}
        canEdit={canEdit}
        trackingNumber={trackingNumber}
        orderStatus={orderStatus || ''}
        orderDetails={orderDetails}
        toggleTrackNumber={toggleTrackNumber}
        handleTrackingNumberChange={handleTrackingNumberChange}
        saveTrackingNumber={saveTrackingNumber}
      />
    </div>
  );
}
