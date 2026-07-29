import { common_OrderStatusEnum } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { statusOptions } from 'constants/filter';
import { ROUTES, SECTION } from 'constants/routes';
import { cn } from 'lib/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { deriveOrderCounts, type OrderStat } from './components/order-stats';
import { OrdersList } from './components/orders-list';
import { StockChangesReport } from './components/StockChangesReport';
import { useInfiniteOrders } from './components/useOrdersQuery';

// The three queue statuses the counts strip (ordHead v2) exposes as one-click filters,
// plus their labels. `today` is a revenue figure, not a filter, so it is not here.
const QUEUE_FILTERS: { key: keyof ReturnType<typeof deriveOrderCounts>; status: common_OrderStatusEnum; label: string }[] = [
  { key: 'toFulfil', status: 'ORDER_STATUS_ENUM_CONFIRMED', label: 'to fulfil' },
  { key: 'awaitingPayment', status: 'ORDER_STATUS_ENUM_AWAITING_PAYMENT', label: 'awaiting pay' },
  { key: 'refundInProgress', status: 'ORDER_STATUS_ENUM_REFUND_IN_PROGRESS', label: 'refunds' },
];

/**
 * A counts-strip cell that is also a filter link. Mirrors `Stat`'s cell grammar so it
 * sits flush in the same `StatGrid`, but it is a button and inverts when its status is
 * the active filter. The three queue cells derive their figures from the loaded pages
 * only (see order-stats.ts) — there is no aggregate RPC — so nothing here claims to be
 * the whole table.
 */
function StatButton({
  label,
  stat,
  active,
  onClick,
}: {
  label: string;
  stat: OrderStat;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'border-b border-r border-borderColor px-2.5 py-2 text-left transition-colors',
        active ? 'bg-textColor text-bgColor' : 'hover:bg-bgZebra',
      )}
    >
      <span className='block text-micro uppercase tracking-label'>{label}</span>
      <span className='block text-stat font-bold tabular-nums'>{stat.value}</span>
      <span className={cn('block text-micro uppercase', active ? 'opacity-70' : 'text-labelColor')}>
        {stat.sub}
      </span>
    </button>
  );
}

export function OrdersCatalog() {
  // Support-ticket "Order Ref" links land here as /orders?ref=<id-or-uuid> and go
  // straight into the single search box (ordFilters v3), which resolves an id, a uuid
  // or an email without the operator choosing a field.
  const [searchParams] = useSearchParams();
  const initialRef = searchParams.get('ref') ?? '';

  const { dictionary } = useDictionary();
  const { canWrite } = usePermissions();

  const [orderFactor, setOrderFactor] = useState<'ORDER_FACTOR_ASC' | 'ORDER_FACTOR_DESC'>(
    'ORDER_FACTOR_DESC',
  );
  const [status, setStatus] = useState<common_OrderStatusEnum | ''>('');
  const [search, setSearch] = useState<string>(initialRef);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(initialRef);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteOrders(
    50,
    orderFactor,
    status || undefined,
    debouncedSearch || undefined,
  );
  const orders = useMemo(() => data?.pages.flatMap((page) => page.orders) ?? [], [data]);
  const counts = useMemo(() => deriveOrderCounts(orders, dictionary), [orders, dictionary]);
  const busy = isLoading || isFetchingNextPage;

  // Infinite scroll (ordPaging v2): a sentinel below the list pulls the next page into
  // view before the operator reaches the bottom. The manual button underneath stays as
  // the keyboard/no-observer fallback.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const toggleSort = () =>
    setOrderFactor((prev) =>
      prev === 'ORDER_FACTOR_ASC' ? 'ORDER_FACTOR_DESC' : 'ORDER_FACTOR_ASC',
    );

  // The status facets and the queue cells share one piece of state, so clicking either
  // keeps both in sync; clicking the active one clears it.
  const toggleStatus = (next: common_OrderStatusEnum) =>
    setStatus((prev) => (prev === next ? '' : next));

  const activeFilters = useMemo(() => {
    const out: string[] = [];
    const term = debouncedSearch.trim();
    if (term) out.push(`“${term}”`);
    if (status) out.push(statusOptions.find((o) => o.value === status)?.label ?? '');
    return out.filter(Boolean);
  }, [debouncedSearch, status]);

  const clearFilters = () => {
    setSearch('');
    setStatus('');
  };

  return (
    <div className='flex flex-col gap-4 pb-16'>
      {/* header — identity + the loaded-row count, then the escape hatches */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-baseline gap-2'>
          <Text variant='uppercase' size='large' component='h1' className='font-bold'>
            orders
          </Text>
          {orders.length > 0 && (
            <Pill tone='mut'>
              {orders.length}
              {hasNextPage ? '+' : ''} loaded
            </Pill>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button variant='secondary' size='sm' className='uppercase' onClick={() => setShowReport(true)}>
            stock report
          </Button>
          {canWrite(SECTION.orders) && (
            <Button variant='main' size='sm' className='uppercase' asChild>
              <Link to={ROUTES.customOrders}>create custom order</Link>
            </Button>
          )}
        </div>
      </div>

      {/* counts strip (ordHead v2) — queue KPIs that double as one-click filters */}
      <StatGrid min={140}>
        {QUEUE_FILTERS.map((q) => (
          <StatButton
            key={q.key}
            label={q.label}
            stat={counts[q.key]}
            active={status === q.status}
            onClick={() => toggleStatus(q.status)}
          />
        ))}
        <Stat label='today' value={counts.today.value} sub={counts.today.sub} />
      </StatGrid>

      {/* filter toolbar (ordFilters v3) — one smart box + a sort toggle */}
      <Toolbar>
        <Input
          name='search'
          type='text'
          placeholder='search order #, email or reference'
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className='w-72 max-w-full'
        />
        <ToolbarSpacer />
        <Button variant='secondary' size='sm' className='uppercase' onClick={toggleSort}>
          {orderFactor === 'ORDER_FACTOR_DESC' ? 'newest first ↓' : 'oldest first ↑'}
        </Button>
      </Toolbar>

      {/* status facets (ordFilters v3) — the full status set, chip toggles */}
      <ChipRow>
        {statusOptions.map((opt) => (
          <Chip
            key={opt.value}
            selected={status === opt.value}
            pressed={status === opt.value}
            onClick={() => toggleStatus(opt.value)}
          >
            {opt.label}
          </Chip>
        ))}
      </ChipRow>

      <OrdersList
        orders={orders}
        isLoading={isLoading}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
      />

      {/* infinite-scroll sentinel + manual fallback */}
      {hasNextPage && (
        <div ref={sentinelRef} className='flex justify-center'>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            loading={isFetchingNextPage}
          >
            load more
          </Button>
        </div>
      )}

      <ConfirmationModal
        open={showReport}
        onOpenChange={setShowReport}
        onConfirm={() => setShowReport(false)}
        title='stock changes'
        width='lg'
        hideActions
      >
        <StockChangesReport />
      </ConfirmationModal>
    </div>
  );
}
