import { Pencil2Icon } from '@radix-ui/react-icons';
import { common_OrderFull } from 'api/proto-http/frontend';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { NewTrackCode } from './new-track-code';

interface Props {
  isEdit: boolean;
  isPrinting: boolean;
  trackingNumber: string;
  orderStatus: string;
  orderDetails: common_OrderFull | undefined;
  toggleTrackNumber: () => void;
  handleTrackingNumberChange: (event: any) => void;
  saveTrackingNumber: () => void;
}

export function TrackingNumber({
  isEdit,
  isPrinting,
  trackingNumber,
  orderStatus,
  orderDetails,
  toggleTrackNumber,
  handleTrackingNumberChange,
  saveTrackingNumber,
}: Props) {
  return (
    <>
      {orderDetails?.shipment?.trackingCode && (
        <div>
          {isEdit && !isPrinting ? (
            <NewTrackCode
              isPrinting={isPrinting}
              trackingNumber={trackingNumber}
              handleTrackingNumberChange={handleTrackingNumberChange}
              saveTrackingNumber={saveTrackingNumber}
            />
          ) : (
            !isPrinting && (
              <Text variant='uppercase' size='small'>
                {[
                  `tracking number: ${orderDetails?.shipment?.trackingCode} `,
                  orderStatus === 'SHIPPED' && (
                    <Button onClick={toggleTrackNumber} size='sm'>
                      <Pencil2Icon />
                    </Button>
                  ),
                ]}
              </Text>
            )
          )}
        </div>
      )}
    </>
  );
}
