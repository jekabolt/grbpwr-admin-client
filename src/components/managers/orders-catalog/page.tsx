import { getOrdersList } from 'api/orders';
import { common_Order, ListOrdersRequest } from 'api/proto-http/admin';
import { PAGE_SIZE } from 'constants/filter';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import { Layout } from 'ui/layout';
import Filter from './components/filter';
import { OrderList } from './components/order-list';

export function OrdersCatalog() {
  const [orders, setOrders] = useState<common_Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [currentFilters, setCurrentFilters] = useState<Partial<ListOrdersRequest>>({});

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async (filters: Partial<ListOrdersRequest> = {}, append = false) => {
    if (!append) {
      setCurrentFilters(filters);
      setCurrentOffset(0);
    }
    setLoading(true);
    try {
      const requestParams: ListOrdersRequest = {
        status: filters.status || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        email: filters.email || undefined,
        orderId: filters.orderId || undefined,
        limit: filters.limit || PAGE_SIZE,
        offset: append ? currentOffset + PAGE_SIZE : 0,
        orderFactor: filters.orderFactor || 'ORDER_FACTOR_DESC',
      };

      const response = await getOrdersList(requestParams);
      if (append) {
        setOrders((prev) => [...prev, ...(response.orders || [])]);
      } else {
        setOrders(response.orders || []);
      }

      setHasMore((response.orders || []).length === (filters.limit || PAGE_SIZE));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    const newOffset = currentOffset + PAGE_SIZE;
    setCurrentOffset(newOffset);

    await fetchOrders(currentFilters, true);
  };

  return (
    <Layout>
      <div className='flex flex-col pb-10 gap-5'>
        <Filter onSearch={fetchOrders} loading={loading} />
        <OrderList rows={orders} />
        <Button className='lg:self-start' size='lg' onClick={loadMore} disabled={!hasMore}>
          load more
        </Button>
      </div>
    </Layout>
  );
}
