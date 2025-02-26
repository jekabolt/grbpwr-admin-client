import Input from 'ui/components/input';
import { SearchItemsProps } from '../interfaces';

export default function OrderId({ value, onChange, disabled = false }: SearchItemsProps) {
  return (
    <Input
      name='orderId'
      type='number'
      placeholder='enter order id'
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
      disabled={disabled}
      className='w-full h-10'
    />
  );
}
