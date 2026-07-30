import type { common_OrderFull } from 'api/proto-http/frontend';
import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { ROUTES } from 'constants/routes';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';

// Refunding is only meaningful once money has been taken and before the order is fully
// unwound — same list the old bottom bar used. PARTIALLY REFUNDED stays refundable: the backend
// allows the remainder from that status, so hiding the button dead-ended the second refund.
// Keep in sync with DISPLAY_REFUND_BUTTON_STATUSES in ../page.tsx.
const REFUNDABLE_STATUSES = [
  'CONFIRMED',
  'DELIVERED',
  'PENDING RETURN',
  'REFUND IN PROGRESS',
  'PARTIALLY REFUNDED',
];

// CancelOrder is a pre-fulfilment escape hatch: once a parcel is with the carrier the only
// way back is a refund, so the button disappears after SHIPPED.
const CANCELLABLE_STATUSES = ['PLACED', 'AWAITING PAYMENT', 'CONFIRMED'];

/**
 * ordHdr v2 + ordActions v2 — identity on top, a state row underneath that answers
 * "what can I do with this order right now" in words, with the actions in it.
 *
 * This is what lets the fixed bottom action bar go away: nothing floats over the page and
 * "refund" stops being the loudest thing on screen at all times.
 */
export function OrderHeader({
  orderDetails,
  orderStatus,
  canEditOrder,
  selectedUnits,
  onRefund,
  onMarkDelivered,
  onCancelOrder,
}: {
  orderDetails?: common_OrderFull;
  orderStatus?: string;
  canEditOrder: boolean;
  selectedUnits: number;
  onRefund: () => void;
  onMarkDelivered: () => void;
  onCancelOrder: () => void;
}) {
  const [confirming, setConfirming] = useState<'deliver' | 'cancel' | null>(null);

  const order = orderDetails?.order;
  const buyer = orderDetails?.buyer?.buyerInsert;
  const shipment = orderDetails?.shipment;
  const isPaid = !!orderDetails?.payment?.paymentInsert?.isTransactionDone;
  const isShipped = !!shipment?.trackingCode || !!shipment?.shippingDate;

  const showDeliver = orderStatus === 'SHIPPED';
  const showRefund = REFUNDABLE_STATUSES.includes(orderStatus || '');
  const showCancel = CANCELLABLE_STATUSES.includes(orderStatus || '');

  const identity = [
    [buyer?.firstName, buyer?.lastName].filter(Boolean).join(' '),
    buyer?.email,
    formatDateShort(order?.placed, true),
  ]
    .filter(Boolean)
    .join(' · ');

  const refundLabel =
    selectedUnits > 0 ? `refund ${selectedUnits} unit${selectedUnits === 1 ? '' : 's'}` : 'refund';

  return (
    <div className='print:hidden'>
      <Toolbar>
        <Button asChild variant='secondary' size='sm'>
          <Link to={ROUTES.orders} aria-label='back to orders'>
            ←
          </Link>
        </Button>
        <div className='min-w-0'>
          <Text variant='uppercase' tracking='label' className='font-bold'>
            order #{order?.id ?? '—'}
          </Text>
          {identity && (
            <Text size='micro' variant='label' className='truncate'>
              {identity}
            </Text>
          )}
        </div>
        <ToolbarSpacer />
        <Button asChild variant='secondary' size='sm'>
          <Link to={order?.uuid ? `${ROUTES.orders}/${order.uuid}/invoice` : ROUTES.orders}>
            invoice
          </Link>
        </Button>
      </Toolbar>

      <Toolbar className='border-t-0'>
        {orderStatus && <Chip selected>{orderStatus.toLowerCase()}</Chip>}
        <Pill tone={isPaid ? 'ok' : 'warn'}>{isPaid ? 'paid' : 'unpaid'}</Pill>
        <Pill tone={isShipped ? 'ok' : 'mut'}>{isShipped ? 'shipped' : 'not shipped'}</Pill>
        <span className='flex items-center gap-1'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            ref
          </Text>
          <CopyToClipboard text={order?.uuid || ''} cutText />
        </span>
        <ToolbarSpacer />
        {canEditOrder && showCancel && (
          <Button variant='secondary' size='sm' onClick={() => setConfirming('cancel')}>
            cancel order
          </Button>
        )}
        {canEditOrder && showRefund && (
          <Button variant={showDeliver ? 'secondary' : 'main'} size='sm' onClick={onRefund}>
            {refundLabel}
          </Button>
        )}
        {canEditOrder && showDeliver && (
          <Button variant='main' size='sm' onClick={() => setConfirming('deliver')}>
            mark delivered
          </Button>
        )}
      </Toolbar>

      <ConfirmationModal
        open={confirming === 'deliver'}
        onOpenChange={(open) => setConfirming(open ? 'deliver' : null)}
        onConfirm={onMarkDelivered}
        title='mark as delivered'
        confirmLabel='mark delivered'
        width='sm'
      >
        <Text>
          Records order #{order?.id ?? ''} as delivered. The customer's review window opens from
          this moment.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirming === 'cancel'}
        onOpenChange={(open) => setConfirming(open ? 'cancel' : null)}
        onConfirm={onCancelOrder}
        title='cancel order'
        confirmLabel='cancel this order'
        cancelLabel='keep order'
        width='sm'
      >
        <div className='space-y-2 border border-error p-2.5'>
          <Text variant='error' className='font-bold'>
            cancel order #{order?.id ?? ''}
          </Text>
          <Text>
            Releases the reserved stock and stops fulfilment. If the customer has already paid, use
            a refund instead — cancelling does not move money.
          </Text>
        </div>
      </ConfirmationModal>
    </div>
  );
}
