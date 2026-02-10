import { common_OrderStatusEnum } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { OrdersTable } from './components/orders-table';
import { useInfiniteOrders } from './components/useOrdersQuery';

export function OrdersCatalog() {
  const [orderFactor, setOrderFactor] = useState<'ORDER_FACTOR_ASC' | 'ORDER_FACTOR_DESC'>(
    'ORDER_FACTOR_DESC',
  );
  const [status, setStatus] = useState<common_OrderStatusEnum | ''>('');
  const [orderId, setOrderId] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [debouncedEmail, setDebouncedEmail] = useState<string>('');
  const [debouncedOrderId, setDebouncedOrderId] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEmail(email);
    }, 500);

    return () => clearTimeout(timer);
  }, [email]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedOrderId(orderId);
    }, 500);

    return () => clearTimeout(timer);
  }, [orderId]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteOrders(
      50,
      orderFactor,
      debouncedEmail || undefined,
      status || undefined,
      debouncedOrderId || undefined,
    );
  const orders = data?.pages.flatMap((page) => page.orders) || [];

  const toggleSort = () => {
    setOrderFactor((prev) =>
      prev === 'ORDER_FACTOR_ASC' ? 'ORDER_FACTOR_DESC' : 'ORDER_FACTOR_ASC',
    );
  };

  return (
    <div className='flex flex-col gap-4 pb-16'>
      <div className='flex justify-end'>
        <Input
          name='email'
          type='text'
          placeholder='enter email'
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          disabled={isLoading || isFetchingNextPage}
          className='w-64'
        />
      </div>
      <OrdersTable
        orders={orders}
        orderFactor={orderFactor}
        onToggleSort={toggleSort}
        status={status}
        onStatusChange={setStatus}
        orderId={orderId}
        onOrderIdChange={setOrderId}
        isLoading={isLoading || isFetchingNextPage}
      />
      {hasNextPage && (
        <div className='flex justify-center'>
          <Button
            variant='main'
            size='lg'
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
