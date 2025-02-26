import { useDictionaryStore } from 'lib/stores/store';
import Selector from 'ui/components/selector';
import { SearchItemsProps } from '../interfaces';

export default function Payment({ value, onChange, disabled = false }: SearchItemsProps) {
  const { dictionary } = useDictionaryStore();

  const paymentOptions =
    dictionary?.paymentMethods?.map((payment) => ({
      value: payment.id || 0,
      label: payment.name || '',
    })) || [];

  return (
    <Selector
      label='Payment Method'
      options={paymentOptions}
      onChange={onChange}
      value={value || 0}
      disabled={disabled}
    />
  );
}
