import { common_OrderFull, type RefundReason } from 'api/proto-http/admin';
import { normalizeStatusName } from 'components/managers/orders-catalog/components/order-status';
import { REASONS } from 'constants/constants';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Checkbox from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { money, toNum } from '../money';
import { lineUnits, refundedUnitsByItemId } from './order-items';

// Maps the free-text refund reasons to the structured RefundReason enum, which drives the
// return-analysis breakdown. Anything unmapped falls back to OTHER.
const REFUND_REASON_CODE: Record<string, RefundReason> = {
  'size issues': 'REFUND_REASON_WRONG_SIZE',
  'damaged or defective': 'REFUND_REASON_DEFECTIVE',
  'wrong item received': 'REFUND_REASON_NOT_AS_DESCRIBED',
  'item does not match description': 'REFUND_REASON_NOT_AS_DESCRIBED',
  'quality not as expected': 'REFUND_REASON_NOT_AS_DESCRIBED',
  'changed my mind': 'REFUND_REASON_CHANGED_MIND',
  'ordered by mistake': 'REFUND_REASON_CHANGED_MIND',
};

function reasonCodeFor(reason: string): RefundReason {
  return REFUND_REASON_CODE[reason.trim().toLowerCase()] ?? 'REFUND_REASON_OTHER';
}

