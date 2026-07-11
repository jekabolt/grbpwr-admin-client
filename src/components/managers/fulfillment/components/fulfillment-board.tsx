import Text from 'ui/components/text';
import {
  FulfillmentCard as FulfillmentCardModel,
  FulfillmentColumn,
  FulfillmentColumnCards,
} from '../api/types';
import { COLUMN_EMPTY, COLUMN_HINT, COLUMN_LABEL, COLUMNS } from '../utils/meta';
import { FulfillmentCard } from './fulfillment-card';

// Three status-bound lanes (to fulfill → shipped → delivered). Not drag-and-drop:
// each column maps to a real order status, and moving forward performs an
// irreversible order transition, so progression is via explicit card actions.
export function FulfillmentBoard({
  columns,
  canWrite,
  actingUuid,
  onOpen,
  onShip,
  onDeliver,
}: {
  columns: FulfillmentColumnCards[];
  canWrite: boolean;
  actingUuid?: string;
  onOpen: (orderUuid: string) => void;
  onShip: (card: FulfillmentCardModel) => void;
  onDeliver: (card: FulfillmentCardModel) => void;
}) {
  const byColumn = new Map<FulfillmentColumn, FulfillmentCardModel[]>(
    columns.map((c) => [c.column, c.cards]),
  );

  return (
    <div
      aria-label='fulfillment board columns'
      className='flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:snap-none'
    >
      {COLUMNS.map((col) => {
        const cards = byColumn.get(col) ?? [];
        return (
          <section key={col} className='flex w-[85vw] shrink-0 snap-start flex-col sm:w-72'>
            <header className='sticky top-0 z-10 flex flex-col gap-0.5 border-b border-textInactiveColor bg-bgColor pb-2'>
              <div className='flex items-baseline gap-2'>
                <Text variant='uppercase' size='small' component='span'>
                  {COLUMN_LABEL[col]}
                </Text>
                <span className='text-[11px] text-labelColor'>{cards.length}</span>
              </div>
              <Text variant='label' size='small' className='text-[10px]'>
                {COLUMN_HINT[col]}
              </Text>
            </header>

            <div className='mt-2 flex min-h-24 flex-1 flex-col gap-2 bg-black/[0.02] p-1'>
              {cards.length === 0 ? (
                <div className='flex flex-1 items-center justify-center py-6 text-center text-[11px] uppercase text-labelColor'>
                  {COLUMN_EMPTY[col]}
                </div>
              ) : (
                cards.map((card) => (
                  <FulfillmentCard
                    key={card.orderUuid}
                    card={card}
                    canWrite={canWrite}
                    busy={actingUuid === card.orderUuid}
                    onOpen={onOpen}
                    onShip={onShip}
                    onDeliver={onDeliver}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
