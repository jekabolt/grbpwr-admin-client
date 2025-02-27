import { Button, Grid2 as Grid, Typography } from '@mui/material';
import { common_OrderFull } from 'api/proto-http/frontend';
import { useState } from 'react';
import { Shipping } from './shipping-buyer-information/shipping';

interface Props {
  orderDetails: common_OrderFull | undefined;
}
export function Billing({ orderDetails }: Props) {
  const billing = orderDetails?.billing?.addressInsert;
  const [showBilling, setShowBilling] = useState(false);
  return (
    <Grid container>
      {showBilling ? (
        <Grid container>
          <Grid size={{ xs: 12 }}>
            <Typography
              variant='overline'
              fontSize='14px'
              fontWeight='bold'
              textTransform='uppercase'
            >
              billing address:
            </Typography>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Shipping shipping={billing} />
          </Grid>
        </Grid>
      ) : (
        <Button
          onClick={() => setShowBilling(true)}
          sx={{ textTransform: 'uppercase' }}
          variant='contained'
        >
          show billing info
        </Button>
      )}
    </Grid>
  );
}
