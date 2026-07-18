import type { common_AddressInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { Buyer } from 'components/managers/order/components/buyer';
import { OrderTable } from 'components/managers/order/components/order-table';
import { RiskBanner, SettlementCompact } from 'components/managers/order/components/stripe-details';
import {
  formatDateShort,
  getOrderStatusName,
} from 'components/managers/orders-catalog/components/utility';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Text from 'ui/components/text';
import { FulfillmentAnnotation } from '../components/fulfillment-annotation';
import { ShipLabelModal } from '../components/ship-label-modal';
import {
  useFulfillmentCard,
  useMarkFulfillmentDelivered,
  useShippingLabelPrep,
} from '../hooks/useFulfillment';
import { columnFromStatusName, COLUMN_ACTION, COLUMN_LABEL, formatMoney } from '../utils/meta';

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className='mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 text-center'>
      {children}
    </div>
  );
}

function AddressBlock({ address }: { address: common_AddressInsert | undefined }) {
  if (!address)
    return (
      <Text variant='label' size='small'>
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
        <Text key={i} size='small' className='break-words'>
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
  // the order is shipped (a to-fulfill order has no label yet — the ship modal
  // prepares it on demand). Shares the label cache with the modal.
  const isShipped =
    columnFromStatusName(getOrderStatusName(dictionary, data?.order?.order?.orderStatusId)) ===
    'FULFILLMENT_COLUMN_SHIPPED';
  const labelInfo = useShippingLabelPrep(uuid ?? null, isShipped);
  const hasExistingLabel = !!labelInfo.data?.labelUrl;

  if (!canView) {
    return (
      <Centered>
        <Text variant='uppercase' size='large'>
          fulfillment
        </Text>
        <Text variant='label' size='small'>
          You don’t have access to this section.
        </Text>
      </Centered>
    );
  }

  if (isLoading) {
    return (
      <Centered>
        <Text variant='inactive' className='animate-pulse uppercase'>
          loading order…
        </Text>
      </Centered>
    );
  }

  if (isError || !data?.order) {
    return (
      <Centered>
        <Text variant='uppercase' size='large'>
          order not found
        </Text>
        <Text variant='label' size='small'>
          It may not be in fulfillment, or the link is wrong.
        </Text>
        <Button asChild variant='main' size='lg'>
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
    <div className='mx-auto flex w-full max-w-5xl flex-col gap-5 pb-10'>
      {/* Header */}
      <div className='flex flex-col gap-3 border-b border-textInactiveColor pb-3'>
        <Link
          to={ROUTES.fulfillment}
          className='w-fit text-textBaseSize lowercase text-labelColor underline hover:text-textColor'
        >
          ← board
        </Link>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex min-w-0 flex-col gap-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <h1 className='text-lg leading-tight'>order #{o?.id ?? ''}</h1>
              <span className='bg-textColor px-1.5 py-0.5 text-textBaseSize uppercase leading-4 text-bgColor'>
                {COLUMN_LABEL[column]}
              </span>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <span className='flex items-center gap-1'>
                <Text variant='label' size='small'>
                  ref
                </Text>
                <CopyToClipboard text={o?.uuid || ''} />
              </span>
              <Text variant='label' size='small'>
                placed {formatDateShort(o?.placed, true) || '—'}
              </Text>
            </div>
          </div>
          <div className='flex shrink-0 flex-wrap justify-end gap-2'>
            {canReadOrders && (
              <Button asChild variant='secondary' size='lg'>
                <Link to={`${ROUTES.orders}/${o?.uuid}`}>open full order</Link>
              </Button>
            )}
            {canWrite && action === 'ship' && (
              <Button variant='main' size='lg' onClick={() => setShipping(true)}>
                ship
              </Button>
            )}
            {canWrite && action === 'deliver' && hasExistingLabel && (
              <Button variant='secondary' size='lg' onClick={() => setShipping(true)}>
                shipping label
              </Button>
            )}
            {canWrite && action === 'deliver' && (
              <Button
                variant='main'
                size='lg'
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

      {/* Body */}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-[1fr_20rem]'>
        {/* Main — items + summary */}
        <div className='flex min-w-0 flex-col gap-6 md:order-1'>
          <section className='flex flex-col gap-2'>
            <Text variant='uppercase' size='small' className='text-labelColor'>
              items
            </Text>
            <OrderTable orderDetails={order} />
          </section>

          <section className='flex flex-col gap-1'>
            <Text variant='uppercase' size='small' className='text-labelColor'>
              summary
            </Text>
            <div className='flex items-center justify-between gap-4'>
              <Text variant='label' size='small'>
                shipping
              </Text>
              <Text size='small'>{formatMoney(order.shipment?.cost?.value, currency)}</Text>
            </div>
            <div className='mt-1 flex items-center justify-between gap-4 border-t border-textInactiveColor pt-2'>
              <Text className='font-bold uppercase'>total</Text>
              <Text className='font-bold'>{formatMoney(o?.totalPrice?.value, currency)}</Text>
            </div>
          </section>
        </div>

        {/* Aside — annotation + customer + shipping */}
        <aside className='flex flex-col gap-5 border border-textInactiveColor p-4 md:order-2 md:h-fit'>
          <FulfillmentAnnotation annotation={annotation} canWrite={canWrite} />

          <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-4'>
            <Buyer buyer={order.buyer?.buyerInsert} isPrinting={false} />
          </div>

          <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-4'>
            <Text variant='uppercase' size='small' className='text-labelColor'>
              ship to
            </Text>
            <AddressBlock address={order.shipping?.addressInsert} />
            {trackingCode && (
              <div className='flex items-center gap-1 pt-1'>
                <Text variant='label' size='small'>
                  tracking
                </Text>
                <CopyToClipboard text={trackingCode} />
              </div>
            )}
          </div>

          {canReadCosting && <SettlementCompact stripeDetails={stripeDetails} />}
        </aside>
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
        title='mark delivered'
        confirmLabel='mark delivered'
      >
        <Text size='small'>Mark order #{o?.id ?? ''} as delivered?</Text>
      </ConfirmationModal>
    </div>
  );
}