export function RefundConfirmation({
  orderDetails,
  orderStatus,
  open,
  selectedUnitKeys,
  onOpenChange,
  refundOrder,
}: {
  orderDetails?: common_OrderFull;
  /** Resolved order status name (e.g. `CONFIRMED`) — decides how the backend scopes a full refund. */
  orderStatus?: string;
  open: boolean;
  selectedUnitKeys: string[];
  onOpenChange: (open: boolean) => void;
  refundOrder: (payload: {
    reason: string;
    refundShipping?: boolean;
    reasonCode?: RefundReason;
    disposition?: string;
  }) => void;
}) {
  const isFullRefund = !selectedUnitKeys.length;
  // A full refund of a not-yet-shipped (CONFIRMED) order is the ONLY scope where the backend
  // forces shipping in: it refunds the whole PaymentIntent, so the preview is the order total.
  // From every other refundable status a full refund is calculateFullRefundAmount(order,
  // refundShipping) = the units NOT already refunded, plus shipping only if the request asks
  // (internal/apisrv/admin/order.go). Preview both cases exactly, or the modal promises money
  // Stripe will not move.
  const isWholePaymentRefund = isFullRefund && normalizeStatusName(orderStatus) === 'CONFIRMED';
  const existingReason = orderDetails?.order?.refundReason ?? '';
  const [selectedReason, setSelectedReason] = useState('');
  const [refundShipping, setRefundShipping] = useState(false);
  // What physically happens to the returned units (Phase 8). Default restock = the historical
  // behaviour; writeoff/seconds stop a worn return from silently becoming sellable A stock.
  const [disposition, setDisposition] = useState('restock');

  // Units selected for partial refund, grouped per order line (qty = how many of that item),
  // each carrying the line's refundable amount (unit sale price × qty).
  const selectedSummary = useMemo(() => {
    const counts = new Map<number, number>();
    selectedUnitKeys.forEach((k) => {
      const id = parseInt(k.split('-')[0], 10);
      if (!Number.isNaN(id)) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([id, qty]) => {
      const item = orderDetails?.orderItems?.find((oi) => oi.id === id);
      const unitPrice = toNum(item?.productPriceWithSale);
      return {
        id,
        qty,
        name: item?.translations?.[0]?.name ?? `item ${id}`,
        amount: unitPrice * qty,
      };
    });
  }, [selectedUnitKeys, orderDetails?.orderItems]);

  useEffect(() => {
    if (open) {
      setSelectedReason(existingReason);
      setRefundShipping(false);
    } else {
      setSelectedReason('');
      setRefundShipping(false);
    }
  }, [open, existingReason]);

  const order = orderDetails?.order;
  const currency = order?.currency ?? '';
  const total = order?.totalPrice?.value;
  const unitCount = selectedUnitKeys.length;
  // Free shipping is excluded server-side, so there is no fee to offer or preview.
  const freeShipping = !!orderDetails?.shipment?.freeShipping;
  const shippingFee = freeShipping ? 0 : toNum(orderDetails?.shipment?.cost?.value);
  const alreadyRefunded = toNum(order?.refundedAmount?.value);

  // Units NOT already refunded, and what they are worth — mirrors calculateFullRefundAmount, which
  // subtracts the refunded_order_item ledger before asking Stripe for anything.
  const remaining = useMemo(() => {
    const refundedUnits = refundedUnitsByItemId(orderDetails?.refundedOrderItems);
    let amount = 0;
    let units = 0;
    for (const item of orderDetails?.orderItems ?? []) {
      const qty = lineUnits(item);
      const done = typeof item.id === 'number' ? refundedUnits.get(item.id) ?? 0 : 0;
      const left = Math.max(0, qty - done);
      amount += toNum(item.productPriceWithSale) * left;
      units += left;
    }
    return { amount, units };
  }, [orderDetails?.orderItems, orderDetails?.refundedOrderItems]);

  // The shipping fee is the operator's choice on every scope the backend reads the flag for —
  // i.e. everything except the whole-payment refund of a not-yet-shipped order, where it is
  // always included.
  const canChooseShipping = !isWholePaymentRefund && shippingFee > 0;
  const includesShipping = isWholePaymentRefund || (canChooseShipping && refundShipping);

  // ordRefund v2 — amount preview. There is no PreviewRefund RPC, so the figure is summed
  // client-side to match exactly what RefundOrder will hand Stripe.
  const itemsAmount = useMemo(
    () => selectedSummary.reduce((sum, s) => sum + s.amount, 0),
    [selectedSummary],
  );
  // The whole-payment case already has shipping inside the order total; every other scope adds the
  // fee on top of the items it refunds.
  const previewAmount = isWholePaymentRefund
    ? toNum(total)
    : (isFullRefund ? remaining.amount : itemsAmount) + (includesShipping ? shippingFee : 0);
  const previewLabel = money(previewAmount, currency);

  // Nothing left to refund: every unit is already in the ledger and shipping isn't ticked. The
  // backend would be asked for a zero refund, so block it instead of pretending it did something.
  const nothingToRefund =
    isFullRefund && !isWholePaymentRefund && remaining.units === 0 && !includesShipping;
  const canConfirm = selectedReason.length > 0 && !nothingToRefund;

  const handleRefundConfirm = () => {
    const reasonCode = reasonCodeFor(selectedReason);
    // refundShipping is meaningful on every scope the backend reads it for; the whole-payment
    // case overrides it to true server-side, so sending the checkbox value verbatim is correct.
    refundOrder({
      reason: selectedReason,
      refundShipping: includesShipping,
      reasonCode,
      disposition,
    });
  };

  const fullRefundScope = isWholePaymentRefund
    ? 'refund whole order'
    : `refund remaining ${remaining.units} unit${remaining.units === 1 ? '' : 's'}`;
  const confirmLabel = isFullRefund
    ? `${fullRefundScope} · ${previewLabel}`
    : `refund ${unitCount} unit${unitCount === 1 ? '' : 's'} · ${previewLabel}`;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleRefundConfirm}
      title={isFullRefund ? 'full refund' : 'partial refund'}
      confirmLabel={confirmLabel}
      cancelLabel='cancel'
      confirmDisabled={!canConfirm}
    >
      <div className='flex flex-col gap-4 lg:w-[420px]'>
        {/* ordRefund v2 — the amount is the first thing you read */}
        <div className='flex items-baseline justify-between gap-4 border border-textColor px-3 py-2'>
          <Text variant='uppercase' size='micro' component='span' className='tracking-label'>
            refund amount
          </Text>
          <Text component='span' size='statBig'>
            {previewLabel}
          </Text>
        </div>

        {/* Судьба возвращённых единиц (Phase 8): restock — на полку; writeoff — списание
            (изделие изношено/повреждено, в продажу не возвращается); seconds — B-сток той же
            модели (уценка, пока не продаётся). */}
        <div className='space-y-1'>
          <Text variant='uppercase' size='micro' className='tracking-label'>
            судьба возврата
          </Text>
          <select
            className='w-full border border-borderColor bg-bgColor p-2 text-textBaseSize outline-none'
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
          >
            <option value='restock'>restock — годен, обратно в продажу</option>
            <option value='writeoff'>writeoff — изношен/повреждён, списать</option>
            <option value='seconds'>seconds — уценка, в B-сток</option>
          </select>
          {disposition !== 'restock' ? (
            <Text size='small' variant='inactive'>
              {disposition === 'writeoff'
                ? 'Единицы НЕ вернутся на склад; их себестоимость остаётся списанной в COGS.'
                : 'Единицы вернутся B-стоком той же модели с нулевой стоимостью (продажа B — после решения по цене).'}
            </Text>
          ) : null}
        </div>

        {/* Scope — full refund is loud, partial lists exactly what's affected */}
        {isFullRefund ? (
          <div className='space-y-2 border border-error p-3'>
            <Text variant='error' className='font-bold'>
              full refund — {isWholePaymentRefund ? 'entire order' : 'everything not yet refunded'}
            </Text>
            {isWholePaymentRefund ? (
              <Text size='small'>
                The order has not shipped, so this refunds the whole payment — every item AND the
                shipping fee{total ? ` (${money(toNum(total), currency)})` : ''}. This can’t be
                undone.
              </Text>
            ) : (
              <>
                <div className='space-y-1'>
                  <div className='flex items-center justify-between gap-3'>
                    <Text size='small'>
                      {remaining.units} unit{remaining.units === 1 ? '' : 's'} not yet refunded
                    </Text>
                    <Text size='small' className='tabular-nums'>
                      {money(remaining.amount, currency)}
                    </Text>
                  </div>
                  <div className='flex items-center justify-between gap-3'>
                    <Text size='small' variant={includesShipping ? undefined : 'inactive'}>
                      {includesShipping ? '+ shipping' : 'shipping — not refunded'}
                    </Text>
                    <Text size='small' className='tabular-nums'>
                      {includesShipping ? money(shippingFee, currency) : money(0, currency)}
                    </Text>
                  </div>
                </div>
                <Text size='small'>
                  The order has shipped, so the shipping fee is refunded only if you tick it below;
                  units already refunded are skipped. This can’t be undone.
                </Text>
              </>
            )}
            <Text size='small'>
              To refund only some units, close this and tick them in the items table.
            </Text>
            {nothingToRefund && (
              <Text variant='error' size='small' className='font-bold'>
                Every unit is already refunded and shipping is not ticked — there is nothing left to
                refund.
              </Text>
            )}
          </div>
        ) : (
          <div className='space-y-2 border border-textInactiveColor p-3'>
            <Text variant='uppercase' className='font-bold'>
              partial refund — {unitCount} unit{unitCount === 1 ? '' : 's'}
            </Text>
            <div className='space-y-1'>
              {selectedSummary.map((s) => (
                <div key={s.id} className='flex items-center justify-between gap-3'>
                  <Text size='small'>
                    {s.name} <span className='text-labelColor'>×{s.qty}</span>
                  </Text>
                  <Text size='small' className='tabular-nums'>
                    {money(s.amount, currency)}
                  </Text>
                </div>
              ))}
              {includesShipping && (
                <div className='flex items-center justify-between gap-3 border-t border-borderColor pt-1'>
                  <Text size='small'>+ shipping</Text>
                  <Text size='small' className='tabular-nums'>
                    {money(shippingFee, currency)}
                  </Text>
                </div>
              )}
            </div>
          </div>
        )}

        {canChooseShipping && (
          <div className='flex flex-col gap-1'>
            <label htmlFor='refund-shipping' className='flex items-center gap-2 cursor-pointer'>
              <Checkbox
                name='refund-shipping'
                checked={refundShipping}
                onCheckedChange={(checked: boolean | 'indeterminate') =>
                  setRefundShipping(checked === true)
                }
              />
              <Text variant='uppercase'>
                include shipping fee in refund ({money(shippingFee, currency)})
              </Text>
            </label>
            {/* `shipping_refunded` is not on the wire, so the client cannot tell whether an earlier
                refund already covered the fee. The backend gates on it and silently skips the
                second one, which would make this preview high by exactly the fee. Say so. */}
            {refundShipping && alreadyRefunded > 0 && (
              <Text size='micro' variant='label'>
                This order already has {money(alreadyRefunded, currency)} refunded — if that refund
                included shipping, the server skips the fee and the actual refund will be{' '}
                {money(shippingFee, currency)} lower.
              </Text>
            )}
          </div>
        )}

        {!isWholePaymentRefund && freeShipping && (
          <Text size='micro' variant='label'>
            Shipping was free on this order, so there is no fee to refund.
          </Text>
        )}

        {isWholePaymentRefund && (
          <div>
            <Pill tone='mut'>shipping always included · not yet shipped</Pill>
          </div>
        )}

        <div className='flex flex-col gap-2'>
          {existingReason && (
            <Text variant='inactive' size='small'>
              current reason: {existingReason}
            </Text>
          )}
          <Text variant='uppercase'>refund reason {canConfirm ? '' : '(required)'}</Text>
          <div className='grid grid-cols-2 gap-2'>
            {REASONS.map((l, i) => (
              <Button
                key={i}
                type='button'
                size='lg'
                className={cn('border border-textInactiveColor uppercase', {
                  'bg-textColor text-bgColor': selectedReason === l,
                })}
                onClick={() => setSelectedReason(l)}
              >
                {l}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </ConfirmationModal>
  );
}
