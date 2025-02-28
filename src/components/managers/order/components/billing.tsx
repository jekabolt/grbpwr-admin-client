import { common_OrderFull } from 'api/proto-http/frontend';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Shipping } from './shipping-information/shipping';

interface Props {
  isPrinting: boolean;
  orderDetails: common_OrderFull | undefined;
}
export function Billing({ orderDetails, isPrinting }: Props) {
  const billing = orderDetails?.billing?.addressInsert;
  const [showBilling, setShowBilling] = useState(false);
  return (
    <div
      className={cn('block', {
        hidden: isPrinting,
      })}
    >
      {showBilling ? (
        <div className='space-y-2'>
          <Text variant='uppercase' className='font-bold'>
            billing address:
          </Text>

          <Shipping shipping={billing} />
        </div>
      ) : (
        <Button onClick={() => setShowBilling(!showBilling)} size='lg'>
          show billing info
        </Button>
      )}
    </div>
  );
}
