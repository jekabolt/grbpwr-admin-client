import Input from 'ui/components/input';
import { SearchItemsProps } from '../interfaces';

export default function Email({ value, onChange, disabled = false }: SearchItemsProps) {
  return (
    <Input
      name='email'
      type='text'
      placeholder='enter email'
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
      disabled={disabled}
      className='w-full h-10'
    />
  );
}
