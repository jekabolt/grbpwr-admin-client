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
  const isCard =
    payment?.paymentInsert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD' ||
    payment?.paymentInsert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD_TEST';
  const currency = orderDetails?.order?.currency ?? '';
  return (
    <div
      className={cn('flex flex-col gap-1', {
        hidden: isPrinting,
      })}
    >
      <Text variant='uppercase' className='font-bold'>
        payment:
      </Text>
      <Text variant='uppercase'>
        status:{' '}
        {payment?.paymentInsert?.isTransactionDone ? (
          <Text component='span' className={STATUS.confirmed}>
            paid
          </Text>
        ) : (
          <Text component='span' className={STATUS.denied}>
            unpaid
          </Text>
        )}
      </Text>
      <Text variant='uppercase'>made at: {formatDateTime(payment?.modifiedAt)}</Text>
      <Text variant='uppercase'>
        payment method:{' '}
        {payment?.paymentInsert?.paymentMethod?.replace('PAYMENT_METHOD_NAME_ENUM_', '')}
      </Text>
      <Text variant='uppercase'>
        amount:{' '}
        <span>
          {isCard
            ? payment?.paymentInsert?.transactionAmountPaymentCurrency?.value
            : payment?.paymentInsert?.transactionAmount?.value}{' '}
          {currency}
        </span>
      </Text>
      {payment?.paymentInsert?.isTransactionDone && isCard && (
        <Text variant='uppercase' className='flex items-center gap-2'>
          client secret:{' '}
          <CopyToClipboard text={payment?.paymentInsert?.clientSecret || ''} cutText />
        </Text>
      )}
    </div>
  );
}
