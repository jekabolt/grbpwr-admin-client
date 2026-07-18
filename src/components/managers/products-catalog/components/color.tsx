import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import useFilter from '../../../../lib/useFilter';

// R1/R9: the catalog colour filter is sourced from the controlled colour dictionary (the same
// color_code system the product form uses), not a hardcoded CSS-colour name list. The selected value
// is the dictionary `code`, which is exactly what GetColorwaysPaged filters on (colorCodes).
export default function Color() {
  const { defaultValue, handleFilterChange } = useFilter('color');
  const { dictionary } = useDictionary();

  const colorOptions = useMemo(
    () =>
      (dictionary?.colors ?? [])
        .filter((c) => !c.archived && c.code)
        .map((c) => ({
          value: c.code as string,
          label: `${c.code}${c.name ? ` · ${c.name}` : ''}`,
        })),
    [dictionary?.colors],
  );

  return (
    <div className='space-y-2'>
      <Text variant='uppercase'>color</Text>
      {colorOptions.length === 0 ? (
        <Text variant='inactive' size='small'>
          no colours in the dictionary yet
        </Text>
      ) : (
        <Selector
          label='color'
          options={colorOptions}
          value={defaultValue || ''}
          onChange={(value) => handleFilterChange(value)}
          showAll
        />
      )}
    </div>
  );
}
