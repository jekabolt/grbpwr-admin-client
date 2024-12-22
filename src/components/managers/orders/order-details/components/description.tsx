import { Grid2 as Grid, Typography } from '@mui/material';
import { CopyToClipboard } from 'components/common/copyToClipboard';
import styles from 'styles/order.scss';
import { OrderDescriptionProps } from '../../interfaces/interface';
import { formatDateTime, getStatusColor } from '../../utility';

export function Description({ orderDetails, orderStatus }: OrderDescriptionProps) {
  return (
    <Grid container justifyContent='center'>
      <Grid size={{ xs: 12, md: 2 }}>
        <Typography variant='overline' fontSize={14} textTransform='uppercase'>
          {`order id: ${orderDetails?.order?.id}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, md: 2 }}>
        <Typography
          style={{ display: 'flex', alignItems: 'center' }}
          variant='overline'
          fontSize={14}
          textTransform='uppercase'
        >
          {[
            'uuid: ',
            <CopyToClipboard key='copy' text={orderDetails?.order?.uuid || ''} cutText={true} />,
          ]}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, md: 2 }}>
        <Typography
          variant='overline'
          fontSize={14}
          textTransform='uppercase'
          style={{ backgroundColor: getStatusColor(orderStatus) }}
        >
          {`status: ${orderStatus}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }} className={styles.support}>
        <Typography variant='overline' fontSize={14} textTransform='uppercase'>
          {`company adress: adress adress adress`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Typography variant='overline' fontSize={14} textTransform='uppercase'>
          {`placed: ${formatDateTime(orderDetails?.order?.placed)}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Typography variant='overline' fontSize={14} textTransform='uppercase'>
          {`modified: ${formatDateTime(orderDetails?.order?.modified)}`}
        </Typography>
      </Grid>
    </Grid>
  );
}
