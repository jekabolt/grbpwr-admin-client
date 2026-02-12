import { common_AddressInsert } from 'api/proto-http/frontend';
import Text from 'ui/components/text';

interface Props {
  shipping: common_AddressInsert | undefined;
}

export function Shipping({ shipping }: Props) {
  return (
    <div className='flex flex-col gap-1'>
      <Text variant='uppercase'>
        {`street adress: `}
        <span className='select-all'>{shipping?.addressLineOne}</span>
      </Text>
      <Text variant='uppercase'>
        {`city: `}
        <span className='select-all'>{shipping?.city}</span>
      </Text>
      {shipping?.state && (
        <Text variant='uppercase'>
          {`state: `}
          <span className='select-all'>{shipping?.state}</span>
        </Text>
      )}
      <Text variant='uppercase'>
        {`country: `}
        <span className='select-all'>{shipping?.country}</span>
      </Text>
      <Text variant='uppercase'>
        {`postal code: `}
        <span className='select-all'>{shipping?.postalCode}</span>
      </Text>
    </div>
  );
}
