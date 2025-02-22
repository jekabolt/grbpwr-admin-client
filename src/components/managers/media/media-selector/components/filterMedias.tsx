import { useMediaSelectorStore } from 'lib/stores/media/store';
import { FC } from 'react';
import Selector from 'ui/components/selector';

const TYPE_OPTIONS = [
  { value: 'all', label: 'ALL' },
  { value: 'image', label: 'IMAGE' },
  { value: 'video', label: 'VIDEO' },
];

const ORDER_OPTIONS = [
  { value: 'desc', label: 'DESCENDING' },
  { value: 'asc', label: 'ASCENDING' },
];

export const FilterMedias: FC = () => {
  const { filters, updateFilters } = useMediaSelectorStore();

  return (
    <div className='flex flex-col lg:flex-row gap-4'>
      <div className='lg:w-1/2 w-full'>
        <Selector
          label='TYPE'
          value={filters.type}
          options={TYPE_OPTIONS}
          onChange={(value: string) => updateFilters({ type: value })}
        />
      </div>

      <div className='lg:w-1/2 w-full'>
        <Selector
          label='ORDER'
          value={filters.order}
          options={ORDER_OPTIONS}
          onChange={(value: string) => updateFilters({ order: value })}
        />
      </div>
    </div>
  );
};
