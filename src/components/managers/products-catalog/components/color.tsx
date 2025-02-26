import { colors } from 'constants/filter';
import Selector from 'ui/components/selector';
import useFilter from '../../../../lib/useFilter';

export default function Color() {
  const { defaultValue, handleFilterChange } = useFilter('color');

  const colorOptions = colors.map((c) => ({
    value: c.name.toLowerCase(),
    label: c.name,
  }));

  return (
    <Selector
      label='color'
      options={colorOptions}
      value={defaultValue || ''}
      onChange={(value) => handleFilterChange(value)}
      showAll
    />
  );
}
