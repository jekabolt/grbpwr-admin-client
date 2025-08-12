import Selector from 'ui/components/selector';
import { FILTER_TYPES, FilterType, SORT_ORDERS, SortOrder } from '../utils/useFilter';

interface FilterProps {
  type: FilterType;
  order: SortOrder;
  setType: (type: FilterType) => void;
  setOrder: (order: SortOrder) => void;
}

export function Filter({ type, order, setType, setOrder }: FilterProps) {
  return (
    <div>
      <Selector
        label='Media Type'
        value={type}
        options={FILTER_TYPES.map((type) => ({ label: type, value: type }))}
        onChange={(value) => setType(value)}
      />
      <Selector
        label='Order'
        value={order}
        options={SORT_ORDERS.map((order) => ({ label: order, value: order }))}
        onChange={(value) => setOrder(value)}
      />
    </div>
  );
}
