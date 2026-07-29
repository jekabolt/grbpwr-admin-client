import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { BoardCard } from 'ui/components/board';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { FulfillmentCard as FulfillmentCardModel } from '../api/types';
import { CardAssignee } from './card-assignee';
import { cardAgeDays, COLUMN_ACTION, formatMoney, isOverdue } from '../utils/meta';

// ffCard v2 — one order tile on the board. The whole card opens the detail; the
// forward action (ship / mark delivered) and the assignee popover live inside it
// and stop the click from bubbling, so neither doubles as the open target.
//
// Gap note (ff-card-summary): the board RPC projects a common_Order onto each card
// (see api/types → FulfillmentCard), which carries NO order items — so there is no
// thumbnail and no item count to show here, and fetching them per card would be the
// forbidden N+1. We therefore render a quiet Placeholder where the preview would go
// and surface only what the card actually holds: assignee, checklist progress,
// packing-notes flag and (for the to-pack lane) queue age. Real thumbnails / item
// counts need the board RPC to project order items first.
export function FulfillmentCard({
  card,
  canWrite,
  onOpen,
  onShip,
  onDeliver,
  busy,
}: {
  card: FulfillmentCardModel;
  canWrite: boolean;
  onOpen: (orderUuid: string) => void;
  onShip: (card: FulfillmentCardModel) => void;
  onDeliver: (card: FulfillmentCardModel) => void;
  busy?: boolean;
}) {
  const action = COLUMN_ACTION[card.column];
  const isToPack = card.column === 'FULFILLMENT_COLUMN_TO_FULFILL';
  const overdue = isToPack && isOverdue(card.placed);
  const age = cardAgeDays(card.placed);
  const checklistDone = card.checklistTotal > 0 && card.checklistDone >= card.checklistTotal;

  return (
    <BoardCard onClick={() => onOpen(card.orderUuid)}>
      <div className='flex flex-col gap-1.5'>
        <div className='flex items-start gap-2'>
          {/* No thumbnail on the board card — striped slot stands in for the preview. */}
          <Placeholder aspect='square' className='w-9 shrink-0' />
          <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
            <div className='flex flex-wrap items-center gap-1.5'>
              <Text component='span' className='font-bold'>
                #{card.orderId}
              </Text>
              {overdue && <Pill tone='warn'>overdue</Pill>}
            </div>
            <Text size='micro' variant='label' component='span'>
              placed {formatDateShort(card.placed) || '—'}
              {isToPack && age > 0 ? ` · ${age}d` : ''}
            </Text>
          </div>
          <Text component='span' className='shrink-0 font-bold tabular-nums'>
            {formatMoney(card.total, card.currency)}
          </Text>
        </div>

        <div className='flex items-center gap-1.5'>
          {card.checklistTotal > 0 && (
            <Pill tone={checklistDone ? 'ok' : 'mut'}>
              ✓ {card.checklistDone}/{card.checklistTotal}
            </Pill>
          )}
          {card.hasNotes && <Pill tone='mut'>notes</Pill>}
          <div className='ml-auto'>
            <CardAssignee orderUuid={card.orderUuid} assignee={card.assignee} canWrite={canWrite} />
          </div>
        </div>

        {canWrite && action && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            loading={busy}
            disabled={busy}
            className='w-full'
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              action === 'ship' ? onShip(card) : onDeliver(card);
            }}
          >
            {action === 'ship' ? 'ship' : 'mark delivered'}
          </Button>
        )}
      </div>
    </BoardCard>
  );
}
