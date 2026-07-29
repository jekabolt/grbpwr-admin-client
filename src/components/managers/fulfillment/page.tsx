import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarPicker } from 'ui/components/avatar';
import { Board, BoardColumn } from 'ui/components/board';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { SectionHeader } from 'ui/components/section-header';
import { SkeletonBlocks } from 'ui/components/skeleton';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';
import { FulfillmentCard } from './api/types';
import { FulfillmentBoard } from './components/fulfillment-board';
import { PickupModal } from './components/pickup-modal';
import { ShipLabelModal } from './components/ship-label-modal';
import { useFulfillmentBoard, useMarkFulfillmentDelivered } from './hooks/useFulfillment';
import {
  AGING_DAYS,
  COLUMN_LABEL,
  isOverdue,
  PRIMARY_WIDTH,
  SIDE_COLUMNS,
  SIDE_WIDTH,
} from './utils/meta';

function BoardSkeleton() {
  return (
    <Board>
      <BoardColumn title={COLUMN_LABEL.FULFILLMENT_COLUMN_TO_FULFILL} width={PRIMARY_WIDTH}>
        <div className='p-2'>
          <SkeletonBlocks count={4} height={72} />
        </div>
      </BoardColumn>
      {SIDE_COLUMNS.map((col) => (
        <BoardColumn key={col} title={COLUMN_LABEL[col]} width={SIDE_WIDTH}>
          <div className='p-2'>
            <SkeletonBlocks count={2} height={72} />
          </div>
        </BoardColumn>
      ))}
    </Board>
  );
}

