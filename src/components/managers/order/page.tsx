// import { DataGrid } from '@mui/x-data-grid';
import { useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Logo } from 'ui/icons/logo';
import { Buyer } from './components/buyer';
import { Description } from './components/description';
import { OrderTable } from './components/order-table';
import { Payment } from './components/payment';
import { PromoApplied } from './components/promo-applied';
import { ShippingBillingToggle } from './components/shipping-billing-toggle';
import { NewTrackCode } from './components/shipping-information/new-track-code';
import { useOrderDetails } from './utility';

export function OrderDetails() {
  const { uuid } = useParams<{ uuid: string }>();

  const {
    orderDetails,
    dictionary,
    orderStatus,
    isPrinting,
    isEdit,
    trackingNumber,
    toggleTrackNumber,
    handleTrackingNumberChange,
    saveTrackingNumber,
    markAsDelivered,
    refundOrder,
  } = useOrderDetails(uuid || '');

  return (
    <div className='flex flex-col gap-4 w-full'>
      {isPrinting && (
        <div className='self-start h-10 pt-2'>
          <Logo />
        </div>
      )}
      <div className='flex flex-col gap-4'>
        <Description orderDetails={orderDetails} orderStatus={orderStatus} isPrinting />
        <OrderTable orderDetails={orderDetails} isPrinting={isPrinting} />
        <Text variant='uppercase' className='font-bold self-end'>
          {`Total: ${orderDetails?.order?.totalPrice?.value} ${dictionary?.baseCurrency}`}
        </Text>
        <div className='block print:hidden'>
          <PromoApplied orderDetails={orderDetails} />
        </div>
        <div className='flex gap-10 lg:gap-0 lg:flex-row flex-col lg:items-end lg:justify-between w-full'>
          <Payment orderDetails={orderDetails} isPrinting={isPrinting} />
          <ShippingBillingToggle
            orderDetails={orderDetails}
            isPrinting={isPrinting}
            orderStatus={orderStatus}
            isEdit={isEdit}
            trackingNumber={trackingNumber}
            toggleTrackNumber={toggleTrackNumber}
            handleTrackingNumberChange={handleTrackingNumberChange}
            saveTrackingNumber={saveTrackingNumber}
          />
          <Buyer buyer={orderDetails?.buyer?.buyerInsert} isPrinting={isPrinting} />
        </div>
      </div>
      {orderStatus === 'CONFIRMED' && !orderDetails?.shipment?.trackingCode && (
        <NewTrackCode
          isPrinting={isPrinting}
          trackingNumber={trackingNumber}
          handleTrackingNumberChange={handleTrackingNumberChange}
          saveTrackingNumber={saveTrackingNumber}
        />
      )}
      {orderStatus === 'SHIPPED' && (
        <Button variant='main' size='lg' className='block print:hidden' onClick={markAsDelivered}>
          mark as delivered
        </Button>
      )}
      {orderStatus === 'CONFIRMED' ||
        (orderStatus === 'DELIVERED' && (
          <Button variant='main' size='lg' className='block print:hidden' onClick={refundOrder}>
            refund order
          </Button>
        ))}
      <Text variant='uppercase' className='font-bold hidden print:block'>
        If you have any questions, please send an email to customercare@grbpwr.com
      </Text>
    </div>
  );
}
