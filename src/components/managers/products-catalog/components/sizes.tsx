import { useDictionaryStore } from 'lib/stores/store';
import Selector from 'ui/components/selector';
import useFilter from './useFilter';

export default function Sizes() {
  const { dictionary } = useDictionaryStore();
  const { defaultValue, handleFilterChange } = useFilter('sizes', true);

  const sizeOptions =
    dictionary?.sizes?.map((s) => ({
      value: s.id?.toString() ?? '',
      label: s.name ?? '',
    })) || [];

  return (
    <Selector
      label='sizes'
      options={sizeOptions}
      value={defaultValue || []}
      showAll
      multiple
      onChange={handleFilterChange}
    />
  );
}
