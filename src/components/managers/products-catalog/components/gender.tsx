import { genderOptions } from 'constants/filter';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import useFilter from '../../../../lib/useFilter';

export default function Gender() {
  const { defaultValue, handleFilterChange } = useFilter('gender');

  return (
    <div className='space-y-2'>
      <Text variant='uppercase' size='small'>
        gender
      </Text>
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
