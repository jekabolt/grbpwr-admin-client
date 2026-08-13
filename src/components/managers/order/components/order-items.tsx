import type { common_OrderFull, common_OrderItem } from 'api/proto-http/frontend';
import { useMemo } from 'react';
import Checkbox from 'ui/components/checkbox';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { money, toNum } from '../money';

export type OrderLine = {
  item: common_OrderItem;
  qty: number;
  unitPrice: number;
  basePrice: number;
  salePct: number;
  lineTotal: number;
  /** Units of this line already refunded, from the refunded_order_item ledger. */
  refundedQty: number;
  /** Units still refundable (qty − refundedQty). */
  remainingQty: number;
  /** Every unit refunded — the line is closed and offers no checkboxes. */
  refunded: boolean;
  /** One key per STILL-REFUNDABLE unit — the refund payload sends one order_item id per unit. */
  unitKeys: string[];
};

/** The minimum shape the refund-quantity helpers need — satisfied by admin and frontend items. */
type QuantifiedItem = { id?: number; orderItem?: { quantity?: number } };

/** A line's unit count; a missing quantity means one unit, never zero. */
export function lineUnits(item: QuantifiedItem): number {
  return Math.max(1, item.orderItem?.quantity ?? 1);
}

/**
 * Units already refunded, per order-item id.
 *
 * The refunded_order_item ledger returns one entry per refund carrying the SAME order-item id as
 * the line it came from, with `quantity` = the units that refund covered (backend
 * store/order/fetch.go mergeRefundedOrderItems). So membership of an id proves nothing about
 * whether the LINE is done — refunding 1 of 2 units leaves the second unit refundable, and the
 * backend explicitly allows refunding it from PARTIALLY REFUNDED. Quantities accumulate per id.
 *
 * Shared with the refund modal, whose preview has to match calculateFullRefundAmount server-side.
 */
export function refundedUnitsByItemId(refundedOrderItems?: QuantifiedItem[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of refundedOrderItems ?? []) {
    if (typeof r.id !== 'number') continue;
    out.set(r.id, (out.get(r.id) ?? 0) + lineUnits(r));
  }
  return out;
}

/** One row per ORDER LINE with its per-unit refund keys, shared by the card grid and the modal. */
export function useOrderLines(orderDetails?: common_OrderFull): OrderLine[] {
  return useMemo(() => {
    const refundedUnits = refundedUnitsByItemId(orderDetails?.refundedOrderItems);
    return (orderDetails?.orderItems ?? []).map((item) => {
      const qty = lineUnits(item);
      const unitPrice = toNum(item.productPriceWithSale);
      const basePrice = toNum(item.productPrice);
      const salePct = toNum(item.productSalePercentage);
      const id = typeof item.id === 'number' ? item.id : null;
      const refundedQty = id == null ? 0 : Math.min(qty, refundedUnits.get(id) ?? 0);
      const remainingQty = Math.max(0, qty - refundedQty);
      return {
        item,
        qty,
        unitPrice,
        basePrice,
        salePct,
        lineTotal: unitPrice * qty,
        refundedQty,
        remainingQty,
        refunded: refundedQty > 0 && remainingQty === 0,
        // Only the units that are still refundable get a key/checkbox. The units are
        // interchangeable (the payload encodes quantity by repeating the id), so indexing the
        // remainder from 0 is enough.
        unitKeys: id == null ? [] : Array.from({ length: remainingQty }, (_, i) => `${id}-${i}`),
      };
    });
  }, [orderDetails?.orderItems, orderDetails?.refundedOrderItems]);
}

