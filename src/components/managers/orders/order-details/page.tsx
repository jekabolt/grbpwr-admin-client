import { Grid2 as Grid } from '@mui/material';
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
        }}
        justifyContent='center'
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
      </Grid>
    </Layout>
  );
}
