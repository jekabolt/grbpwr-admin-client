import { common_OrderStatusEnum } from 'api/proto-http/admin';
import { statusOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useDictionaryStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { useInfiniteOrders } from './useOrdersQuery';
import { formatDateTime, getOrderStatusName, getStatusColor } from './utility';

type Order = NonNullable<
  ReturnType<typeof useInfiniteOrders>['data']
>['pages'][number]['orders'][number];

interface OrdersTableProps {
  orders: Order[];
  orderFactor: 'ORDER_FACTOR_ASC' | 'ORDER_FACTOR_DESC';
  status: common_OrderStatusEnum | '';
  orderId: string;
  isLoading: boolean;
  onToggleSort: () => void;
  onStatusChange: (value: common_OrderStatusEnum | '') => void;
  onOrderIdChange: (value: string) => void;
}

export function OrdersTable({
  orders,
  orderFactor,
  status,
  orderId,
  isLoading,
  onToggleSort,
  onStatusChange,
  onOrderIdChange,
}: OrdersTableProps) {
  const { dictionary } = useDictionaryStore();
  const navigate = useNavigate();

  const handleRowClick = (order: Order) => {
    navigate(`${ROUTES.orders}/${order.uuid}`);
  };

  const COLUMNS: { label: string; accessor: (o: Order) => React.ReactNode }[] = useMemo(
    () => [
      { label: 'Order ID', accessor: (o: Order) => o.id },
      {
        label: 'Order Status',
        accessor: (o) => getOrderStatusName(dictionary, o.orderStatusId),
      },
      { label: 'Placed', accessor: (o) => formatDateTime(o.placed) },
      { label: 'Modified', accessor: (o) => formatDateTime(o.modified) },
      {
        label: 'Total',
        accessor: (o) => `${o.totalPrice?.value} ${dictionary?.baseCurrency}`,
      },
    ],
    [dictionary],
  );

  return (
    <div className='w-full flex flex-col gap-4'>
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-10 overflow-x-scroll'>
            <tr className='border-b border-textColor'>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className='text-center h-10 min-w-26 border border-r border-textColor px-2'
                >
                  {col.label === 'Order ID' ? (
                    <div className='flex justify-center gap-3'>
                      <Button
                        onClick={onToggleSort}
                        disabled={isLoading}
                        className='flex items-center justify-center gap-1 whitespace-nowrap hover:opacity-70 transition-opacity'
                      >
                        <div className='flex items-center gap-1 leading-none'>
                          {['↑', '↓'].map((arrow, idx) => (
                            <Text
                              key={arrow}
                              className={cn('text-textColor', {
                                'opacity-50':
                                  (idx === 0 && orderFactor === 'ORDER_FACTOR_DESC') ||
                                  (idx === 1 && orderFactor === 'ORDER_FACTOR_ASC'),
                              })}
                            >
                              {arrow}
                            </Text>
                          ))}
                        </div>
                        <Text variant='uppercase'>{col.label}</Text>
                      </Button>
                      <Input
                        name='orderId'
                        type='number'
                        placeholder='order id'
                        value={orderId}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          onOrderIdChange(e.target.value)
                        }
                        disabled={isLoading}
                        className='w-16 bg-textInactiveColor [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-textColor'
                      />
                    </div>
                  ) : col.label === 'Order Status' ? (
                    <div className='flex items-center justify-center gap-3'>
                      <Text className='' variant='uppercase'>
                        {col.label}
                      </Text>
                      <Selector
                        label=''
                        options={[{ value: 'all', label: 'all' }, ...statusOptions]}
                        onChange={(value) =>
                          onStatusChange(value === 'all' ? '' : (value as common_OrderStatusEnum))
                        }
                        value={status || 'all'}
                        compact
                        disabled={isLoading}
                      />
                    </div>
                  ) : (
                    <Text variant='uppercase'>{col.label}</Text>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className='text-center py-8'>
                  <Text variant='uppercase'>no orders found</Text>
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr
                  key={o.id}
                  className='border-b border-text last:border-b-0 h-10 hover:bg-highlightColor cursor-pointer transition-colors'
                  onClick={() => handleRowClick(o)}
                >
                  {COLUMNS.map((col) => {
                    const cellValue = col.accessor(o as Order);
                    const bgColor =
                      col.label === 'Order Status' ? getStatusColor(String(cellValue)) : '';

                    return (
                      <td
                        key={col.label}
                        className={cn('border border-r border-textColor text-center px-2', bgColor)}
                      >
                        <Text>{cellValue}</Text>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