function UnitSelector({
  line,
  selectedUnitKeys,
  onToggleOrderItems,
}: {
  line: OrderLine;
  selectedUnitKeys: string[];
  onToggleOrderItems?: (unitKeys: string[]) => void;
}) {
  if (line.refunded) return <Pill tone='mut'>refunded</Pill>;
  if (!line.unitKeys.length || !onToggleOrderItems) return null;

  // Quantity 1 reads as one checkbox; a multi-unit line gets one box per REMAINING unit so a
  // "refund 1 of 2" is expressible without ever leaving the card — and so the second unit of an
  // already-partially-refunded line is still refundable, which the backend allows.
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        refund
      </Text>
      {line.refundedQty > 0 && (
        <Pill tone='mut'>
          {line.refundedQty} of {line.qty} refunded
        </Pill>
      )}
      {line.unitKeys.map((key, i) => (
        <label key={key} className='flex cursor-pointer items-center gap-1'>
          <Checkbox
            name={`refund-${key}`}
            checked={selectedUnitKeys.includes(key)}
            onChange={() => onToggleOrderItems([key])}
          />
          {line.unitKeys.length > 1 && (
            <Text size='micro' variant='label' component='span'>
              {i + 1}
            </Text>
          )}
        </label>
      ))}
    </div>
  );
}

/**
 * ordItems v3 — cards with big thumbnails, because the thumbnail is what the packer
 * actually reads. Refund selection stays per unit (the payload sends one id per unit); it is
 * just expressed on the card instead of as a wall of identical table rows.
 */
export function OrderItems({
  orderDetails,
  currency,
  showRefundSelection = false,
  selectedUnitKeys = [],
  onToggleOrderItems,
}: {
  orderDetails?: common_OrderFull;
  currency?: string;
  showRefundSelection?: boolean;
  selectedUnitKeys?: string[];
  onToggleOrderItems?: (unitKeys: string[]) => void;
}) {
  const lines = useOrderLines(orderDetails);

  if (!lines.length) {
    return <Placeholder label='no items on this order' className='py-8' />;
  }

  return (
    <Tiles min={230}>
      {lines.map((line, idx) => {
        const selected = line.unitKeys.some((k) => selectedUnitKeys.includes(k));
        const size = line.item.sizeNameSnapshot?.replace('SIZE_ENUM_', '');
        return (
          <Tile
            key={line.item.id ?? idx}
            selected={selected}
            // `flex-row` явно: плитка по умолчанию складывает содержимое колонкой (миниатюра →
            // имя → подпись), а строка заказа — карточка ВБОК: фото слева, текст справа.
            className={line.refunded ? 'flex flex-row gap-2 opacity-60' : 'flex flex-row gap-2'}
          >
            <span className='w-[52px] shrink-0'>
              {line.item.thumbnail ? (
                <Media src={line.item.thumbnail} alt='' aspectRatio='3/4' fit='cover' />
              ) : (
                <Placeholder aspect='3/4' />
              )}
            </span>
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <Text size='micro' className='truncate font-bold uppercase'>
                {line.item.translations?.[0]?.name || '—'}
              </Text>
              <Text size='micro' variant='label' className='truncate'>
                {line.item.variantSkuSnapshot || '—'}
              </Text>
              <Text size='micro' variant='label'>
                {size ? `size ${size}` : 'size —'} · ×{line.qty}
              </Text>
              <div className='flex items-baseline gap-1.5'>
                <Text component='span' className='font-bold tabular-nums'>
                  {money(line.lineTotal, currency)}
                </Text>
                {line.salePct > 0 && (
                  <Text size='micro' variant='label' component='span'>
                    −{line.salePct}%
                  </Text>
                )}
              </div>
              {showRefundSelection && (
                <UnitSelector
                  line={line}
                  selectedUnitKeys={selectedUnitKeys}
                  onToggleOrderItems={onToggleOrderItems}
                />
              )}
              {!showRefundSelection && line.refundedQty > 0 && (
                <Pill tone='mut'>
                  {line.refunded ? 'refunded' : `${line.refundedQty} of ${line.qty} refunded`}
                </Pill>
              )}
            </div>
          </Tile>
        );
      })}
    </Tiles>
  );
}
