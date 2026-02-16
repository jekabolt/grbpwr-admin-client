import { common_OrderFull } from 'api/proto-http/frontend';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Shipping } from './shipping-information/shipping';
import { TrackingNumber } from './shipping-information/tracking-number';

interface Props {
  orderDetails: common_OrderFull | undefined;
  isPrinting: boolean;
  orderStatus: string | undefined;
  isEdit: boolean;
  trackingNumber: string;
  toggleTrackNumber: () => void;
  handleTrackingNumberChange: (event: any) => void;
  saveTrackingNumber: () => void;
}

export function ShippingBillingToggle({
  orderDetails,
  isPrinting,
  orderStatus,
  isEdit,
  trackingNumber,
  toggleTrackNumber,
  handleTrackingNumberChange,
  saveTrackingNumber,
}: Props) {
  const { dictionary } = useDictionary();
  const [showBilling, setShowBilling] = useState(false);

  const shipping = orderDetails?.shipping?.addressInsert;
  const billing = orderDetails?.billing?.addressInsert;

  return (
    <div>
      <div className='flex gap-2 mb-4 print:hidden'>
        <Button
          onClick={() => setShowBilling(false)}
          variant={!showBilling ? 'main' : 'simpleReverse'}
          className='p-1'
        >
          Shipping
        </Button>
        <Button
          onClick={() => setShowBilling(true)}
          variant={showBilling ? 'main' : 'simpleReverse'}
          className='p-1'
        >
          Billing
        </Button>
      </div>

      {!showBilling
        ? shipping && (
            <div className='grid gap-2 w-full'>
              <Text variant='uppercase' className='font-bold'>
                shipping:
              </Text>
              <Shipping shipping={shipping} />
            </div>
          )
        : billing && (
            <div className='grid gap-2 w-full'>
              <Text variant='uppercase' className='font-bold'>
                billing address:
              </Text>
              <Shipping shipping={billing} />
            </div>
          )}
      <div className='border-t-2 border-textColor'>
        <Text variant='uppercase'>
          {`cost: ${orderDetails?.shipment?.cost?.value} ${dictionary?.baseCurrency}`}
        </Text>
        <div className='w-full'>
          <TrackingNumber
            isEdit={isEdit}
            isPrinting={isPrinting}
            trackingNumber={trackingNumber}
            orderStatus={orderStatus || ''}
            orderDetails={orderDetails}
            toggleTrackNumber={toggleTrackNumber}
            handleTrackingNumberChange={handleTrackingNumberChange}
            saveTrackingNumber={saveTrackingNumber}
          />
        </div>
      </div>
    </div>
  );
}
