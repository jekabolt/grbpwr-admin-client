// import { DataGrid } from '@mui/x-data-grid';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Logo } from 'ui/icons/logo';
import { Billing } from './components/billing';
import { Buyer } from './components/buyer';
import { Description } from './components/description';
import { Payment } from './components/payment';
import { PromoApplied } from './components/promo-applied';
import { ShippingBuyer } from './components/shipping';
import { NewTrackCode } from './components/shipping-information/new-track-code';
import { DisplayState } from './interface';
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

  const [displayState, setDisplayState] = useState<DisplayState>({
    showBilling: false,
    page: 0,
    pageSize: 5,
    columnVisibility: {
      thumbnail: true,
      size: true,
    },
  });

  useEffect(() => {
    setDisplayState((prev) => ({
      ...prev,
      columnVisibility: { thumbnail: !isPrinting, size: !isPrinting },
    }));
  }, [isPrinting]);

  return (
    <div className='flex flex-col gap-4'>
      {isPrinting && (
        <div className='self-start h-10 pt-2'>
          <Logo />
        </div>
      )}

      <Description orderDetails={orderDetails} orderStatus={orderStatus} isPrinting />

      {/* <DataGrid
        rows={orderDetails?.orderItems || []}
        columns={OrderDetailsData(dictionary, isPrinting)}
        columnVisibilityModel={displayState.columnVisibility}
        rowSelection={false}
        paginationModel={
          isPrinting
            ? {
                page: displayState.page,
                pageSize: orderDetails?.orderItems?.length || displayState.pageSize,
              }
            : { page: displayState.page, pageSize: displayState.pageSize }
        }
        pageSizeOptions={[5, 10, 20]}
        rowHeight={100}
        hideFooterPagination={isPrinting}
        hideFooter={isPrinting}
      /> */}

      <div
        className={cn('block', {
          hidden: isPrinting,
        })}
      >
        <PromoApplied orderDetails={orderDetails} />
      </div>

      <div
        className={cn('flex flex-col lg:flex-row justify-between gap-4', {
          'flex-row items-start': isPrinting,
        })}
      >
        <Payment orderDetails={orderDetails} isPrinting={isPrinting} />
        <ShippingBuyer
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

      <Billing orderDetails={orderDetails} isPrinting={isPrinting} />

      {orderStatus === 'CONFIRMED' && !orderDetails?.shipment?.trackingCode && (
        <NewTrackCode
          isPrinting={isPrinting}
          trackingNumber={trackingNumber}
          handleTrackingNumberChange={handleTrackingNumberChange}
          saveTrackingNumber={saveTrackingNumber}
        />
      )}
      {orderStatus === 'SHIPPED' && (
        // className={styles.hide_cell}
        <Button onClick={markAsDelivered}>mark as delivered</Button>
      )}
      {orderStatus === 'CONFIRMED' ||
        (orderStatus === 'DELIVERED' && (
          // className={styles.hide_cell}
          <Button onClick={refundOrder}>refund order</Button>
        ))}

      <Text variant='uppercase' className='font-bold self-end'>
        {`Total: ${orderDetails?.order?.totalPrice?.value} ${dictionary?.baseCurrency}`}
      </Text>

      <Text variant='uppercase' size='small' className='font-bold'>
        If you have any questions, please send an email to customercare@grbpwr.com
      </Text>
    </div>
  );
}
