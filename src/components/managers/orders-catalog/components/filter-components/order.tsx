import { orderOptions } from 'constants/filter';
import Selector from 'ui/components/selector';
import { SearchItemsProps } from '../interfaces';

export default function Order({ value = '', onChange, disabled = false }: SearchItemsProps) {
  const handleChange = (selectedValue: string) => {
    if (onChange) {
      onChange(selectedValue);
    }
  };

  return (
    <Selector
      label='Order'
      options={orderOptions}
      onChange={handleChange}
      value={value}
      disabled={disabled}
    />
  );
}
