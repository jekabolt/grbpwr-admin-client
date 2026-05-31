import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useInfiniteOrders } from './useOrdersQuery';
import { formatDateShort, getOrderStatusName, getStatusColor } from './utility';

type Order = NonNullable<
  ReturnType<typeof useInfiniteOrders>['data']
>['pages'][number]['orders'][number];

interface OrdersTableProps {
  orders: Order[];
  orderFactor: 'ORDER_FACTOR_ASC' | 'ORDER_FACTOR_DESC';
  isLoading: boolean;
  onToggleSort: () => void;
}

export function OrdersTable({ orders, orderFactor, isLoading, onToggleSort }: OrdersTableProps) {
  const { dictionary } = useDictionary();
  const navigate = useNavigate();

  const handleRowClick = (order: Order) => navigate(`${ROUTES.orders}/${order.uuid}`);

  return (
    <div className='overflow-x-auto w-full'>
      <table className='w-full border-collapse border-2 border-textColor min-w-max'>
        <thead className='bg-textInactiveColor h-10'>
          <tr className='border-b border-textColor'>
            <th className='sticky left-0 z-10 min-w-26 border border-textColor bg-textInactiveColor px-2 text-center'>
              <Text variant='uppercase'>order</Text>
            </th>
            <th className='min-w-26 border border-textColor px-2 text-center'>
              <Text variant='uppercase'>status</Text>
            </th>
            <th className='hidden min-w-26 border border-textColor px-2 text-center md:table-cell'>
              <Button
                onClick={onToggleSort}
                disabled={isLoading}
                className='mx-auto flex items-center gap-1 whitespace-nowrap transition-opacity hover:opacity-70'
              >
                <Text variant='uppercase'>placed</Text>
                <Text className='leading-none'>
                  {orderFactor === 'ORDER_FACTOR_DESC' ? '↓' : '↑'}
                </Text>
              </Button>
            </th>
            <th className='hidden min-w-26 border border-textColor px-2 text-center md:table-cell'>
              <Text variant='uppercase'>total</Text>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td colSpan={4} className='text-center py-8'>
                <Text variant='uppercase'>{isLoading ? 'loading…' : 'no orders found'}</Text>
              </td>
            </tr>
          ) : (
            orders.map((o) => {
              const statusName = getOrderStatusName(dictionary, o.orderStatusId);
              return (
                <tr
                  key={o.id}
                  className='group h-10 cursor-pointer border-b border-textColor last:border-b-0 transition-colors hover:bg-highlightColor/20'
                  onClick={() => handleRowClick(o)}
                >
                  <td className='sticky left-0 z-10 border border-textColor bg-bgColor px-2 text-center group-hover:bg-highlightColor/20'>
                    <Text>{o.uuid}</Text>
                  </td>
                  <td className='border border-textColor px-2 text-center'>
                    <span className={cn('inline-block px-1.5 py-0.5', getStatusColor(statusName))}>
                      <Text variant='uppercase'>{statusName}</Text>
                    </span>
                  </td>
                  <td className='hidden border border-textColor px-2 text-center md:table-cell'>
                    <Text>{formatDateShort(o.placed)}</Text>
                  </td>
                  <td className='hidden border border-textColor px-2 text-center md:table-cell'>
                    <Text>
                      {o.totalPrice?.value} {o.currency}
                    </Text>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
