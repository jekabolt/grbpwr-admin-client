import { Grid2 as Grid, Typography } from '@mui/material';
import { common_OrderFull } from 'api/proto-http/frontend';
import { CopyToClipboard } from 'components/ui/components/copyToClipboard';
import { STATUS } from '../../interfaces/interface';
import { formatDateTime } from '../../utility';

interface Props {
  orderDetails: common_OrderFull | undefined;
}

export function Payment({ orderDetails }: Props) {
  const payment = orderDetails?.payment;
  return (
    <Grid container>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' fontWeight='bold' fontSize={14} textTransform='uppercase'>
          payment:
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {[
            'status: ',
            payment?.paymentInsert?.isTransactionDone ? (
              <span style={{ backgroundColor: STATUS.confirmed }}>paid</span>
            ) : (
              <span style={{ backgroundColor: STATUS.denied }}>unpaid</span>
            ),
          ]}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`made at: ${formatDateTime(payment?.modifiedAt)}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {`payment method: ${payment?.paymentInsert?.paymentMethod?.replace(
            'PAYMENT_METHOD_NAME_ENUM_',
            '',
          )}`}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant='overline' textTransform='uppercase'>
          {[
            `amount: `,
            payment?.paymentInsert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD' ||
            payment?.paymentInsert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD_TEST' ? (
              <span>{payment?.paymentInsert?.transactionAmountPaymentCurrency?.value}</span>
            ) : (
              <span>{payment?.paymentInsert?.transactionAmount?.value}</span>
            ),
          ]}
        </Typography>
      </Grid>
      {payment?.paymentInsert?.payer && (
        <Grid size={{ xs: 12 }}>
          <Typography
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            variant='overline'
            textTransform='uppercase'
          >
            {[`payer: `, <CopyToClipboard text={payment?.paymentInsert?.payer || ''} />]}
          </Typography>
        </Grid>
      )}
      {payment?.paymentInsert?.payee && (
        <Grid size={{ xs: 12 }}>
          <Typography
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            variant='overline'
            textTransform='uppercase'
          >
            {[`payee: `, <CopyToClipboard text={payment?.paymentInsert?.payee || ''} />]}
          </Typography>
        </Grid>
      )}
      {payment?.paymentInsert?.isTransactionDone && (
        <Grid size={{ xs: 12 }}>
          <Typography
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            variant='overline'
            textTransform='uppercase'
          >
            {payment.paymentInsert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD_TEST' ||
            payment.paymentInsert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD'
              ? [
                  `client secret: `,
                  <CopyToClipboard text={payment?.paymentInsert?.clientSecret || ''} cutText />,
                ]
              : [
                  `txid: `,
                  <CopyToClipboard text={payment?.paymentInsert?.transactionId || ''} cutText />,
                ]}
          </Typography>
        </Grid>
      )}
    </Grid>
  );
}
