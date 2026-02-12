import { common_OrderFull } from 'api/proto-http/admin';
import { common_OrderItem } from 'api/proto-http/frontend';
import { BASE_PATH } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import MediaComponent from 'ui/components/media';
import Text from 'ui/components/text';

const HIDDEN_ON_MOBILE_STYLE = 'hidden lg:table-cell';

interface OrderTableProps {
  orderDetails: common_OrderFull | undefined;
  isPrinting?: boolean;
}

export function OrderTable({ orderDetails, isPrinting = false }: OrderTableProps) {
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
          <a
            href={`${BASE_PATH}/products/${item.orderItem?.productId}`}
            target='_blank'
            rel='noopener noreferrer'
            className='cursor-pointer flex items-center justify-center w-24 h-full mx-auto'
          >
            <MediaComponent
              src={item.thumbnail || ''}
              alt='thumbnail'
              aspectRatio='1/1'
              fit='contain'
            />
          </a>
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
        label: 'QTY',
        showOnPrint: false,
        accessor: (item) =>
          (item as any).aggregatedQuantity ?? item.orderItem?.quantity,
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
            (item as any).aggregatedPriceWithSale ??
            (item as any).productPriceWithSale
          } ${orderDetails?.order?.currency || ''}`,
      },
    ],
    [dictionary, orderDetails?.order?.currency],
  );

  const COLUMNS = useMemo(
    () => (isPrinting ? ALL_COLUMNS.filter((col) => col.showOnPrint) : ALL_COLUMNS),
    [ALL_COLUMNS, isPrinting],
  );

  const uniqueOrderItems = useMemo(() => {
    if (!orderDetails?.orderItems) return [];

    const aggregated = new Map<string | number, common_OrderItem & any>();

    orderDetails.orderItems.forEach((item) => {
      const key =
        item.orderItem?.productId ??
        item.sku ??
        `${item.thumbnail}-${item.translations?.[0]?.name ?? ''}`;

      const existing = aggregated.get(key);

      const quantity = Number(item.orderItem?.quantity ?? 0);
      const unitPrice = Number((item as any).productPrice ?? 0);
      const basePrice = unitPrice * quantity;
      const priceWithSale = Number((item as any).productPriceWithSale ?? 0);

      if (!existing) {
        const clone: any = { ...item };
        clone.aggregatedQuantity = quantity;
        clone.aggregatedBasePrice = basePrice;
        clone.aggregatedPriceWithSale = priceWithSale;
        aggregated.set(key, clone);
      } else {
        const agg: any = existing;
        agg.aggregatedQuantity = Number(agg.aggregatedQuantity ?? 0) + quantity;
        agg.aggregatedBasePrice =
          Number(agg.aggregatedBasePrice ?? 0) + basePrice;
        agg.aggregatedPriceWithSale =
          Number(agg.aggregatedPriceWithSale ?? 0) + priceWithSale;
      }
    });

    return Array.from(aggregated.values());
  }, [orderDetails?.orderItems]);

  return (
    <div className='w-full'>
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-10'>
            <tr className='border-b border-textColor'>
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
            {uniqueOrderItems.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className='text-center py-8'>
                  <Text variant='uppercase'>no items found</Text>
                </td>
              </tr>
            ) : (
              uniqueOrderItems.map((item, idx) => (
                <tr key={idx} className='border-b border-text last:border-b-0 lg:w-24 '>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.label}
                      className={`border border-textColor text-center px-2 w-16  lg:w-auto ${col.className || ''}`}
                    >
                      {col.label === 'THUMBNAIL' ? (
                        col.accessor(item)
                      ) : (
                        <Text>{col.accessor(item)}</Text>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
