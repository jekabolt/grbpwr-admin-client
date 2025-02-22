import { Button, Grid2 as Grid, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Logo } from 'ui/icons/logo';
import { Layout } from 'ui/layout';
import { DisplayState } from '../interfaces/interface';
import { useOrderDetails } from '../utility/use-order-details';
import { Billing } from './components/billing';
import { Description } from './components/description';
import { OrderDetailsData } from './components/order-details-data';
import { Payment } from './components/payment';
import { PromoApplied } from './components/promo-applied';
import { ShippingBuyer } from './components/shipping-buyer';
import { NewTrackCode } from './components/shipping-buyer-information/new-track-code';

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
    <Layout>
      <Grid
        container
        spacing={2}
        sx={{
          '& .MuiTypography-root': {
            lineHeight: 0,
          },
          p: isPrinting ? 0 : 2,
        }}
        justifyContent='center'
        alignItems='center'
      >
        {isPrinting && (
          <Grid size={{ xs: 12 }}>
            <Logo />
          </Grid>
        )}
        <Grid size={{ xs: 12 }}>
          <Description orderDetails={orderDetails} orderStatus={orderStatus} isPrinting />
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
        <Grid
          size={{ xs: 12 }}
          // className={styles.hide_cell}
        >
          <PromoApplied orderDetails={orderDetails} />
        </Grid>
        <Grid
          size={{ xs: 12 }}
          // className={styles.hide_cell}
        >
          <Payment orderDetails={orderDetails} />
        </Grid>
        <Grid size={{ xs: 12 }}>
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
        </Grid>
        <Grid
          size={{ xs: 12 }}
          // className={styles.hide_cell}
        >
          <Billing orderDetails={orderDetails} />
        </Grid>
        {orderStatus === 'CONFIRMED' && !orderDetails?.shipment?.trackingCode && (
          <Grid
            size={{ xs: 12 }}
            // className={styles.hide_cell}
          >
            <NewTrackCode
              trackingNumber={trackingNumber}
              handleTrackingNumberChange={handleTrackingNumberChange}
              saveTrackingNumber={saveTrackingNumber}
            />
          </Grid>
        )}
        {orderStatus === 'SHIPPED' && (
          <Grid
            size={{ xs: 12 }}
            // className={styles.hide_cell}
          >
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
            <Grid
              size={{ xs: 12 }}
              // className={styles.hide_cell}
            >
              <Button onClick={refundOrder} variant='contained' sx={{ textTransform: 'uppercase' }}>
                refund order
              </Button>
            </Grid>
          ))}
        <Grid size={{ xs: 12 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Typography variant='overline' textTransform='uppercase' fontSize={16} fontWeight='bold'>
            {`Total: ${orderDetails?.order?.totalPrice?.value} ${dictionary?.baseCurrency}`}
          </Typography>
        </Grid>
        <Grid
          size={{ xs: 12 }}
          // className={styles.support}
        >
          <Typography variant='overline' textTransform='uppercase' fontWeight='bold'>
            If you have any questions, please send an email to customercare@grbpwr.com
          </Typography>
        </Grid>
      </Grid>
    </Layout>
  );
}
