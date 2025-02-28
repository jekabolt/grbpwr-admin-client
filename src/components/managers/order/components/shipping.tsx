import { common_OrderFull } from 'api/proto-http/frontend';
import { useDictionaryStore } from 'lib/stores/store';
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

export function ShippingBuyer({
  orderDetails,
  isPrinting,
  orderStatus,
  isEdit,
  trackingNumber,
  toggleTrackNumber,
  handleTrackingNumberChange,
  saveTrackingNumber,
}: Props) {
  const { dictionary } = useDictionaryStore();
  const shipping = orderDetails?.shipping?.addressInsert;

  return (
    <div className='w-full'>
      {shipping && (
        <div className='grid gap-2 w-full'>
          <Text variant='uppercase' className='font-bold'>
            shipping:
          </Text>
          <Shipping shipping={shipping} />
          <Text variant='uppercase' size='small'>
            {`cost: ${orderDetails?.shipment?.cost?.value} ${dictionary?.baseCurrency}`}
          </Text>
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
      )}
    </div>
  );
}
