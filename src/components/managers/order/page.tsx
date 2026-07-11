import {
  formatDateShort,
  getStatusColor,
} from 'components/managers/orders-catalog/components/utility';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Text from 'ui/components/text';
import { Logo } from 'ui/icons/logo';
import { Buyer } from './components/buyer';
import { Comment } from './components/comment';
import { Description } from './components/description';
import { OrderTable } from './components/order-table';
import { Payment } from './components/payment';
import { PromoApplied } from './components/promo-applied';
import { RefundConfirmation } from './components/refund-confirmation';
import { ShippingBillingToggle } from './components/shipping-billing-toggle';
import { NewTrackCode } from './components/shipping-information/new-track-code';
import { StatusHistory } from './components/status-history';
import { useOrderDetails } from './utility';

const DISPLAY_REFUND_BUTTON_STATUSES = [
  'CONFIRMED',
  'DELIVERED',
  'PENDING RETURN',
  'REFUND IN PROGRESS',
];

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'space-y-3 border border-textInactiveColor p-4 print:border-0 print:p-0',
        className,
      )}
    >
      <Text variant='uppercase' size='large' className='print:hidden'>
        {title}
      </Text>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-4'>
      <Text variant='inactive'>{label}</Text>
      <Text variant='uppercase'>{value}</Text>
    </div>
  );
}

