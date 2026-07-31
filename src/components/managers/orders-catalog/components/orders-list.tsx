import { common_Order } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Row } from 'ui/components/row';
import { SkeletonLine } from 'ui/components/skeleton';
import Text from 'ui/components/text';
import { OrderStatus } from './order-status';
import { formatDateShort, getOrderStatusName } from './utility';

/**
 * ordTable v3 — "two-line dense row". Not a table: an order is two lines, facts on
 * line one and context on line two. Sorting therefore lives in a control above the
 * list (ordPaging v2 on the page), because there is no column header left to click.
 *
 * ordEmpty v2 — loading shows the SHAPE of the answer (hatched skeleton rows) and the
 * empty state names the filters that produced it and offers the way out. The old
 * "loading… / no orders found" single centred string could not tell those apart.
 */

interface Props {
  orders: common_Order[];
  /** True only while the FIRST page is in flight — later pages append below. */
  isLoading: boolean;
  /** Human-readable descriptions of what is currently narrowing the list. */
  activeFilters: string[];
  onClearFilters: () => void;
}

function shortUuid(uuid: string): string {
  return uuid.length > 12 ? `${uuid.slice(0, 4)}…${uuid.slice(-4)}` : uuid;
}

export function OrdersList({ orders, isLoading, activeFilters, onClearFilters }: Props) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();

  const open = (order: common_Order) => navigate(`${ROUTES.orders}/${order.uuid}`);

  const copyReference = (uuid: string) => {
    navigator.clipboard
      .writeText(uuid)
      .then(() => showMessage('order reference copied', 'success'))
      .catch(() => showMessage('could not copy the order reference', 'error'));
  };

  if (isLoading && !orders.length) {
    return <OrdersSkeleton />;
  }

  if (!orders.length) {
    return (
      <CalloutBox className='flex flex-wrap items-baseline gap-1.5'>
        <Text size='micro' component='span' className='font-bold uppercase tracking-label'>
          {activeFilters.length ? 'no orders match' : 'no orders yet'}
        </Text>
        {activeFilters.length > 0 && (
          <Text size='micro' variant='label' component='span'>
            — {activeFilters.join(' + ')}
          </Text>
        )}
        {activeFilters.length > 0 && (
          <Button variant='underline' size='xs' onClick={onClearFilters} className='ml-auto'>
            clear filters
          </Button>
        )}
      </CalloutBox>
    );
  }

  return (
    <div className='border border-borderColor bg-bgColor'>
      {orders.map((order) => {
        const statusName = getOrderStatusName(dictionary, order.orderStatusId);
        // common_Order projects the buyer onto ListOrders rows, but either half can be
        // empty (guest / legacy orders) — render only the pieces that are there.
        const buyerName = [order.buyerFirstName, order.buyerLastName]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(' ');
        const buyerEmail = order.buyerEmail?.trim();
        const who = [buyerName, buyerEmail].filter(Boolean).join(' · ');
        const uuid = order.uuid ?? '';

        return (
          <div
            key={order.id ?? uuid}
            role='link'
            tabIndex={0}
            aria-label={`order ${order.id ?? uuid}`}
            onClick={() => open(order)}
            onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open(order);
              }
            }}
            className='cursor-pointer transition-colors hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor [&:last-child>div]:border-b-0'
          >
            <Row
              className='items-start px-2 py-2.5'
              label={
                <span className='flex min-w-0 flex-col gap-0.5'>
                  <span className='flex flex-wrap items-center gap-1.5'>
                    <Text component='span' className='font-bold'>
                      #{order.id ?? '—'}
                    </Text>
                    <OrderStatus status={statusName} />
                    {who && (
                      <Text size='micro' variant='label' component='span' className='truncate'>
                        {who}
                      </Text>
                    )}
                  </span>
                  <span className='flex flex-wrap items-center gap-1.5'>
                    {uuid && (
                      <Button
                        variant='underline'
                        size='xs'
                        title='copy order reference'
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          copyReference(uuid);
                        }}
                      >
                        {shortUuid(uuid)}
                      </Button>
                    )}
                    {order.refundReason?.trim() && (
                      <Text size='micro' variant='label' component='span' className='truncate'>
                        · refund reason: {order.refundReason.trim()}
                      </Text>
                    )}
                    {order.orderComment?.trim() && (
                      <Text size='micro' variant='label' component='span' className='truncate'>
                        · {order.orderComment.trim()}
                      </Text>
                    )}
                  </span>
                </span>
              }
              value={
                <span className='flex flex-col items-end gap-0.5'>
                  <Text component='span' className='font-bold'>
                    {order.totalPrice?.value ?? '—'} {order.currency ?? ''}
                  </Text>
                  <Text size='micro' variant='label' component='span'>
                    {formatDateShort(order.placed)}
                  </Text>
                </span>
              }
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The hatched stand-in for a page of rows. Deliberately mirrors the two-line shape
 * above so nothing jumps when the data lands.
 *
 * `SkeletonLine` rather than `SkeletonRows`: the latter emits `<tr>` elements and this
 * list is no longer a table (ordTable v3), so the row form is the one that fits.
 */
function OrdersSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className='border border-borderColor bg-bgColor' aria-busy='true' aria-label='loading orders'>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className='flex items-start justify-between gap-2.5 border-b border-hairline px-2 py-2.5 last:border-b-0'
        >
          <span className='flex w-full min-w-0 max-w-96 flex-col gap-1'>
            <SkeletonLine width={160} />
            <SkeletonLine width={220} />
          </span>
          <span className='flex shrink-0 flex-col items-end gap-1'>
            <SkeletonLine width={84} />
            <SkeletonLine width={64} />
          </span>
        </div>
      ))}
    </div>
  );
}
