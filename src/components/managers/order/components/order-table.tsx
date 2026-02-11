import { common_OrderFull } from 'api/proto-http/admin';
import { common_OrderItem } from 'api/proto-http/frontend';
import { BASE_PATH } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import MediaComponent from 'ui/components/media';
import Text from 'ui/components/text';

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
        accessor: (item) => item.sku,
      },
      {
        label: 'PRODUCT NAME',
        showOnPrint: true,
        accessor: (item) => item.translations?.[0].name,
      },
      {
        label: 'QUANTITY',
        showOnPrint: false,
        accessor: (item) => item.orderItem?.quantity,
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
        accessor: (item) =>
          `${(item as any).productPrice && item.orderItem?.quantity ? (item as any).productPrice * item.orderItem.quantity : 0} ${dictionary?.baseCurrency}`,
      },
      {
        label: 'SALE',
        showOnPrint: false,
        accessor: (item) => (item as any).productSalePercentage,
      },
      {
        label: 'PRICE WITH SALE',
        showOnPrint: true,
        accessor: (item) => (item as any).productPriceWithSale,
      },
    ],
    [dictionary],
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
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className='text-center h-10 min-w-26 border border-r border-textColor px-2'
                >
                  <Text variant='uppercase'>{col.label}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!orderDetails?.orderItems || orderDetails.orderItems.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className='text-center py-8'>
                  <Text variant='uppercase'>no items found</Text>
                </td>
              </tr>
            ) : (
              orderDetails.orderItems.map((item, idx) => (
                <tr key={idx} className='border-b border-text last:border-b-0 w-24 '>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.label}
                      className='border border-textColor text-center px-2 align-middle'
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
