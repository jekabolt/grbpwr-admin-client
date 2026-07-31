import type { common_AddressInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { Buyer } from 'components/managers/order/components/buyer';
import { OrderTable } from 'components/managers/order/components/order-table';
import { RiskBanner, SettlementCompact } from 'components/managers/order/components/stripe-details';
import { OrderStatus } from 'components/managers/orders-catalog/components/order-status';
import {
  formatDateShort,
  getOrderStatusName,
} from 'components/managers/orders-catalog/components/utility';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import { GroupLabel } from 'ui/components/group-label';
import { Row, RowTotal } from 'ui/components/row';
import { Section } from 'ui/components/section';
import { SkeletonBlocks } from 'ui/components/skeleton';
import Text from 'ui/components/text';
import { FulfillmentAnnotation } from '../components/fulfillment-annotation';
import { ShipLabelModal } from '../components/ship-label-modal';
import {
  useFulfillmentCard,
  useMarkFulfillmentDelivered,
  useShippingLabelPrep,
} from '../hooks/useFulfillment';
import { columnFromStatusName, COLUMN_ACTION, formatMoney } from '../utils/meta';

// ffDetail v2 — pack-first, three columns: the pick list (items + summary) leads,
// then the packing overlay (assignee / notes / checklist), then shipping (address,
// tracking, customer, settlement). Reuses the shared order components (OrderTable,
// Buyer, stripe-details) rather than re-rendering the order.

function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' tracking='group' component='span' className='font-bold uppercase'>
      {children}
    </Text>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className='mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-3 text-center'>
      {children}
    </div>
  );
}

function AddressBlock({ address }: { address: common_AddressInsert | undefined }) {
  if (!address)
    return (
      <Text size='micro' variant='label' component='span'>
        No shipping address.
      </Text>
    );
  const lines = [
    address.company,
    address.addressLineOne,
    address.addressLineTwo,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    [address.state, address.country].filter(Boolean).join(', '),
  ].filter((l) => l && l.trim());
  return (
    <div className='flex flex-col gap-0.5'>
      {lines.map((l, i) => (
        <Text key={i} size='micro' component='span' className='break-words'>
          {l}
        </Text>
      ))}
    </div>
  );
}

