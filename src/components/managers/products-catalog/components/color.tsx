import { colors } from 'constants/colors';
import Selector from 'ui/components/selector';
import useFilter from './useFilter';

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
