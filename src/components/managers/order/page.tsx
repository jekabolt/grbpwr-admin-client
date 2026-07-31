import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Placeholder } from 'ui/components/placeholder';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { Buyer } from './components/buyer';
import { Comment } from './components/comment';
import { LifecycleStrip } from './components/lifecycle-strip';
import { OrderHeader } from './components/order-header';
import { OrderItems } from './components/order-items';
import { OrderPackingSpec } from './components/packing-spec';
import { Payment } from './components/payment';
import { PromoApplied } from './components/promo-applied';
import { RefundConfirmation } from './components/refund-confirmation';
import { ShipmentCostModal } from './components/shipment-cost-modal';
import { ShippingBillingToggle } from './components/shipping-billing-toggle';
import { NewTrackCode } from './components/shipping-information/new-track-code';
import { money, toNum } from './money';
import { useOrderDetails } from './utility';

// PARTIALLY REFUNDED belongs here: the backend explicitly allows refunding the remainder from
// that status (RefundOrder's allow-list) and tracks per-unit remainders in the
// refunded_order_item ledger. Without it a "refund 1 of 2" dead-ended the second unit.
const DISPLAY_REFUND_BUTTON_STATUSES = [
  'CONFIRMED',
  'DELIVERED',
  'PENDING RETURN',
  'REFUND IN PROGRESS',
  'PARTIALLY REFUNDED',
];

/** A bordered panel with an uppercase group label — the redesign's section grammar. */
function SummaryRow({
  label,
  value,
  strong,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className='flex items-baseline justify-between gap-4'>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        {label}
      </Text>
      <Text component='span' className={cn('tabular-nums', strong && 'font-bold')}>
        {value}
      </Text>
    </div>
  );
}

