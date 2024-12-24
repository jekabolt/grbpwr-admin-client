import { Button, Grid2 as Grid, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useMatch } from '@tanstack/react-location';
import { Layout } from 'components/login/layout';
import { useState } from 'react';
import { DisplayState, OrderDetailsPathProps } from '../interfaces/interface';
import { useOrderDetails } from '../utility/use-order-details';
import { Billing } from './components/billing';
import { Description } from './components/description';
import { OrderDetailsData } from './components/order-details-data';
import { Payment } from './components/payment';
import { PromoApplied } from './components/promo-applied';
import { ShippingBuyer } from './components/shipping-buyer';
import { NewTrackCode } from './components/shipping-buyer-information/new-track-code';

export function OrderDetails() {
  const {
    params: { uuid },
  } = useMatch<OrderDetailsPathProps>();

  const {
    orderDetails,
    dictionary,
    orderStatus,
    isPrinting,
    isLoading,
    isEdit,
    trackingNumber,
    fetchOrderDetails,
    toggleTrackNumber,
    handleTrackingNumberChange,
    saveTrackingNumber,
    markAsDelivered,
    refundOrder,
  } = useOrderDetails(uuid);

  const [displayState, setDisplayState] = useState<DisplayState>({
    showBilling: false,
    page: 0,
    pageSize: 5,
    columnVisibility: {
      thumbnail: true,
      size: true,
    },
  });

  return (
    <Layout>
      <Grid
        container
        spacing={2}
        sx={{
          '& .MuiTypography-root': {
            lineHeight: 0,
          },
          p: 1,
        }}
        justifyContent='center'
        alignItems='center'
      >
        <Grid size={{ xs: 12 }}>
          <Description orderDetails={orderDetails} orderStatus={orderStatus} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <DataGrid
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
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <PromoApplied orderDetails={orderDetails} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Payment orderDetails={orderDetails} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <ShippingBuyer
            orderDetails={orderDetails}
            dictionary={dictionary}
            isPrinting={isPrinting}
            orderStatus={orderStatus}
            isEdit={isEdit}
            trackingNumber={trackingNumber}
            toggleTrackNumber={toggleTrackNumber}
            handleTrackingNumberChange={handleTrackingNumberChange}
            saveTrackingNumber={saveTrackingNumber}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Billing orderDetails={orderDetails} />
        </Grid>
        {orderStatus === 'CONFIRMED' && !orderDetails?.shipment?.trackingCode && (
          <Grid size={{ xs: 12 }}>
            <NewTrackCode
              trackingNumber={trackingNumber}
              handleTrackingNumberChange={handleTrackingNumberChange}
              saveTrackingNumber={saveTrackingNumber}
            />
          </Grid>
        )}
        {orderStatus === 'SHIPPED' && (
          <Grid size={{ xs: 12 }}>
            <Button
              onClick={markAsDelivered}
              variant='contained'
              sx={{ textTransform: 'uppercase' }}
            >
              mark as delivered
            </Button>
          </Grid>
        )}
        {orderStatus === 'CONFIRMED' ||
          (orderStatus === 'DELIVERED' && (
            <Grid size={{ xs: 12 }}>
              <Button onClick={refundOrder} variant='contained' sx={{ textTransform: 'uppercase' }}>
                refund order
              </Button>
            </Grid>
          ))}

        <Grid size={{ xs: 12 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Typography variant='overline' textTransform='uppercase' fontSize={14} fontWeight='bold'>
            {`Total: ${orderDetails?.order?.totalPrice?.value} ${dictionary?.baseCurrency}`}
          </Typography>
        </Grid>
      </Grid>
    </Layout>
  );
}
