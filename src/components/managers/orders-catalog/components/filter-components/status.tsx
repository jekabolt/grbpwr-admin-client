import { statusOptions } from 'constants/filter';
import Selector from 'ui/components/selector';
import { SearchItemsProps } from '../interfaces';

export default function Status({ value, onChange, disabled = false }: SearchItemsProps) {
  return (
    <Selector
      label='Status'
      options={statusOptions}
      onChange={onChange}
      value={value || ''}
      disabled={disabled}
    />
  );
}
