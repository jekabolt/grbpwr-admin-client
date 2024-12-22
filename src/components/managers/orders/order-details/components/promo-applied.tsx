import { Grid2 as Grid, Typography } from '@mui/material';
import { common_OrderFull } from 'api/proto-http/frontend';

interface Props {
  orderDetails: common_OrderFull | undefined;
}

export function PromoApplied({ orderDetails }: Props) {
  const promoCode = orderDetails?.promoCode?.promoCodeInsert;
  return (
    promoCode && (
      <Grid container>
        <Grid size={{ xs: 12 }}>
          <Typography variant='overline' fontWeight='bold' fontSize={14} textTransform='uppercase'>
            {`promo applied: ${promoCode.code} - ${promoCode.discount?.value}%`}
          </Typography>
        </Grid>
        {promoCode.freeShipping && (
          <Grid size={{ xs: 12 }}>
            <Typography variant='overline' fontSize={14} textTransform='uppercase'>
              free ship
            </Typography>
          </Grid>
        )}
        {promoCode.voucher && (
          <Grid size={{ xs: 12 }}>
            <Typography variant='overline' fontSize={14} textTransform='uppercase'>
              voucher
            </Typography>
          </Grid>
        )}
      </Grid>
    )
  );
}
