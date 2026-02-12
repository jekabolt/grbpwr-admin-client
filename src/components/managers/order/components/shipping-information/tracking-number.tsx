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
        <div className='w-full'>
          {isEdit && !isPrinting ? (
            <div className='flex items-center gap-2'>
              <NewTrackCode
                isPrinting={isPrinting}
                trackingNumber={trackingNumber}
                handleTrackingNumberChange={handleTrackingNumberChange}
                saveTrackingNumber={saveTrackingNumber}
              />
              <Button
                variant='main'
                className='cursor-pointer'
                size='lg'
                onClick={toggleTrackNumber}
              >
                close
              </Button>
            </div>
          ) : (
            !isPrinting && (
              <div className='flex items-center gap-2'>
                <Text variant='uppercase'>
                  tracking number: {orderDetails?.shipment?.trackingCode}
                </Text>
                {orderStatus === 'SHIPPED' && (
                  <Button
                    variant='main'
                    className='px-1 cursor-pointer'
                    onClick={toggleTrackNumber}
                  >
                    edit
                  </Button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </>
  );
}
