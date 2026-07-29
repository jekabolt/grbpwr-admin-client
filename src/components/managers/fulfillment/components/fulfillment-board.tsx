import { Board, BoardColumn, BoardEmpty } from 'ui/components/board';
import {
  FulfillmentCard as FulfillmentCardModel,
  FulfillmentColumn,
  FulfillmentColumnCards,
} from '../api/types';
import {
  COLUMN_EMPTY,
  COLUMN_LABEL,
  PRIMARY_COLUMN,
  PRIMARY_WIDTH,
  SIDE_COLUMNS,
  SIDE_WIDTH,
} from '../utils/meta';
import { FulfillmentCard } from './fulfillment-card';

// ffBoard v3 — a to-pack FOCUS with two side lists, not three equal lanes. The
// primary column (to pack) is roughly twice as wide as the shipped / delivered
// reference lists beside it. Still status-bound and NOT drag-and-drop: moving a
// card forward performs a real, irreversible order transition, so progression is
// via the explicit ship / deliver actions on each card.
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

  const renderColumn = (col: FulfillmentColumn, width: number) => {
    const cards = byColumn.get(col) ?? [];
    return (
      <BoardColumn key={col} title={COLUMN_LABEL[col]} count={cards.length} width={width}>
        {cards.length === 0 ? (
          <BoardEmpty>{COLUMN_EMPTY[col]}</BoardEmpty>
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
      </BoardColumn>
    );
  };

  return (
    <Board>
      {renderColumn(PRIMARY_COLUMN, PRIMARY_WIDTH)}
      {SIDE_COLUMNS.map((col) => renderColumn(col, SIDE_WIDTH))}
    </Board>
  );
}
