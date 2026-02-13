import { common_OrderFull } from 'api/proto-http/admin';
import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { Button } from 'ui/components/button';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';

export function StatusHistory({ orderDetails }: { orderDetails?: common_OrderFull }) {
  const { dictionary } = useDictionary();
  return (
    <GenericPopover
      variant='default'
      contentProps={{
        align: 'start',
        sideOffset: 10,
      }}
      className='p-5 bg-bgColor text-textColor'
      openElement={() => (
        <Button className='border border-textInactiveColor rounded px-1 cursor-pointer'>i</Button>
      )}
    >
      <div className='flex flex-col gap-y-2'>
        {orderDetails?.statusHistory?.map((s) => (
          <div key={s.id} className='flex items-center gap-x-2'>
            <Text>{s.status?.replace('ORDER_STATUS_ENUM_', '')?.replace('_', ' ')}: </Text>
            <Text>{formatDateShort(s.changedAt, true)}</Text>
          </div>
        ))}
      </div>
    </GenericPopover>
  );
}
