import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { FulfillmentCard } from './api/types';
import { FulfillmentBoard } from './components/fulfillment-board';
import { ShipModal } from './components/ship-modal';
import {
  useFulfillmentBoard,
  useMarkFulfillmentDelivered,
  useShipFulfillmentOrder,
} from './hooks/useFulfillment';

function BoardSkeleton() {
  return (
    <div className='flex gap-4 overflow-hidden'>
      {[0, 1, 2].map((c) => (
        <div key={c} className='flex w-72 shrink-0 flex-col gap-2'>
          <div className='h-5 w-24 animate-pulse bg-textInactiveColor' />
          {[0, 1, 2].map((i) => (
            <div key={i} className='h-24 animate-pulse border border-textInactiveColor' />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Fulfillment() {
  const { account, canRead, canWrite, resolved } = usePermissions();
  const navigate = useNavigate();

  const canView = !resolved || canRead(SECTION.fulfillment);
  const writable = canWrite(SECTION.fulfillment);

  const { data: columns = [], isLoading, isError, error, refetch } = useFulfillmentBoard();

  const ship = useShipFulfillmentOrder();
  const deliver = useMarkFulfillmentDelivered();

  const [shipping, setShipping] = useState<FulfillmentCard | null>(null);
  const [delivering, setDelivering] = useState<FulfillmentCard | null>(null);

  // Client-side board filters. Assignee is the whole point of the annotation —
  // "mine" makes a shared queue workable when several people pack orders.
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const username = account?.username;
  const filtersActive = search.trim() !== '' || mine;

  const filteredColumns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!filtersActive) return columns;
    return columns.map((col) => ({
      ...col,
      cards: col.cards.filter((c) => {
        if (mine && c.assignee !== username) return false;
        if (q && !`#${c.orderId} ${c.orderUuid}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    }));
  }, [columns, search, mine, username, filtersActive]);

  const noneVisible = filtersActive && filteredColumns.every((col) => col.cards.length === 0);

  const actingUuid = ship.isPending
    ? ship.variables?.orderUuid
    : deliver.isPending
      ? deliver.variables
      : undefined;

  function confirmShip(trackingCode: string) {
    if (!shipping) return;
    ship.mutate(
      { orderUuid: shipping.orderUuid, trackingCode },
      { onSuccess: () => setShipping(null) },
    );
  }

  function confirmDeliver() {
    if (!delivering || deliver.isPending) return;
    deliver.mutate(delivering.orderUuid, { onSuccess: () => setDelivering(null) });
  }

  if (!canView) {
    return (
      <div className='mx-auto flex max-w-md flex-col items-center gap-2 border border-textInactiveColor p-10 text-center'>
        <Text variant='uppercase' size='large'>
          fulfillment
        </Text>
        <Text variant='label' size='small'>
          You don’t have access to this section. Ask a super admin to grant it.
        </Text>
      </div>
    );
  }

  return (
    <div className='flex w-full flex-col gap-4 pb-10'>
      <div className='flex flex-col gap-1 border-b border-textInactiveColor pb-3'>
        <Text variant='uppercase' size='large'>
          fulfillment
        </Text>
        <Text variant='label' size='small'>
          Orders to pack and ship, oldest first. Ship records a tracking code and notifies the
          customer; delivered closes it out.
        </Text>
      </div>

      {isLoading ? (
        <BoardSkeleton />
      ) : isError ? (
        <div className='flex flex-col items-start gap-2 border border-textInactiveColor p-4'>
          <Text variant='error' size='small'>
            {error instanceof Error ? error.message : 'Failed to load the fulfillment board'}
          </Text>
          <Button variant='secondary' size='lg' onClick={() => refetch()}>
            retry
          </Button>
        </div>
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              name='fulfillment-search'
              placeholder='search order #…'
              className='w-full sm:w-48'
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
            {username && (
              <button
                type='button'
                onClick={() => setMine((v) => !v)}
                aria-pressed={mine}
                className={cn(
                  'border px-3 py-1 text-textBaseSize uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                  mine
                    ? 'border-textColor bg-textColor text-bgColor'
                    : 'border-textInactiveColor text-labelColor hover:border-textInactiveColor hover:text-textColor',
                )}
              >
                assigned to me
              </button>
            )}
            {filtersActive && (
              <button
                type='button'
                onClick={() => {
                  setSearch('');
                  setMine(false);
                }}
                className='px-2 text-textBaseSize uppercase text-labelColor underline hover:text-textColor'
              >
                clear
              </button>
            )}
          </div>

          {noneVisible && (
            <div className='flex flex-wrap items-center gap-3 border border-textInactiveColor p-3'>
              <Text variant='label' size='small'>
                No orders match your filters.
              </Text>
              <button
                type='button'
                onClick={() => {
                  setSearch('');
                  setMine(false);
                }}
                className='text-textBaseSize uppercase underline hover:text-textColor'
              >
                clear filters
              </button>
            </div>
          )}

          <FulfillmentBoard
            columns={filteredColumns}
            canWrite={writable}
            actingUuid={actingUuid}
            onOpen={(uuid) => navigate(`${ROUTES.fulfillment}/${uuid}`)}
            onShip={(card) => setShipping(card)}
            onDeliver={(card) => setDelivering(card)}
          />
        </>
      )}

      <ShipModal
        open={!!shipping}
        onOpenChange={(o) => !o && setShipping(null)}
        orderLabel={shipping ? `#${shipping.orderId}` : ''}
        saving={ship.isPending}
        onConfirm={confirmShip}
      />

      <ConfirmationModal
        open={!!delivering}
        onOpenChange={(o) => !o && setDelivering(null)}
        onConfirm={confirmDeliver}
        confirmDisabled={deliver.isPending}
        title='mark delivered'
        confirmLabel='mark delivered'
      >
        <Text size='small'>
          Mark order {delivering ? `#${delivering.orderId}` : ''} as delivered? This closes out
          fulfillment for the order.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
