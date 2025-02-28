import { common_OrderFull } from 'api/proto-http/frontend';
import { formatDateTime } from 'components/managers/orders-catalog/components/utility';
import { STATUS } from 'constants/filter';
import { cn } from 'lib/utility';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Text from 'ui/components/text';

interface Props {
  orderDetails: common_OrderFull | undefined;
  isPrinting: boolean;
}

export function Payment({ orderDetails, isPrinting }: Props) {
  const payment = orderDetails?.payment;
  return (
    <div
      className={cn('grid gap-2 w-full', {
        hidden: isPrinting,
      })}
    >
      <Text variant='uppercase' className='font-bold'>
        payment:
      </Text>
      <Text variant='uppercase' size='small'>
        status:{' '}
        {payment?.paymentInsert?.isTransactionDone ? (
          <Text component='span' size='small' className={STATUS.confirmed}>
            paid
          </Text>
        ) : (
          <Text component='span' size='small' className={STATUS.denied}>
            unpaid
          </Text>
        )}
      </Text>
      <Text variant='uppercase' size='small'>
        made at: {formatDateTime(payment?.modifiedAt)}
      </Text>
      <Text variant='uppercase' size='small'>
        payment method:{' '}
        {payment?.paymentInsert?.paymentMethod?.replace('PAYMENT_METHOD_NAME_ENUM_', '')}
      </Text>
      <Text variant='uppercase' size='small'>
        {[
          `amount: `,
          payment?.paymentInsert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD' ||
          payment?.paymentInsert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD_TEST' ? (
            <span>{payment?.paymentInsert?.transactionAmountPaymentCurrency?.value}</span>
          ) : (
            <span>{payment?.paymentInsert?.transactionAmount?.value}</span>
          ),
        ]}
      </Text>
      {payment?.paymentInsert?.payer && (
        <Text variant='uppercase' size='small' className='flex items-center gap-2'>
          {[`payer: `, <CopyToClipboard text={payment?.paymentInsert?.payer || ''} />]}
        </Text>
      )}
      {payment?.paymentInsert?.payee && (
        <Text variant='uppercase' size='small' className='flex items-center gap-2'>
          {[`payee: `, <CopyToClipboard text={payment?.paymentInsert?.payee || ''} />]}
        </Text>
      )}
      {payment?.paymentInsert?.isTransactionDone && (
        <Text variant='uppercase' size='small' className='flex items-center gap-2'>
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
        </Text>
      )}
    </div>
  );
}
