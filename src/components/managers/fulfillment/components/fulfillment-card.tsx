import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { FulfillmentCard as FulfillmentCardModel } from '../api/types';
import { COLUMN_ACTION, formatMoney, initials } from '../utils/meta';

// One order tile on the board. Body click opens the card detail; the forward
// action (ship / mark delivered) is a sibling button so it never doubles as the
// open target. Delivered cards have no action.
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
  const check = card.checklistTotal > 0 ? `✓ ${card.checklistDone}/${card.checklistTotal}` : '';

  return (
    <div className='flex flex-col gap-2 border border-textInactiveColor bg-bgColor p-3 transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-textInactiveColor hover:shadow-[2px_2px_0_0_var(--text)] motion-reduce:hover:translate-y-0'>
      <button
        type='button'
        onClick={() => onOpen(card.orderUuid)}
        aria-label={`Open order #${card.orderId}`}
        className='flex flex-col gap-2 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        <div className='flex items-baseline justify-between gap-2'>
          <Text className='font-bold'>#{card.orderId}</Text>
          <Text size='small'>{formatMoney(card.total, card.currency)}</Text>
        </div>

        <Text variant='label' size='small'>
          placed {formatDateShort(card.placed) || '—'}
        </Text>

        <div className='flex items-center justify-between gap-2'>
          <div className='flex min-w-0 items-center gap-2 text-[10px] uppercase text-labelColor'>
            {check && <span>{check}</span>}
            {card.hasNotes && <span title='has packing notes'>notes</span>}
          </div>
          {card.assignee ? (
            <span
              title={card.assignee}
              className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-textColor text-[10px] leading-none text-bgColor'
            >
              {initials(card.assignee)}
            </span>
          ) : (
            <span
              title='unassigned'
              className='h-5 w-5 shrink-0 rounded-full border border-dashed border-textInactiveColor'
            />
          )}
        </div>
      </button>

      {canWrite && action && (
        <Button
          type='button'
          variant='secondary'
          size='lg'
          loading={busy}
          disabled={busy}
          className={cn('w-full')}
          onClick={() => (action === 'ship' ? onShip(card) : onDeliver(card))}
        >
          {action === 'ship' ? 'ship' : 'mark delivered'}
        </Button>
      )}
    </div>
  );
}
