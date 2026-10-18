import { DEFAULT_PRODUCT_LIMIT, PRODUCT_LIMIT_OPTIONS } from 'constants/filter';
import useFilter from 'lib/useFilter';
import { Select, Text } from 'ui';

const LIMIT_ITEMS = PRODUCT_LIMIT_OPTIONS.map((o) => ({
  value: String(o.value),
  label: o.label,
}));

export default function ShowLatestLimit() {
  const { defaultValue: limit, handleFilterChange: handleLimitChange } = useFilter('limit');
  const value = limit || String(DEFAULT_PRODUCT_LIMIT);

  return (
    <div className='flex items-center gap-2'>
      <Text variant='uppercase' className='w-auto whitespace-nowrap'>
        show latest
      </Text>
      <Select
        name='limit'
        placeholder='quantity'
        items={LIMIT_ITEMS}
        value={value}
        onValueChange={(value: string) => handleLimitChange(value)}
      />
    </div>
  );
}
