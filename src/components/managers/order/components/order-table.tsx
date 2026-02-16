import { common_OrderFull } from 'api/proto-http/admin';
import { common_OrderItem } from 'api/proto-http/frontend';
import { BASE_PATH } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

const HIDDEN_ON_MOBILE_STYLE = 'hidden lg:table-cell';

interface OrderTableProps {
  orderDetails: common_OrderFull | undefined;
  isPrinting?: boolean;
  showRefundSelection?: boolean;
  selectedProductIds?: number[];
  onToggleOrderItems?: (productIds: number[]) => void;
}

export function OrderTable({
  orderDetails,
  isPrinting = false,
  showRefundSelection = false,
  selectedProductIds = [],
  onToggleOrderItems,
}: OrderTableProps) {
  const { dictionary } = useDictionary();

  const ALL_COLUMNS: {
    label: string;
    accessor: (item: common_OrderItem) => React.ReactNode;
    showOnPrint?: boolean;
    className?: string;
  }[] = useMemo(
    () => [
      {
        label: 'THUMBNAIL',
        showOnPrint: true,
        accessor: (item) => (
          <Link
            to={`${BASE_PATH}/products/${item.orderItem?.productId}`}
            target='_blank'
            className='cursor-pointer flex items-center justify-center w-24 h-full mx-auto'
          >
            <Media src={item.thumbnail || ''} alt='thumbnail' aspectRatio='1/1' fit='contain' />
          </Link>
        ),
      },
      {
        label: 'SKU',
        showOnPrint: true,
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: (item) => item.sku,
      },
      {
        label: 'PRODUCT NAME',
        showOnPrint: true,
        accessor: (item) => item.translations?.[0].name,
      },
      {
        label: 'SIZE',
        showOnPrint: false,
        accessor: (item) =>
          dictionary?.sizes
            ?.find((x) => x.id === item.orderItem?.sizeId)
            ?.name?.replace('SIZE_ENUM_', ''),
      },
      {
        label: 'PRICE',
        showOnPrint: false,
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: (item) =>
          `${
            (item as any).aggregatedBasePrice ??
            ((item as any).productPrice && item.orderItem?.quantity
              ? (item as any).productPrice * item.orderItem.quantity
              : 0)
          } ${orderDetails?.order?.currency || ''}`,
      },
      {
        label: 'SALE',
        showOnPrint: false,
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: (item) => (item as any).productSalePercentage,
      },
      {
        label: 'PRICE WITH SALE',
        showOnPrint: true,
        accessor: (item) =>
          `${
            (item as any).aggregatedPriceWithSale ?? (item as any).productPriceWithSale
          } ${orderDetails?.order?.currency || ''}`,
      },
      {
        label: 'REFUNDED',
        showOnPrint: true,
        accessor: (item) =>
          orderDetails?.refundedOrderItems?.some((r) => r.id === item.id) ? 'Yes' : 'No',
      },
    ],
    [dictionary, orderDetails?.order?.currency, orderDetails?.refundedOrderItems],
  );

  const COLUMNS = useMemo(
    () => (isPrinting ? ALL_COLUMNS.filter((col) => col.showOnPrint) : ALL_COLUMNS),
    [ALL_COLUMNS, isPrinting],
  );

  return (
    <div className='w-full'>
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-10'>
            <tr className='border-b border-textColor'>
              {showRefundSelection && !isPrinting && (
                <th className='text-center w-10 border border-r border-textColor px-2'>
                  <Text variant='uppercase' className='leading-none'>
                    refund
                  </Text>
                </th>
              )}
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={`text-center w-auto lg:min-w-26 border border-r border-textColor px-2 ${col.className || ''}`}
                >
                  <Text variant='uppercase' className='leading-none'>
                    {col.label}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderDetails?.orderItems?.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className='text-center py-8'>
                  <Text variant='uppercase'>no items found</Text>
                </td>
              </tr>
            ) : (
              orderDetails?.orderItems?.map((item, idx) => {
                const orderItemId = typeof item.id === 'number' ? item.id : null;
                const rowOrderItemIds: number[] = orderItemId != null ? [orderItemId] : [];
                const isRefunded =
                  orderItemId != null &&
                  orderDetails?.refundedOrderItems?.some((r) => r.id === orderItemId);

                const allSelectedForRow =
                  rowOrderItemIds.length > 0 &&
                  rowOrderItemIds.every((id) => selectedProductIds.includes(id));

                const handleRowToggle = () => {
                  if (!rowOrderItemIds.length || !onToggleOrderItems) return;
                  onToggleOrderItems(rowOrderItemIds);
                };

                return (
                  <tr
                    key={orderItemId ?? idx}
                    className='border-b border-text last:border-b-0 lg:w-24'
                  >
                    {showRefundSelection && !isPrinting && (
                      <td className='border border-textColor text-center px-2 w-10'>
                        <input
                          type='checkbox'
                          checked={allSelectedForRow}
                          onChange={handleRowToggle}
                          className='cursor-pointer'
                        />
                      </td>
                    )}
                    {COLUMNS.map((col) => {
                      const isDataCell = col.label !== 'THUMBNAIL' && col.label !== 'REFUNDED';
                      return (
                        <td
                          key={col.label}
                          className={cn(
                            'border border-textColor text-center px-2 w-16 lg:w-auto',
                            col.className,
                            isRefunded &&
                              isDataCell &&
                              'relative after:content-[""] after:absolute after:left-0 after:right-0 after:top-1/2 after:h-px after:bg-current',
                            {
                              'bg-textInactiveColor/80': orderDetails.refundedOrderItems?.some(
                                (refundedItem) => refundedItem.id === orderItemId,
                              ),
                            },
                          )}
                        >
                          {col.label === 'THUMBNAIL' ? (
                            col.accessor(item)
                          ) : (
                            <Text>{col.accessor(item)}</Text>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
