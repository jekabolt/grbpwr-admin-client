import { common_OrderFactor, common_SortFactor } from 'api/proto-http/admin';
import Selector from 'ui/components/selector';
import useFilter from './useFilter';

const sortOptions: Array<{ value: common_SortFactor; label: string }> = [
  { value: 'SORT_FACTOR_CREATED_AT', label: 'Created At' },
  { value: 'SORT_FACTOR_PRICE', label: 'Price' },
  { value: 'SORT_FACTOR_UPDATED_AT', label: 'Updated At' },
  { value: 'SORT_FACTOR_NAME', label: 'Name' },
];

const orderOptions: Array<{ value: common_OrderFactor; label: string }> = [
  { value: 'ORDER_FACTOR_ASC', label: 'Ascending' },
  { value: 'ORDER_FACTOR_DESC', label: 'Descending' },
];

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