export function FulfillmentCardDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const { dictionary } = useDictionary();

  const { canRead, canWrite: canWriteSection, canReadCosting, resolved } = usePermissions();
  const canView = !resolved || canRead(SECTION.fulfillment);
  const canWrite = canWriteSection(SECTION.fulfillment);
  const canReadOrders = canRead(SECTION.orders);

  const { data, isLoading, isError } = useFulfillmentCard(uuid ?? null);

  const deliver = useMarkFulfillmentDelivered();
  const [shipping, setShipping] = useState(false);
  const [delivering, setDelivering] = useState(false);

  // Reprint/void access for an already-shipped order. Read-only; only fires once
  // the order is shipped. Shares the label cache with the ship modal.
  const isShipped =
    columnFromStatusName(getOrderStatusName(dictionary, data?.order?.order?.orderStatusId)) ===
    'FULFILLMENT_COLUMN_SHIPPED';
  const labelInfo = useShippingLabelPrep(uuid ?? null, isShipped);
  const hasExistingLabel = !!labelInfo.data?.labelUrl;

  if (!canView) {
    return (
      <Centered>
        <ColHead>fulfillment</ColHead>
        <CalloutBox tone='note'>
          <Text size='micro' variant='label' component='span'>
            You don’t have access to this section.
          </Text>
        </CalloutBox>
      </Centered>
    );
  }

  if (isLoading) {
    return (
      <div className='flex flex-col gap-4 pb-16'>
        <SkeletonBlocks count={1} height={48} />
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]'>
          <SkeletonBlocks count={3} height={64} />
          <SkeletonBlocks count={2} height={64} />
          <SkeletonBlocks count={2} height={64} />
        </div>
      </div>
    );
  }

  if (isError || !data?.order) {
    return (
      <Centered>
        <ColHead>order not found</ColHead>
        <Text size='micro' variant='label' component='span'>
          It may not be in fulfillment, or the link is wrong.
        </Text>
        <Button asChild variant='main' size='sm'>
          <Link to={ROUTES.fulfillment}>← back to board</Link>
        </Button>
      </Centered>
    );
  }

  const order = data.order;
  const annotation = data.annotation;
  const stripeDetails = data.stripeDetails;
  const o = order.order;
  const currency = o?.currency ?? '';
  const statusName = getOrderStatusName(dictionary, o?.orderStatusId);
  const column = columnFromStatusName(statusName);
  const action = COLUMN_ACTION[column];
  const trackingCode = order.shipment?.trackingCode;

  function confirmDeliver() {
    if (!uuid || deliver.isPending) return;
    deliver.mutate(uuid, { onSuccess: () => setDelivering(false) });
  }

  return (
    <div className='flex flex-col gap-4 pb-16'>
      {/* Header */}
      <div className='flex flex-col gap-2 border-b-2 border-textColor pb-2'>
        <Button asChild variant='underline' size='xs'>
          <Link to={ROUTES.fulfillment}>← board</Link>
        </Button>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex min-w-0 flex-col gap-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Text component='h3' variant='uppercase' tracking='section' className='font-bold'>
                order #{o?.id ?? ''}
              </Text>
              <OrderStatus status={statusName} />
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <span className='flex items-center gap-1'>
                <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                  ref
                </Text>
                <CopyToClipboard text={o?.uuid || ''} />
              </span>
              <Text size='micro' variant='label' component='span'>
                placed {formatDateShort(o?.placed, true) || '—'}
              </Text>
            </div>
          </div>
          <div className='flex shrink-0 flex-wrap justify-end gap-1.5'>
            {canReadOrders && (
              <Button asChild variant='secondary' size='sm'>
                <Link to={`${ROUTES.orders}/${o?.uuid}`}>open full order</Link>
              </Button>
            )}
            {canWrite && action === 'ship' && (
              <Button variant='main' size='sm' onClick={() => setShipping(true)}>
                ship
              </Button>
            )}
            {canWrite && action === 'deliver' && hasExistingLabel && (
              <Button variant='secondary' size='sm' onClick={() => setShipping(true)}>
                shipping label
              </Button>
            )}
            {canWrite && action === 'deliver' && (
              <Button
                variant='main'
                size='sm'
                loading={deliver.isPending}
                disabled={deliver.isPending}
                onClick={() => setDelivering(true)}
              >
                mark delivered
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stripe Radar risk — same screen as the ship action so it can't be missed. */}
      <RiskBanner riskLevel={stripeDetails?.riskLevel} />

      {/* Pack-first body */}
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]'>
        {/* 1 — pick list */}
        <Section title='pick list' className='min-w-0'>
          <OrderTable orderDetails={order} />
          {/* The ledger vocabulary: hairline rows closed by a full-weight total. */}
          <div>
            <Row label='shipping' value={formatMoney(order.shipment?.cost?.value, currency)} />
            <RowTotal label='total' value={formatMoney(o?.totalPrice?.value, currency)} />
          </div>
        </Section>

        {/* 2 — packing overlay */}
        <Section title='packing' className='min-w-0 lg:h-fit'>
          <FulfillmentAnnotation annotation={annotation} canWrite={canWrite} />
        </Section>

        {/* 3 — shipping */}
        <Section title='shipping' className='min-w-0 lg:h-fit'>
          <div className='flex flex-col gap-2'>
            <GroupLabel flush>ship to</GroupLabel>
            <AddressBlock address={order.shipping?.addressInsert} />
            {trackingCode && (
              <div className='flex items-center gap-1 pt-1'>
                <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                  tracking
                </Text>
                <CopyToClipboard text={trackingCode} />
              </div>
            )}
          </div>

          <div className='flex flex-col gap-2 border-t border-borderColor pt-3'>
            <GroupLabel flush>customer</GroupLabel>
            <Buyer buyer={order.buyer?.buyerInsert} isPrinting={false} />
          </div>

          {canReadCosting && <SettlementCompact stripeDetails={stripeDetails} />}
        </Section>
      </div>

      <ShipLabelModal
        open={shipping}
        onOpenChange={setShipping}
        orderUuid={uuid ?? null}
        orderLabel={`#${o?.id ?? ''}`}
      />

      <ConfirmationModal
        open={delivering}
        onOpenChange={setDelivering}
        onConfirm={confirmDeliver}
        confirmDisabled={deliver.isPending}
        closeOnConfirm={false}
        title='mark delivered?'
        confirmLabel='mark delivered'
        width='sm'
      >
        <Text size='micro' variant='label' component='span'>
          Mark order #{o?.id ?? ''} as delivered? This closes out fulfillment for the order.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
