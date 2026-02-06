import { colors } from 'constants/filter';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import useFilter from '../../../../lib/useFilter';

export default function Color() {
  const { defaultValue, handleFilterChange } = useFilter('color');

  const colorOptions = colors.map((c) => ({
    value: c.name.toLowerCase(),
    label: c.name,
  }));

  return (
    <div className='space-y-2'>
      <Text variant='uppercase'>color</Text>
      <Selector
        label='color'
        options={colorOptions}
        value={defaultValue || ''}
        onChange={(value) => handleFilterChange(value)}
        showAll
      />
    </div>
  );
}