export function OrderDetails() {
  const { uuid } = useParams<{ uuid: string }>();

  const {
    orderDetails,
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
    refundOrder,
    toggleOrderItemsSelection,
  } = useOrderDetails(uuid || '');

  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const { canWrite } = usePermissions();
  const canEditOrder = canWrite(SECTION.orders);

  const form = useForm<{ refundReason: string; notes: string }>({
    defaultValues: { refundReason: '', notes: '' },
  });

  const handleRefundClick = () => setIsRefundModalOpen(true);
  const handleRefundConfirm = (payload: { reason: string; refundShipping?: boolean }) => {
    refundOrder(payload);
  };

  const order = orderDetails?.order;
  const currency = order?.currency ?? '';
  const statusColor = getStatusColor(orderStatus);
  const orderPlaced = formatDateShort(order?.placed, true);
  const isRefunded = orderStatus === 'PARTIALLY REFUNDED' || orderStatus === 'REFUNDED';
  const showDeliver = orderStatus === 'SHIPPED';
  const showRefund = DISPLAY_REFUND_BUTTON_STATUSES.includes(orderStatus || '');
  const canPartialRefund = showRefund && orderStatus !== 'CONFIRMED';
  const selectedUnits = selectedUnitKeys.length;

  return (
    <FormProvider {...form}>
      <div className='flex w-full flex-col gap-6 pb-24'>
        <div className='hidden h-10 self-start print:block'>
          <Logo />
        </div>

        {/* Screen header */}
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3 print:hidden'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button asChild variant='secondary' size='lg'>
              <Link to={ROUTES.orders}>← orders</Link>
            </Button>
            <Text variant='uppercase' size='large'>
              order #{order?.id ?? ''}
            </Text>
            {orderStatus && (
              <span className={cn('px-1.5 py-0.5', statusColor)}>
                <Text variant='uppercase'>{orderStatus}</Text>
              </span>
            )}
            <StatusHistory orderDetails={orderDetails} />
          </div>
          <div className='flex flex-wrap items-center gap-3'>
            <span className='flex items-center gap-1'>
              <Text variant='inactive' size='small'>
                ref
              </Text>
              <CopyToClipboard text={order?.uuid || ''} />
            </span>
            <Text variant='inactive' size='small'>
              placed {orderPlaced}
            </Text>
            <Button
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => window.print()}
            >
              print
            </Button>
          </div>
        </div>

        {/* Print-only header (keeps the original print document layout) */}
        <div className='hidden print:block'>
          <Description orderDetails={orderDetails} orderStatus={orderStatus} isPrinting />
        </div>

        {isLoading && !order ? (
          <div className='flex justify-center py-20'>
            <Text variant='inactive' className='animate-pulse'>
              loading order…
            </Text>
          </div>
        ) : (
          <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
            {/* Left — items + summary */}
            <div className='w-full space-y-6 lg:flex-1'>
              <Section title='items'>
                {canPartialRefund && (
                  <Text variant='inactive' size='small' className='print:hidden'>
                    select units to refund, or leave all unselected to refund the whole order
                    {selectedUnits > 0 ? ` · ${selectedUnits} selected` : ''}
                  </Text>
                )}
                <OrderTable
                  orderDetails={orderDetails}
                  isPrinting={isPrinting}
                  showRefundSelection={canPartialRefund}
                  selectedUnitKeys={selectedUnitKeys}
                  onToggleOrderItems={toggleOrderItemsSelection}
                />
              </Section>

              <Section title='summary'>
                <div className='space-y-1'>
                  <SummaryRow
                    label='shipping cost'
                    value={`${orderDetails?.shipment?.cost?.value ?? '-'} ${currency}`}
                  />
                  <div className='flex items-center justify-between gap-4 print:hidden'>
                    <Text variant='inactive'>promo</Text>
                    <PromoApplied orderDetails={orderDetails} />
                  </div>
                  {isRefunded && (
                    <SummaryRow
                      label='refunded amount'
                      value={`${order?.refundedAmount?.value ?? '-'} ${currency}`}
                    />
                  )}
                  {order?.refundReason && (
                    <SummaryRow label='refund reason' value={order.refundReason} />
                  )}
                  <div className='mt-2 flex items-center justify-between gap-4 border-t border-textInactiveColor pt-2'>
                    <Text variant='uppercase' className='font-bold'>
                      total
                    </Text>
                    <Text variant='uppercase' className='font-bold'>
                      {order?.totalPrice?.value} {currency}
                    </Text>
                  </div>
                </div>
              </Section>

              <Section title='comment' className='print:hidden'>
                <Comment orderDetails={orderDetails} canEdit={canEditOrder} />
              </Section>
            </div>

            {/* Right — customer / shipping / payment / comment */}
            <div className='w-full space-y-6 lg:w-[360px]'>
              <Section title='customer'>
                <Buyer buyer={orderDetails?.buyer?.buyerInsert} isPrinting={isPrinting} />
              </Section>

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

              <Section title='payment' className='print:hidden'>
                <Payment orderDetails={orderDetails} isPrinting={isPrinting} />
              </Section>

              {canEditOrder &&
                orderStatus === 'CONFIRMED' &&
                !orderDetails?.shipment?.trackingCode && (
                  <Section title='tracking' className='print:hidden'>
                    <NewTrackCode
                      isPrinting={isPrinting}
                      trackingNumber={trackingNumber}
                      handleTrackingNumberChange={handleTrackingNumberChange}
                      saveTrackingNumber={saveTrackingNumber}
                    />
                  </Section>
                )}
            </div>
          </div>
        )}

        {canEditOrder && (showDeliver || showRefund) && (
          <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-3 py-2 print:hidden'>
            {showDeliver && (
              <Button variant='main' size='lg' className='uppercase' onClick={markAsDelivered}>
                mark as delivered
              </Button>
            )}
            {showRefund && (
              <Button variant='main' size='lg' className='uppercase' onClick={handleRefundClick}>
                {selectedUnits > 0
                  ? `refund ${selectedUnits} unit${selectedUnits === 1 ? '' : 's'}`
                  : 'refund order'}
              </Button>
            )}
          </div>
        )}

        <RefundConfirmation
          orderDetails={orderDetails}
          open={isRefundModalOpen}
          selectedUnitKeys={selectedUnitKeys}
          onOpenChange={setIsRefundModalOpen}
          refundOrder={handleRefundConfirm}
        />
      </div>
      {createPortal(
        <Text
          variant='uppercase'
          className='font-bold hidden print:block print:absolute print:bottom-0 print:inset-x-0'
        >
          If you have any questions, please send an email to customercare@grbpwr.com
        </Text>,
        document.body,
      )}
    </FormProvider>
  );
}
