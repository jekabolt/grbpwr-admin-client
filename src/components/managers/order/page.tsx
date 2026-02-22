// import { DataGrid } from '@mui/x-data-grid';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Logo } from 'ui/icons/logo';
import { Buyer } from './components/buyer';
import { Comment } from './components/comment';
import { Description } from './components/description';
import { OrderTable } from './components/order-table';
import { Payment } from './components/payment';
import { PromoApplied } from './components/promo-applied';
import { RefundConfirmation } from './components/refund-confirmation';
import { ShippingBillingToggle } from './components/shipping-billing-toggle';
import { NewTrackCode } from './components/shipping-information/new-track-code';
import { useOrderDetails } from './utility';

const DISPLAY_REFUND_BUTTON_STATUSES = [
  'CONFIRMED',
  'DELIVERED',
  'PENDING RETURN',
  'REFUND IN PROGRESS',
];

export function OrderDetails() {
  const { uuid } = useParams<{ uuid: string }>();

  const {
    orderDetails,
    orderStatus,
    isPrinting,
    isEdit,
    trackingNumber,
    selectedProductIds,
    toggleTrackNumber,
    handleTrackingNumberChange,
    saveTrackingNumber,
    markAsDelivered,
    refundOrder,
    toggleOrderItemsSelection,
  } = useOrderDetails(uuid || '');

  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  const form = useForm<{ refundReason: string; notes: string }>({
    defaultValues: { refundReason: '', notes: '' },
  });

  const handleRefundClick = () => {
    setIsRefundModalOpen(true);
  };

  const handleRefundConfirm = (reason?: string) => {
    refundOrder(reason);
  };

  return (
    <FormProvider {...form}>
      <div className='flex flex-col gap-4 w-full pb-16'>
        <div className='self-start h-10 print:block hidden'>
          <Logo />
        </div>

        <div className='flex flex-col gap-4'>
          <Description orderDetails={orderDetails} orderStatus={orderStatus} isPrinting />
          <OrderTable
            orderDetails={orderDetails}
            isPrinting={isPrinting}
            showRefundSelection={
              DISPLAY_REFUND_BUTTON_STATUSES.includes(orderStatus || '') &&
              !['CONFIRMED'].includes(orderStatus || '')
            }
            selectedProductIds={selectedProductIds}
            onToggleOrderItems={toggleOrderItemsSelection}
          />
          <Text variant='uppercase' className='font-bold self-end'>
            {`Total: ${orderDetails?.order?.totalPrice?.value} ${orderDetails?.order?.currency}`}
          </Text>
          {(orderStatus === 'PARTIALLY REFUNDED' || orderStatus === 'REFUNDED') && (
            <Text variant='uppercase' className='font-bold self-end'>
              {`refunded amount: ${orderDetails?.order?.refundedAmount?.value} ${orderDetails?.order?.currency}`}
            </Text>
          )}
          <Text variant='uppercase' className='font-bold self-end'>
            shipping cost: {orderDetails?.shipment?.cost?.value} {orderDetails?.order?.currency}
          </Text>
          <div className='block self-end print:hidden'>
            <PromoApplied orderDetails={orderDetails} />
          </div>
          {orderDetails?.order?.refundReason && (
            <Text variant='uppercase' className='font-bold self-end'>
              refund reason: {orderDetails?.order?.refundReason}
            </Text>
          )}
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
          <div className='w-full lg:w-1/4'>
            <NewTrackCode
              isPrinting={isPrinting}
              trackingNumber={trackingNumber}
              handleTrackingNumberChange={handleTrackingNumberChange}
              saveTrackingNumber={saveTrackingNumber}
            />
          </div>
        )}
        <div className='block print:hidden'>
          <Comment orderDetails={orderDetails} />
        </div>

        {orderStatus === 'SHIPPED' && (
          <div className='fixed right-2.5 bottom-2.5 print:hidden'>
            <Button variant='main' size='lg' onClick={markAsDelivered}>
              mark as delivered
            </Button>
          </div>
        )}
        {DISPLAY_REFUND_BUTTON_STATUSES.includes(orderStatus || '') && (
          <div className='fixed right-2.5 bottom-2.5 print:hidden'>
            <Button variant='main' size='lg' onClick={handleRefundClick}>
              refund order
            </Button>
          </div>
        )}
        <RefundConfirmation
          orderDetails={orderDetails}
          open={isRefundModalOpen}
          selectedProductIds={selectedProductIds}
          onOpenChange={setIsRefundModalOpen}
          refundOrder={handleRefundConfirm}
        />
      </div>
      {createPortal(
        <Text
          variant='uppercase'
          className='font-bold hidden print:block print:absolute print:bottom-0 print:inset-x-0'
        >
          If you have any questions, please send an email to customercare@grbpwr.com
        </Text>,
        document.body,
      )}
    </FormProvider>
  );
}
