import { Grid2 as Grid, Typography } from '@mui/material';
import { common_AddressInsert } from 'api/proto-http/frontend';

interface Props {
  shipping: common_AddressInsert | undefined;
}

export function Shipping({ shipping }: Props) {
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
    </Grid>
  );
}
