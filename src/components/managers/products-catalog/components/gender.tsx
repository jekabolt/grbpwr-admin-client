import { genderOptions } from 'constants/filter';
import { Selector, Text } from 'ui';
import useFilter from '../../../../lib/useFilter';

export default function Gender() {
  const { defaultValue, handleFilterChange } = useFilter('gender');

  return (
    <div className='space-y-2'>
      <Text variant='uppercase'>gender</Text>
      <Selector
        label='gender'
        value={defaultValue || 'all'}
        options={genderOptions}
        onChange={handleFilterChange}
        showAll
      />
    </div>
  );
}
