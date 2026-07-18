import { common_OrderFull } from 'api/proto-http/admin';
import { common_OrderItem } from 'api/proto-http/frontend';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

const HIDDEN_ON_MOBILE_STYLE = 'hidden lg:table-cell';

interface OrderTableProps {
  orderDetails: common_OrderFull | undefined;
  isPrinting?: boolean;
  showRefundSelection?: boolean;
  selectedUnitKeys?: string[];
  onToggleOrderItems?: (unitKeys: string[]) => void;
}

export function OrderTable({
  orderDetails,
  isPrinting = false,
  showRefundSelection = false,
  selectedUnitKeys = [],
  onToggleOrderItems,
}: OrderTableProps) {
  const { dictionary } = useDictionary();

  const expandedRows = useMemo(() => {
    const rows: { item: common_OrderItem; totalUnits: number; unitIndex: number }[] = [];
    orderDetails?.orderItems?.forEach((item) => {
      const qty = Math.max(1, item.orderItem?.quantity ?? 1);
      for (let i = 0; i < qty; i++) {
        rows.push({ item, totalUnits: qty, unitIndex: i });
      }
    });
    return rows;
  }, [orderDetails?.orderItems]);

  type Row = { item: common_OrderItem; totalUnits: number; unitIndex: number };

  const ALL_COLUMNS: {
    label: string;
    accessor: (row: Row) => React.ReactNode;
    showOnPrint?: boolean;
    className?: string;
  }[] = useMemo(
    () => [
      {
        label: 'THUMBNAIL',
        showOnPrint: true,
        className: 'print:!w-24 print:min-w-0 print:overflow-hidden print:max-w-24',
        // R2/p021: the order line no longer carries the colourway id, so the admin product link can't
        // be rebuilt (the frozen line references a variant SKU snapshot, not a live product).
        accessor: ({ item }) => (
          <div className='flex items-center justify-center w-24 max-w-full h-full mx-auto overflow-hidden print:block print:max-h-24'>
            <Media src={item.thumbnail || ''} alt='thumbnail' aspectRatio='1/1' fit='contain' />
          </div>
        ),
      },
      {
        label: 'SKU',
        showOnPrint: true,
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: ({ item }) => item.variantSkuSnapshot,
      },
      {
        label: 'PRODUCT NAME',
        showOnPrint: true,
        accessor: ({ item }) => item.translations?.[0].name,
      },
      {
        label: 'SIZE',
        showOnPrint: false,
        // R2/p021: the size is a frozen snapshot on the order line now (no live size_id lookup).
        accessor: ({ item }) => item.sizeNameSnapshot?.replace('SIZE_ENUM_', ''),
      },
      {
        label: 'PRICE',
        showOnPrint: false,
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: ({ item, totalUnits }) => {
          const aggregated = (item as any).aggregatedBasePrice;
          const productPrice = (item as any).productPrice;
          const total =
            aggregated != null
              ? (typeof aggregated === 'number' ? aggregated : Number(aggregated)) / totalUnits
              : productPrice != null
                ? typeof productPrice === 'number'
                  ? productPrice
                  : Number(productPrice)
                : 0;
          return `${total} ${orderDetails?.order?.currency || ''}`;
        },
      },
      {
        label: 'SALE',
        showOnPrint: false,
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: ({ item }) => {
          const sale = (item as any).productSalePercentage;
          return sale != null && sale !== '' && Number(sale) > 0 ? `${sale}%` : '—';
        },
      },
      {
        label: 'PRICE WITH SALE',
        showOnPrint: true,
        accessor: ({ item, totalUnits }) => {
          const aggregated = (item as any).aggregatedPriceWithSale;
          const perUnitPrice = (item as any).productPriceWithSale;
          const value =
            aggregated != null
              ? (typeof aggregated === 'number' ? aggregated : Number(aggregated)) / totalUnits
              : perUnitPrice != null
                ? typeof perUnitPrice === 'number'
                  ? perUnitPrice
                  : Number(perUnitPrice)
                : 0;
          return `${value} ${orderDetails?.order?.currency || ''}`;
        },
      },
      {
        label: 'REFUNDED',
        showOnPrint: true,
        accessor: ({ item }) =>
          orderDetails?.refundedOrderItems?.some((r) => r.id === item.id) ? (
            <span className='inline-block bg-textColor px-1 text-bgColor'>yes</span>
          ) : (
            '—'
          ),
      },
    ],
    [dictionary, orderDetails?.order?.currency, orderDetails?.refundedOrderItems],
  );

  const COLUMNS = useMemo(
    () => (isPrinting ? ALL_COLUMNS.filter((col) => col.showOnPrint) : ALL_COLUMNS),
    [ALL_COLUMNS, isPrinting],
  );

  // Partial refund is per unit, so offer selection whenever there's more than one unit
  // (e.g. a single line with quantity 2 — refund 1 of 2).
  const showPartialRefundCheckboxes = showRefundSelection && !isPrinting && expandedRows.length > 1;

  return (
    <div className='w-full'>
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textInactiveColor min-w-max print:border-separate print:border-spacing-0 print:[border:1px_solid_currentColor]'>
          <thead className='bg-textInactiveColor h-10'>
            <tr className='border-b border-textInactiveColor'>
              {showPartialRefundCheckboxes && (
                <th className='text-center w-10 border border-r border-textInactiveColor px-2'>
                  <Text variant='uppercase' className='leading-none'>
                    refund
                  </Text>
                </th>
              )}
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={cn(
                    'text-center w-auto lg:min-w-26 border border-r border-textInactiveColor px-2',
                    'print:[border:1px_solid_currentColor]',
                    col.className,
                  )}
                >
                  <Text variant='uppercase' className='leading-none'>
                    {col.label}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expandedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + (showPartialRefundCheckboxes ? 1 : 0)}
                  className='text-center py-8'
                >
                  <Text variant='uppercase'>no items found</Text>
                </td>
              </tr>
            ) : (
              expandedRows.map((row, idx) => {
                const { item, unitIndex } = row;
                const orderItemId = typeof item.id === 'number' ? item.id : null;
                const unitKey = orderItemId != null ? `${orderItemId}-${unitIndex}` : null;
                const isRefunded =
                  orderItemId != null &&
                  orderDetails?.refundedOrderItems?.some((r) => r.id === orderItemId);

                // Refund is per unit — each unit row can be selected independently.
                const isSelected = unitKey != null && selectedUnitKeys.includes(unitKey);

                const handleUnitToggle = () => {
                  if (!unitKey || !onToggleOrderItems || isRefunded) return;
                  onToggleOrderItems([unitKey]);
                };

                return (
                  <tr
                    key={unitKey ?? idx}
                    className={cn('border-b border-textInactiveColor last:border-b-0', {
                      'bg-highlightColor/10': isSelected,
                    })}
                  >
                    {showPartialRefundCheckboxes && (
                      <td className='border border-textInactiveColor text-center px-2 w-10'>
                        <input
                          type='checkbox'
                          checked={isSelected}
                          disabled={!!isRefunded}
                          onChange={handleUnitToggle}
                          className='cursor-pointer disabled:cursor-not-allowed'
                        />
                      </td>
                    )}
                    {COLUMNS.map((col) => {
                      const isDataCell = col.label !== 'THUMBNAIL' && col.label !== 'REFUNDED';
                      return (
                        <td
                          key={col.label}
                          className={cn(
                            'border border-textInactiveColor text-center px-2 w-16 lg:w-auto',
                            'print:[border:1px_solid_currentColor]',
                            col.className,
                            isRefunded &&
                              isDataCell &&
                              'relative after:content-[""] after:absolute after:left-0 after:right-0 after:top-1/2 after:h-px after:bg-current',
                            {
                              'bg-textInactiveColor/80': orderDetails?.refundedOrderItems?.some(
                                (refundedItem) => refundedItem.id === orderItemId,
                              ),
                            },
                          )}
                        >
                          {col.label === 'THUMBNAIL' ? (
                            col.accessor(row)
                          ) : (
                            <Text>{col.accessor(row)}</Text>
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
