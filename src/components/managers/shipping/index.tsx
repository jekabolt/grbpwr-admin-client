import { common_ShipmentCarrier } from 'api/proto-http/admin';
import { CURRENCIES } from 'constants/constants';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { UpsertShipping } from './components/upsert-shipping';

const currencyOptions = CURRENCIES.map((c) => ({ value: c.value, label: c.label }));

const formatRegion = (region: string) =>
  region.replace(/^SHIPPING_REGION_/i, '').replace(/_/g, ' ');

export function Shipping() {
  const { dictionary } = useDictionary();
  const [currency, setCurrency] = useState(currencyOptions[0]?.value ?? '');
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [editingCarrierId, setEditingCarrierId] = useState<number | undefined>();

  const COLUMNS: {
    label: string;
    accessor: (c: common_ShipmentCarrier) => React.ReactNode;
    width?: string;
    scroll?: boolean;
  }[] = useMemo(
    () => [
      { label: 'Carrier', accessor: (c) => c.shipmentCarrier?.carrier, width: 'w-28' },
      {
        label: 'Allowed Regions',
        accessor: (c) => c.allowedRegions?.map(formatRegion).join(', ') ?? '—',
        width: 'w-40 min-w-40 max-w-40',
        scroll: true,
      },
      {
        label: 'Prices',
        accessor: (c) => {
          const price = c.prices?.find((p) => p.currency === currency)?.price?.value;
          return price != null ? `${price} ${currency}` : '—';
        },
        width: 'lg:w-24 w-auto',
      },
      {
        label: 'Description',
        accessor: (c) => c.shipmentCarrier?.description ?? '—',
        width: 'w-48',
      },
      {
        label: 'Tracking URL',
        accessor: (c) => <CopyToClipboard text={c.shipmentCarrier?.trackingUrl ?? '—'} cutText />,
        width: 'w-52',
      },
      {
        label: 'Delivery Time',
        accessor: (c) => c.shipmentCarrier?.expectedDeliveryTime,
        width: 'w-28',
      },
    ],
    [currency],
  );

  const handleCreateCarrier = () => {
    setEditingCarrierId(undefined);
    setUpsertOpen(true);
  };

  const handleRowClick = (id?: number | null) => {
    if (!id) return;
    setEditingCarrierId(id);
    setUpsertOpen(true);
  };

  return (
    <div className='w-full flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='large' className='font-bold'>
          shipment carriers
        </Text>
        <Button type='button' size='lg' variant='main' onClick={handleCreateCarrier}>
          add
        </Button>
      </div>
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-10'>
            <tr className='border-b border-textColor'>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={cn(
                    'text-center h-10 border border-r border-textColor px-2',
                    col.width ?? 'min-w-26',
                  )}
                >
                  {col.label === 'Prices' ? (
                    <div className='flex items-center justify-center gap-3'>
                      <Text variant='uppercase'>{col.label}</Text>
                      <Selector
                        label=''
                        options={currencyOptions}
                        value={currency}
                        onChange={setCurrency}
                        compact
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
            {dictionary?.shipmentCarriers?.map((carrier) => (
              <tr
                key={carrier.id}
                className='border-b border-text last:border-b-0 h-10 cursor-pointer hover:bg-textInactiveColor/20'
                onClick={() => handleRowClick(carrier.id)}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.label}
                    className={cn(
                      'border border-textColor px-2 align-middle',
                      col.width ?? 'min-w-26',
                      col.scroll && 'overflow-hidden p-0',
                    )}
                  >
                    {col.scroll ? (
                      <div className='overflow-x-auto max-w-64 w-full h-full py-1 scrollbar-thin'>
                        <Text className='text-center whitespace-nowrap'>
                          {col.accessor(carrier)}
                        </Text>
                      </div>
                    ) : (
                      <Text
                        className={cn('text-center', {
                          'line-clamp-2': col.label === 'Description',
                          'flex justify-center items-center': col.label === 'Tracking URL',
                        })}
                      >
                        {col.accessor(carrier)}
                      </Text>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <UpsertShipping id={editingCarrierId} open={upsertOpen} onOpenChange={setUpsertOpen} />
    </div>
  );
}
