import { genderOptions } from 'constants/filter';
import Selector from 'ui/components/selector';
import useFilter from '../../../../lib/useFilter';

export default function Gender() {
  const { defaultValue, handleFilterChange } = useFilter('gender');

  return (
    <Selector
      label='gender'
      value={defaultValue || []}
      options={genderOptions}
      onChange={handleFilterChange}
      showAll
    />
  );
}
