import { common_AddressInsert } from 'api/proto-http/frontend';
import Text from 'ui/components/text';

interface Props {
  shipping: common_AddressInsert | undefined;
}

export function Shipping({ shipping }: Props) {
  return (
    <div className='grid gap-2'>
      <Text variant='uppercase' size='small'>{`street adress: ${shipping?.addressLineOne}`}</Text>
      <Text variant='uppercase' size='small'>{`city: ${shipping?.city}`}</Text>
      <Text variant='uppercase' size='small'>{`state: ${shipping?.state}`}</Text>
      <Text variant='uppercase' size='small'>{`country: ${shipping?.country}`}</Text>
      <Text variant='uppercase' size='small'>{`postal code: ${shipping?.postalCode}`}</Text>
    </div>
  );
}
