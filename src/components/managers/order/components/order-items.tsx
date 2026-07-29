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
  refunded: boolean;
  /** One key per unit — the refund payload sends one order_item id per unit. */
  unitKeys: string[];
};

/** One row per ORDER LINE with its per-unit refund keys, shared by the card grid and the modal. */
export function useOrderLines(orderDetails?: common_OrderFull): OrderLine[] {
  return useMemo(() => {
    const refundedIds = new Set(
      (orderDetails?.refundedOrderItems ?? []).map((r) => r.id).filter((id) => id != null),
    );
    return (orderDetails?.orderItems ?? []).map((item) => {
      const qty = Math.max(1, item.orderItem?.quantity ?? 1);
      const unitPrice = toNum(item.productPriceWithSale);
      const basePrice = toNum(item.productPrice);
      const salePct = toNum(item.productSalePercentage);
      const id = typeof item.id === 'number' ? item.id : null;
      return {
        item,
        qty,
        unitPrice,
        basePrice,
        salePct,
        lineTotal: unitPrice * qty,
        refunded: id != null && refundedIds.has(id),
        unitKeys: id == null ? [] : Array.from({ length: qty }, (_, i) => `${id}-${i}`),
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

  // Quantity 1 reads as one checkbox; a multi-unit line gets one box per unit so a
  // "refund 1 of 2" is expressible without ever leaving the card.
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        refund
      </Text>
      {line.unitKeys.map((key, i) => (
        <label key={key} className='flex cursor-pointer items-center gap-1'>
          <Checkbox
            name={`refund-${key}`}
            checked={selectedUnitKeys.includes(key)}
            onChange={() => onToggleOrderItems([key])}
          />
          {line.qty > 1 && (
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
            className={line.refunded ? 'flex gap-2 opacity-60' : 'flex gap-2'}
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
              {!showRefundSelection && line.refunded && <Pill tone='mut'>refunded</Pill>}
            </div>
          </Tile>
        );
      })}
    </Tiles>
  );
}
