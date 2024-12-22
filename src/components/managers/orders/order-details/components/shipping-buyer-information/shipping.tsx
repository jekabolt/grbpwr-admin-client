import { Grid2 as Grid, Typography } from '@mui/material';
import { common_AddressInsert, common_Dictionary, common_OrderFull } from 'api/proto-http/frontend';

interface Props {
  shipping: common_AddressInsert | undefined;
  orderDetails: common_OrderFull | undefined;
  dictionary: common_Dictionary | undefined;
}

export function Shipping({ shipping, orderDetails, dictionary }: Props) {
  return (
    <Grid container>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`street adress: ${shipping?.addressLineOne}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`city: ${shipping?.city}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`state: ${shipping?.state}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`country: ${shipping?.country}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`postal code: ${shipping?.postalCode}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`cost: ${orderDetails?.shipment?.cost?.value} ${dictionary?.baseCurrency}`}
        </Typography>
      </Grid>
    </Grid>
  );
}
