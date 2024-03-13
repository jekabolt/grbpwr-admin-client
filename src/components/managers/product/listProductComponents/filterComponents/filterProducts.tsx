import {
  GetProductsPagedRequest,
  common_FilterConditions,
  common_OrderFactor,
  common_SortFactor,
} from 'api/proto-http/admin';
import React, { FC } from 'react';
import { FilterInput } from './filterInput';

interface FilterProps {
  filter: GetProductsPagedRequest;
  filterChange: (
    key: keyof GetProductsPagedRequest | keyof common_FilterConditions,
    value: any,
  ) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export const Filter: FC<FilterProps> = ({ filter, filterChange, onSubmit }) => {
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid' }}>
      <h6>FILTER</h6>
      <select
        value={filter.sortFactors}
        onChange={(e) => filterChange('sortFactors', [e.target.value as common_SortFactor])}
      >
        <option value='SORT_FACTOR_CREATED_AT'>created at</option>
        <option value='SORT_FACTOR_UPDATED_AT'> updated at</option>
        <option value='SORT_FACTOR_NAME'>name</option>
        <option value='SORT_FACTOR_PRICE'>price</option>
      </select>
      <select
        name='orderFactor'
        value={filter.orderFactor}
        onChange={(e) => filterChange('orderFactor', e.target.value as common_OrderFactor)}
      >
        <option value='ORDER_FACTOR_ASC'>asc</option>
        <option value='ORDER_FACTOR_DESC'>desc</option>
      </select>

      <FilterInput
        value={filter.filterConditions?.from}
        onChange={(e) => filterChange('from', e.target.value)}
        placeholder='from'
      />
      <FilterInput
        value={filter.filterConditions?.to}
        onChange={(e) => filterChange('to', e.target.value)}
        placeholder='to'
      />
      <FilterInput
        type='text'
        value={filter.filterConditions?.color}
        onChange={(e) => filterChange('color', e.target.value)}
        placeholder='color'
      />
      <FilterInput
        type='number'
        value={filter.filterConditions?.categoryId}
        onChange={(e) => filterChange('categoryId', parseInt(e.target.value))}
        placeholder='category'
      />
      <FilterInput
        type='text'
        value={filter.filterConditions?.byTag}
        onChange={(e) => filterChange('byTag', e.target.value)}
        placeholder='tag'
      />
      <FilterInput
        type='number'
        value={
          filter.filterConditions?.sizesIds !== undefined
            ? String(filter.filterConditions.sizesIds)
            : ''
        }
        onChange={(e) => filterChange('sizesIds', e.target.value.split(',').map(Number))}
        placeholder='size id'
      />

      <input
        type='checkbox'
        checked={filter.showHidden || false}
        onChange={(e) => filterChange('showHidden', e.target.checked)}
        placeholder='show hidden'
      />

      <button type='submit'>Apply</button>
    </form>
  );
};