export function Fulfillment() {
  const { canRead, canWrite, resolved } = usePermissions();
  const navigate = useNavigate();

  const canView = !resolved || canRead(SECTION.fulfillment);
  const writable = canWrite(SECTION.fulfillment);

  const { data: columns = [], isLoading, isError, error, refetch } = useFulfillmentBoard();

  const deliver = useMarkFulfillmentDelivered();

  const [shipping, setShipping] = useState<FulfillmentCard | null>(null);
  const [delivering, setDelivering] = useState<FulfillmentCard | null>(null);
  const [pickupOpen, setPickupOpen] = useState(false);

  // ffFilters v3 — the only board filter is an assignee avatar row. `undefined` = no
  // filter; `''` = the unassigned pile. Faces + counts are derived from the board.
  const [assignee, setAssignee] = useState<string | undefined>(undefined);
  const filtersActive = assignee !== undefined;

  const byColumn = useMemo(() => {
    const m = new Map<string, FulfillmentCard[]>();
    for (const col of columns) m.set(col.column, col.cards);
    return m;
  }, [columns]);

  // ffKpi v2 — four tiles derived from the columns the client already holds (there
  // is no aggregate RPC). Every figure is honest: to-pack / in-transit / delivered
  // are lane counts, overdue is the aged subset of to-pack. Gap note (ff-board-kpi):
  // "shipped today" is NOT derivable — the card has no ship timestamp, only `placed`
  // — so the fourth tile is `delivered (recent)` from the delivered lane instead.
  const kpi = useMemo(() => {
    const toPack = byColumn.get('FULFILLMENT_COLUMN_TO_FULFILL') ?? [];
    const shipped = byColumn.get('FULFILLMENT_COLUMN_SHIPPED') ?? [];
    const delivered = byColumn.get('FULFILLMENT_COLUMN_DELIVERED') ?? [];
    return {
      toPack: toPack.length,
      shipped: shipped.length,
      delivered: delivered.length,
      overdue: toPack.filter((c) => isOverdue(c.placed)).length,
      unassigned: toPack.filter((c) => !c.assignee).length,
    };
  }, [byColumn]);

  // Assignee faces: every owner across the board with their pile count, busiest
  // first, the unassigned pile ('') last.
  const people = useMemo(() => {
    const counts = new Map<string, number>();
    for (const col of columns)
      for (const c of col.cards) {
        const k = c.assignee || '';
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    const named = [...counts.entries()]
      .filter(([k]) => k !== '')
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
    const unassigned = counts.get('') ?? 0;
    return unassigned > 0 ? [...named, { name: '', count: unassigned }] : named;
  }, [columns]);

  const filteredColumns = useMemo(() => {
    if (!filtersActive) return columns;
    return columns.map((col) => ({
      ...col,
      cards: col.cards.filter((c) => (c.assignee || '') === assignee),
    }));
  }, [columns, assignee, filtersActive]);

  const noneVisible = filtersActive && filteredColumns.every((col) => col.cards.length === 0);
  const actingUuid = deliver.isPending ? deliver.variables : undefined;

  function confirmDeliver() {
    if (!delivering || deliver.isPending) return;
    deliver.mutate(delivering.orderUuid, { onSuccess: () => setDelivering(null) });
  }

  if (!canView) {
    return (
      <div className='flex flex-col gap-2.5 pb-16'>
        <SectionHeader title='fulfillment' question='orders to pack, ship and close out' />
        <CalloutBox tone='note'>
          <Text size='micro' variant='label' component='span'>
            You don’t have access to this section — ask a super admin to grant it.
          </Text>
        </CalloutBox>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4 pb-16'>
      <SectionHeader
        title='fulfillment'
        question='what is paid and waiting to ship — and what is already on its way?'
        action={
          writable && (
            <Button type='button' variant='secondary' size='sm' onClick={() => setPickupOpen(true)}>
              schedule pickup
            </Button>
          )
        }
      />

      {isLoading ? (
        <BoardSkeleton />
      ) : isError ? (
        <CalloutBox tone='error' className='flex flex-wrap items-center gap-3'>
          <Text size='micro' variant='error' tracking='label' component='span'>
            {error instanceof Error ? error.message : 'failed to load the fulfillment board'}
          </Text>
          <Button variant='underline' size='xs' onClick={() => refetch()}>
            retry
          </Button>
        </CalloutBox>
      ) : (
        <>
          <StatGrid min={150}>
            <Stat
              label='to pack'
              value={String(kpi.toPack)}
              sub={kpi.unassigned > 0 ? `${kpi.unassigned} unassigned` : 'all assigned'}
              tone={kpi.unassigned > 0 ? 'down' : undefined}
            />
            <Stat
              label='overdue'
              value={String(kpi.overdue)}
              sub={`aged > ${AGING_DAYS}d in queue`}
              tone={kpi.overdue > 0 ? 'down' : undefined}
            />
            <Stat label='in transit' value={String(kpi.shipped)} sub='shipped, not delivered' />
            <Stat label='delivered' value={String(kpi.delivered)} sub='recently completed' />
          </StatGrid>

          {people.length > 0 && (
            <Toolbar>
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='uppercase'
              >
                assignee
              </Text>
              <AvatarPicker people={people} selected={assignee} onSelect={setAssignee} />
              {filtersActive && (
                <Button
                  variant='underline'
                  size='xs'
                  className='ml-auto'
                  onClick={() => setAssignee(undefined)}
                >
                  clear filter
                </Button>
              )}
            </Toolbar>
          )}

          {noneVisible ? (
            <CalloutBox className='flex flex-wrap items-center gap-3'>
              <Text size='micro' variant='label' component='span'>
                no orders assigned to {assignee ? assignee : 'nobody'}
              </Text>
              <Button
                variant='underline'
                size='xs'
                className='ml-auto'
                onClick={() => setAssignee(undefined)}
              >
                clear filter
              </Button>
            </CalloutBox>
          ) : (
            <FulfillmentBoard
              columns={filteredColumns}
              canWrite={writable}
              actingUuid={actingUuid}
              onOpen={(uuid) => navigate(`${ROUTES.fulfillment}/${uuid}`)}
              onShip={(card) => setShipping(card)}
              onDeliver={(card) => setDelivering(card)}
            />
          )}
        </>
      )}

      <ShipLabelModal
        open={!!shipping}
        onOpenChange={(o) => !o && setShipping(null)}
        orderUuid={shipping?.orderUuid ?? null}
        orderLabel={shipping ? `#${shipping.orderId}` : ''}
      />

      <PickupModal
        open={pickupOpen}
        onOpenChange={setPickupOpen}
        defaultQuantity={kpi.shipped || 1}
      />

      <ConfirmationModal
        open={!!delivering}
        onOpenChange={(o) => !o && setDelivering(null)}
        onConfirm={confirmDeliver}
        confirmDisabled={deliver.isPending}
        closeOnConfirm={false}
        title='mark delivered?'
        confirmLabel='mark delivered'
        width='sm'
      >
        <Text size='micro' variant='label' component='span'>
          Mark order {delivering ? `#${delivering.orderId}` : ''} as delivered? This closes out
          fulfillment for the order.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
