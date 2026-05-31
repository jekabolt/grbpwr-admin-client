import { common_OrderStatusEnum } from 'api/proto-http/admin';
import { statusOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { OrdersTable } from './components/orders-table';
import { StockChangesReport } from './components/StockChangesReport';
import { useInfiniteOrders } from './components/useOrdersQuery';

export function OrdersCatalog() {
  const [orderFactor, setOrderFactor] = useState<'ORDER_FACTOR_ASC' | 'ORDER_FACTOR_DESC'>(
    'ORDER_FACTOR_DESC',
  );
  const [status, setStatus] = useState<common_OrderStatusEnum | ''>('');
  const [orderSearch, setOrderSearch] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [debouncedEmail, setDebouncedEmail] = useState<string>('');
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState<string>('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEmail(email), 500);
    return () => clearTimeout(timer);
  }, [email]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedOrderSearch(orderSearch), 500);
    return () => clearTimeout(timer);
  }, [orderSearch]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteOrders(
    50,
    orderFactor,
    debouncedEmail || undefined,
    status || undefined,
    debouncedOrderSearch || undefined,
  );
  const orders = data?.pages.flatMap((page) => page.orders) || [];
  const busy = isLoading || isFetchingNextPage;

  const toggleSort = () =>
    setOrderFactor((prev) => (prev === 'ORDER_FACTOR_ASC' ? 'ORDER_FACTOR_DESC' : 'ORDER_FACTOR_ASC'));

  const hasFilters = !!email || !!orderSearch || !!status;
  const resetFilters = () => {
    setEmail('');
    setOrderSearch('');
    setStatus('');
  };

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textColor bg-bgColor px-2.5 py-3'>
        <div className='flex items-baseline gap-2'>
          <Text variant='uppercase' size='large'>
            orders
          </Text>
          {orders.length > 0 && (
            <Text variant='inactive'>
              {orders.length}
              {hasNextPage ? '+' : ''}
            </Text>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='secondary'
            size='lg'
            className='uppercase'
            onClick={() => setShowReport((s) => !s)}
          >
            stock report
          </Button>
          <Button variant='main' size='lg' className='uppercase' asChild>
            <Link to={ROUTES.customOrders}>create custom order</Link>
          </Button>
        </div>
      </div>

      {showReport && <StockChangesReport />}

      {/* Filters */}
      <div className='flex flex-wrap items-end gap-3'>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            email
          </Text>
          <Input
            name='email'
            type='text'
            placeholder='filter by email'
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            disabled={busy}
            className='w-56'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            order reference
          </Text>
          <Input
            name='orderSearch'
            type='text'
            placeholder='filter by reference'
            value={orderSearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrderSearch(e.target.value)}
            disabled={busy}
            className='w-48'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            status
          </Text>
          <Selector
            label='Status'
            options={[{ value: 'all', label: 'all' }, ...statusOptions]}
            value={status || 'all'}
            onChange={(v: string) =>
              setStatus(v === 'all' ? '' : (v as common_OrderStatusEnum))
            }
            disabled={busy}
            compact
          />
        </div>
        {hasFilters && (
          <button
            type='button'
            onClick={resetFilters}
            disabled={busy}
            className='pb-1 underline underline-offset-2 hover:opacity-70 disabled:opacity-50'
          >
            <Text variant='inactive'>reset</Text>
          </button>
        )}
      </div>

      <OrdersTable
        orders={orders}
        orderFactor={orderFactor}
        onToggleSort={toggleSort}
        isLoading={busy}
      />

      {hasNextPage && (
        <div className='flex justify-center'>
          <Button
            variant='secondary'
            size='lg'
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            loading={isFetchingNextPage}
          >
            load more
          </Button>
        </div>
      )}
    </div>
  );
}
