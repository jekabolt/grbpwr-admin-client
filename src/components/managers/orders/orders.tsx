import { useNavigate } from '@tanstack/react-location';
import { getDictionary } from 'api/admin';
import { orderByEmail, ordersByStatus } from 'api/orders';
import { common_OrderFull, common_OrderStatus, common_OrderStatusEnum } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import React, { FC, useCallback, useEffect, useState } from 'react';
import styles from 'styles/order.scss';

function formatDate(dateString: string | number | Date | undefined) {
  if (!dateString) {
    return '';
  }

  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', options as Intl.DateTimeFormatOptions);
}

export const Orders: FC = () => {
  const [status, setStatus] = useState<common_OrderStatus[] | undefined>([]);
  const [selectedStatus, setSelectedStatus] = useState<common_OrderStatusEnum | undefined>(
    'ORDER_STATUS_ENUM_PLACED',
  );
  const [orders, setOrders] = useState<common_OrderFull[] | undefined>([]);
  const [email, setEmail] = useState<string | undefined>('');
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const fetchDictionary = async () => {
      try {
        const response = await getDictionary({});
        setStatus(response.dictionary?.orderStatuses);
      } catch (error) {
        console.error(error);
      }
    };
    fetchDictionary();
  }, []);

  const navigateOrderId = (id: number | undefined) => {
    navigate({ to: `${ROUTES.ordersById}?orderId=${id}`, replace: true });
  };

  const defineStatus = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    const limit = 5;
    if (!email && selectedStatus) {
      try {
        const response = await ordersByStatus({
          limit: limit,
          offset: offset,
          orderFactor: 'ORDER_FACTOR_ASC',
          status: selectedStatus,
        });
        const list = response.orders || [];
        setOrders((prevOrders) => [...(prevOrders || []), ...list]);
        setOffset((prevOffset) => prevOffset + list.length);
        setHasMore(list.length === limit);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    } else {
      orderByEmailFunction();
    }
  }, [isLoading, hasMore, email, selectedStatus, offset]);

  useEffect(() => {
    defineStatus();
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop + 300 >=
          document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        defineStatus();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, defineStatus]);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const statusEnum = status?.find((s) => s.id?.toString() === e.target.value)?.name;
    setSelectedStatus(statusEnum);
    console.log(statusEnum);
    setOrders([]);
    setOffset(0);
    setHasMore(true);
    setIsLoading(false);
  };

  const orderByEmailFunction = async () => {
    try {
      setOrders([]);
      const response = await orderByEmail({ email });
      setOrders(response.orders);
    } catch (error) {
      console.error(error);
    }
  };
  return (
    <Layout>
      <div className={styles.order_main}>
        <div className={styles.order_by}>
          <div className={styles.filter_status}>
            <h3>filter by status</h3>
            <select onChange={handleStatusChange}>
              <option value=''>select</option>
              {status?.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name?.replace('ORDER_STATUS_ENUM_', '')}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filter_email}>
            <input type='text' value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type='button' onClick={orderByEmailFunction}>
              ok
            </button>
          </div>
        </div>

        <div className={styles.table_container}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Order Date</th>
                <th>Payment Received</th>
                <th>Payment Method</th>
                <th>Total Price</th>
              </tr>
            </thead>
            <tbody>
              {orders?.flatMap((order, orderIndex) =>
                order.orderItems?.map((item, itemIndex) => (
                  <tr
                    key={`${item.orderId}-${orderIndex}-${itemIndex}`}
                    onClick={() => navigateOrderId(item.orderId)}
                  >
                    <td>{order.order?.id}</td>
                    <td>{formatDate(order.order?.modified)}</td>
                    <td>{formatDate(order.payment?.modifiedAt)}</td>
                    <td>
                      {order.payment?.paymentInsert?.paymentMethod?.replace(
                        'PAYMENT_METHOD_NAME_ENUM_',
                        '',
                      )}
                    </td>
                    <td>{order.order?.totalPrice?.value}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          {isLoading && <div>Loading more items...</div>}
        </div>
      </div>
    </Layout>
  );
};
