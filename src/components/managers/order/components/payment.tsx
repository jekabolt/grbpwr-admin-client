import type { common_OrderStripeDetails } from 'api/proto-http/admin';
import { common_OrderFull } from 'api/proto-http/frontend';
import { formatDateTime } from 'components/managers/orders-catalog/components/utility';
import { STATUS } from 'constants/filter';
import { cn } from 'lib/utility';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Text from 'ui/components/text';
import {
  composePaymentMethod,
  DetailRow,
  RiskChip,
  riskTone,
  SettlementBlock,
  StripeExternalLink,
} from './stripe-details';

interface Props {
  orderDetails: common_OrderFull | undefined;
  // Admin-only settlement metadata (sibling of the order on GetOrderByUUIDResponse).
  stripeDetails?: common_OrderStripeDetails | undefined;
  // Costing field-shaping: the settlement economics sub-block only renders when true.
  showSettlement?: boolean;
  isRefunded?: boolean;
  isPrinting: boolean;
}

export function Payment({
  orderDetails,
  stripeDetails,
  showSettlement,
  isRefunded,
  isPrinting,
}: Props) {
  const payment = orderDetails?.payment;
  const insert = payment?.paymentInsert;
  const isCard =
    insert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD' ||
    insert?.paymentMethod === 'PAYMENT_METHOD_NAME_ENUM_CARD_TEST';
  const currency = orderDetails?.order?.currency ?? '';
  const isPaid = !!insert?.isTransactionDone;

  // Most-specific method label, with card brand/last4 appended when Stripe captured them.
  const methodLine = composePaymentMethod({
    paymentMethodType: insert?.paymentMethodType,
    paymentMethodEnum: insert?.paymentMethod,
    cardBrand: stripeDetails?.cardBrand,
    cardLast4: stripeDetails?.cardLast4,
  });
  const amount = isCard
    ? insert?.transactionAmountPaymentCurrency?.value
    : insert?.transactionAmount?.value;

  return (
    <div
      className={cn('flex flex-col gap-1', {
        hidden: isPrinting,
      })}
    >
      <Text variant='uppercase' className='font-bold'>
        payment:
      </Text>

      <DetailRow
        label='status'
        value={
          <span className={cn('px-1.5 py-0.5', isPaid ? STATUS.confirmed : STATUS.denied)}>
            {isPaid ? 'paid' : 'unpaid'}
          </span>
        }
      />
      {methodLine && <DetailRow label='method' value={methodLine} />}
      <DetailRow label='made at' value={formatDateTime(payment?.modifiedAt)} />
      {amount && <DetailRow label='amount' value={`${amount} ${currency}`} />}
      {insert?.receiptUrl && (
        <DetailRow
          label='receipt'
          value={<StripeExternalLink href={insert.receiptUrl}>receipt</StripeExternalLink>}
        />
      )}
      {insert?.transactionId && (
        <div className='flex items-center justify-between gap-4'>
          <Text variant='label'>transaction</Text>
          <CopyToClipboard text={insert.transactionId} cutText />
        </div>
      )}
      {riskTone(stripeDetails?.riskLevel) && (
        <div className='flex items-center justify-between gap-4'>
          <Text variant='label'>risk</Text>
          <RiskChip riskLevel={stripeDetails?.riskLevel} />
        </div>
      )}

      {showSettlement && (
        <SettlementBlock
          stripeDetails={stripeDetails}
          presentmentCurrency={currency}
          isRefunded={isRefunded}
        />
      )}
    </div>
  );
}
