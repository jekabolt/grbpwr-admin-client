import { common_AddressInsert } from 'api/proto-http/frontend';
import Text from 'ui/components/text';

interface Props {
  shipping: common_AddressInsert | undefined;
}

export function Shipping({ shipping }: Props) {
  return (
    <div className='flex flex-col gap-1'>
      <Text variant='uppercase'>{`street adress: ${shipping?.addressLineOne}`}</Text>
      <Text variant='uppercase'>{`city: ${shipping?.city}`}</Text>
      {shipping?.state && <Text variant='uppercase'>{`state: ${shipping?.state}`}</Text>}
      <Text variant='uppercase'>{`country: ${shipping?.country}`}</Text>
      <Text variant='uppercase'>{`postal code: ${shipping?.postalCode}`}</Text>
    </div>
  );
}
