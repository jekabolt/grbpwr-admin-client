import { Grid2 as Grid, Typography } from '@mui/material';
import { common_BuyerInsert } from 'api/proto-http/frontend';
import { STATUS } from 'components/managers/orders/interfaces/interface';
import { CopyToClipboard } from 'components/ui/components/copyToClipboard';
// import styles from 'styles/order.scss';

interface Props {
  buyer: common_BuyerInsert | undefined;
  isPrinting: boolean;
}

export function Buyer({ buyer, isPrinting }: Props) {
  return (
    <Grid container>
      <Grid size={{ xs: 12 }}>
        <Typography
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          variant='overline'
          textTransform='uppercase'
        >
          {[
            `email: `,
            <span style={{ textTransform: 'lowercase' }}>
              <CopyToClipboard text={buyer?.email || ''} />
            </span>,
          ]}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`first name: ${buyer?.firstName}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`last name: ${buyer?.lastName}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`phone: ${buyer?.phone}`}
        </Typography>
      </Grid>
      <Grid
        size={{ xs: 12 }}
        // className={isPrinting ? styles.hide_cell : styles.non_print_state}
      >
        <Typography variant='overline' textTransform='uppercase'>
          {[
            `receive promo emails: `,
            buyer?.receivePromoEmails ? (
              <span style={{ backgroundColor: STATUS.confirmed }}>yes</span>
            ) : (
              <span style={{ backgroundColor: STATUS.denied }}>no</span>
            ),
          ]}
        </Typography>
      </Grid>
    </Grid>
  );
}