export function OrderDetails() {
  const { uuid } = useParams<{ uuid: string }>();

  const {
    orderDetails,
    stripeDetails,
    orderStatus,
    isLoading,
    isPrinting,
    isEdit,
    trackingNumber,
    selectedUnitKeys,
    toggleTrackNumber,
    handleTrackingNumberChange,
    saveTrackingNumber,
    markAsDelivered,
    cancelOrder,
    refundOrder,
    setShipmentActualCost,
    toggleOrderItemsSelection,
  } = useOrderDetails(uuid || '');

  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isShipCostOpen, setIsShipCostOpen] = useState(false);
  // Local reflection of the last successful SetShipmentActualCost call: that mutation
  // doesn't refetch the order, so without this both the summary block and the modal's
  // prefill would keep showing the pre-edit value until the page is reloaded. Cleared on
  // order change so it can never leak from one uuid onto another.
  const [shipmentCostOverride, setShipmentCostOverride] = useState<{
    actualCost: string;
    returnShippingCost?: string;
  } | null>(null);
  const { canWrite, canReadCosting } = usePermissions();
  const canEditOrder = canWrite(SECTION.orders);
  const { dictionary } = useDictionary();
  // Carrier cost (actual/return) is stored in the base currency, not the order's checkout currency
  // — same source the shipment-cost modal and employee screens use.
  const baseCurrency = dictionary?.baseCurrency || 'EUR';

  useEffect(() => {
    setShipmentCostOverride(null);
  }, [uuid]);

  const form = useForm<{ refundReason: string; notes: string }>({
    defaultValues: { refundReason: '', notes: '' },
  });

  const handleShipmentCostSubmit = async (actualCost: string, returnShippingCost?: string) => {
    const ok = await setShipmentActualCost(actualCost, returnShippingCost);
    if (!ok) return;
    setShipmentCostOverride((prev) => ({
      actualCost,
      // A blank return field means "unchanged", not "clear" — mirrors the write itself
      // (useOrderDetails sends undefined, not an explicit value, when the field is blank).
      returnShippingCost: returnShippingCost?.trim()
        ? returnShippingCost.trim()
        : prev?.returnShippingCost ?? orderDetails?.shipment?.returnShippingCost?.value,
    }));
  };

  const order = orderDetails?.order;
  const currency = order?.currency ?? '';
  const actualShipmentCost =
    shipmentCostOverride?.actualCost ?? orderDetails?.shipment?.actualCost?.value;
  const returnShipmentCost =
    shipmentCostOverride?.returnShippingCost ?? orderDetails?.shipment?.returnShippingCost?.value;
  const isRefunded = orderStatus === 'PARTIALLY REFUNDED' || orderStatus === 'REFUNDED';
  const showRefund = DISPLAY_REFUND_BUTTON_STATUSES.includes(orderStatus || '');
  const canPartialRefund = showRefund && orderStatus !== 'CONFIRMED';
  const selectedUnits = selectedUnitKeys.length;

  return (
    <FormProvider {...form}>
      <SectionStack className='w-full pb-16'>
        {/* ordHdr v2 + ordActions v2 — identity, state row and the actions, no floating bar */}
        <OrderHeader
          orderDetails={orderDetails}
          orderStatus={orderStatus}
          canEditOrder={canEditOrder}
          selectedUnits={selectedUnits}
          onRefund={() => setIsRefundModalOpen(true)}
          onMarkDelivered={markAsDelivered}
          onCancelOrder={cancelOrder}
        />

        {/* ordHist v3 — the lifecycle as a permanent strip with dwell time */}
        <LifecycleStrip orderDetails={orderDetails} orderStatus={orderStatus} />

        {isLoading && !order ? (
          <Placeholder label='loading order…' className='py-20' />
        ) : (
          <>
            <SectionStack row>
              {/* Left — items + summary + comment */}
              <SectionStack className='w-full lg:flex-1'>
                <Section title='items'>
                  {canPartialRefund && (
                    <Text size='micro' variant='label' className='uppercase print:hidden'>
                      select units to refund, or leave all unselected to refund the whole order
                      {selectedUnits > 0 ? ` · ${selectedUnits} selected` : ''}
                    </Text>
                  )}
                  <OrderItems
                    orderDetails={orderDetails}
                    currency={currency}
                    showRefundSelection={canPartialRefund}
                    selectedUnitKeys={selectedUnitKeys}
                    onToggleOrderItems={toggleOrderItemsSelection}
                  />
                </Section>

                {/* ordSummary v2 — charged (what the customer paid) vs settled (our costs) */}
                <SectionStack row>
                  <Section title='charged' className='w-full lg:w-1/2'>
                    <SummaryRow
                      label='items + shipping'
                      value={
                        order?.totalPrice?.value
                          ? money(toNum(order.totalPrice.value), currency)
                          : '—'
                      }
                      strong
                    />
                    <SummaryRow
                      label='shipping'
                      value={
                        orderDetails?.shipment?.cost?.value
                          ? money(toNum(orderDetails.shipment.cost.value), currency)
                          : '—'
                      }
                    />
                    <div className='flex items-baseline justify-between gap-4 print:hidden'>
                      <Text size='micro' variant='label' component='span' className='uppercase'>
                        promo
                      </Text>
                      <PromoApplied orderDetails={orderDetails} />
                    </div>
                    {isRefunded && (
                      <SummaryRow
                        label='refunded'
                        value={money(toNum(order?.refundedAmount?.value), currency)}
                      />
                    )}
                    {order?.refundReason && (
                      <SummaryRow label='refund reason' value={order.refundReason} />
                    )}
                  </Section>

                  {canReadCosting && (
                    <Section
                      title={`settled · carrier (${baseCurrency})`}
                      className='w-full lg:w-1/2 print:hidden'
                    >
                      <SummaryRow
                        label='actual carrier cost'
                        value={
                          actualShipmentCost ? money(toNum(actualShipmentCost), baseCurrency) : '—'
                        }
                      />
                      <SummaryRow
                        label='return'
                        value={
                          returnShipmentCost ? money(toNum(returnShipmentCost), baseCurrency) : '—'
                        }
                      />
                      {canEditOrder && (
                        <Button
                          variant='underline'
                          size='xs'
                          onClick={() => setIsShipCostOpen(true)}
                          className='mt-1'
                        >
                          {actualShipmentCost ? 'edit carrier cost' : 'record carrier cost'}
                        </Button>
                      )}
                    </Section>
                  )}
                </SectionStack>

                <Section title='comment' className='print:hidden'>
                  <Comment orderDetails={orderDetails} canEdit={canEditOrder} />
                </Section>
              </SectionStack>

              {/* Right — customer / shipping / payment / tracking */}
              <SectionStack className='w-full lg:w-[360px]'>
                <Section title='customer'>
                  <Buyer
                    buyer={orderDetails?.buyer?.buyerInsert}
                    locale={orderDetails?.order?.locale}
                    isPrinting={isPrinting}
                  />
                </Section>

                <Section title='payment' className='print:hidden'>
                  <Payment
                    orderDetails={orderDetails}
                    stripeDetails={stripeDetails}
                    showSettlement={canReadCosting}
                    isRefunded={isRefunded}
                    isPrinting={isPrinting}
                  />
                </Section>

                {canEditOrder && !orderDetails?.shipment?.trackingCode && (
                  <Section title='tracking' className='print:hidden'>
                    <NewTrackCode
                      isPrinting={isPrinting}
                      trackingNumber={trackingNumber}
                      handleTrackingNumberChange={handleTrackingNumberChange}
                      saveTrackingNumber={saveTrackingNumber}
                    />
                  </Section>
                )}
              </SectionStack>
            </SectionStack>

            <Section title='shipping & billing'>
              <ShippingBillingToggle
                orderDetails={orderDetails}
                isPrinting={isPrinting}
                orderStatus={orderStatus}
                isEdit={isEdit}
                canEdit={canEditOrder}
                trackingNumber={trackingNumber}
                toggleTrackNumber={toggleTrackNumber}
                handleTrackingNumberChange={handleTrackingNumberChange}
                saveTrackingNumber={saveTrackingNumber}
              />
            </Section>
          </>
        )}

        <OrderPackingSpec orderUuid={uuid || ''} />

        <ShipmentCostModal
          open={isShipCostOpen}
          onOpenChange={setIsShipCostOpen}
          onSubmit={handleShipmentCostSubmit}
          currentActualCost={actualShipmentCost}
          currentReturnShippingCost={returnShipmentCost}
        />

        <RefundConfirmation
          orderDetails={orderDetails}
          orderStatus={orderStatus}
          open={isRefundModalOpen}
          selectedUnitKeys={selectedUnitKeys}
          onOpenChange={setIsRefundModalOpen}
          refundOrder={refundOrder}
        />
      </SectionStack>
    </FormProvider>
  );
}
