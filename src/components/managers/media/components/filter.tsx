import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import { FILTER_TYPES, FilterType, SORT_ORDERS, SortOrder } from '../utils/useFilter';

interface FilterProps {
  type: FilterType;
  order: SortOrder;
  search: string;
  setType: (type: FilterType) => void;
  setOrder: (order: SortOrder) => void;
  setSearch: (search: string) => void;
}

export function Filter({ type, order, search, setType, setOrder, setSearch }: FilterProps) {
  return (
    <div className='flex flex-row flex-wrap gap-2'>
      <div className='w-40'>
        {/* No filename metadata exists on media (uploads never carry one, see useUploadMedia) —
            this matches against each item's own id/url, the only text it has. */}
        <Input
          name='mediaSearch'
          type='text'
          value={search}
          placeholder='search by id or url'
          aria-label='search media'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
      </div>
      <div className='w-32'>
        <Selector
          label='Media Type'
          value={type}
          options={FILTER_TYPES.map((type) => ({ label: type, value: type }))}
          onChange={(value) => setType(value)}
        />
      </div>
      <div className='w-28'>
        <Selector
          label='Order'
          value={order}
          options={SORT_ORDERS.map((order) => ({ label: order, value: order }))}
          onChange={(value) => setOrder(value)}
        />
      </div>
    </div>
  );
}
