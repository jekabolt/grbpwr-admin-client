import { orderOptions, sortOptions } from 'constants/filter';
import Selector from 'ui/components/selector';
import useFilter from '../../../../lib/useFilter';

export default function Sort() {
  const { defaultValue: sort, handleFilterChange: handleSortChange } = useFilter('sort');
  const { defaultValue: order, handleFilterChange: handleOrderChange } = useFilter('order');

  return (
    <>
      <Selector
        label='Sort By'
        value={sort || sortOptions[0].value}
        options={sortOptions}
        onChange={(value) => handleSortChange(value)}
      />
      <Selector
        label='Order'
        value={order || orderOptions[0].value}
        options={orderOptions}
        onChange={(value) => handleOrderChange(value)}
      />
    </>
  );
}
