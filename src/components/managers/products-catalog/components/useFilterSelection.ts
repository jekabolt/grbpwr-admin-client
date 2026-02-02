import { useEffect, useState } from 'react';

import { useDictionaryStore } from 'lib/stores/store';

import useFilter from 'lib/useFilter';

interface UseFilterSelectionProps {
  filterKey: 'size' | 'collection';
  multiSelect?: boolean;
}

export function useFilterSelection({ filterKey, multiSelect = false }: UseFilterSelectionProps) {
  const { dictionary } = useDictionaryStore();
  const { defaultValue, handleFilterChange } = useFilter(filterKey);

  const items = dictionary?.[filterKey === 'size' ? 'sizes' : 'collections'] || [];

  const values = Array.isArray(defaultValue)
    ? defaultValue
    : (defaultValue ? defaultValue.split(',') : []);

  const findInitialItems = () => {
    if (values.length === 0) return [];
    if (filterKey === 'size') {
      return values
        .map((id) => items.find((item: any) => String(item.id) === id))
        .filter(Boolean);
    }
    return values
      .map((val) => items.find((item: any) => item.name?.toLowerCase() === val.toLowerCase()))
      .filter(Boolean);
  };

  const initItems = findInitialItems();
  const initValues =
    filterKey === 'size'
      ? values.filter((id) => items.some((item: any) => String(item.id) === id))
      : initItems.map((item: any) => item?.name);

  const [selectedValues, setSelectedValues] = useState<string[]>(initValues);

  // Sync with URL changes
  useEffect(() => {
    if (!defaultValue) {
      setSelectedValues([]);
    }
  }, [defaultValue]);

  const handleToggle = async (value: string) => {
    let newSelected: string[];

    if (multiSelect) {
      newSelected = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
    } else {
      newSelected = selectedValues.includes(value) ? [] : [value];
    }

    setSelectedValues(newSelected);

    // API expects comma-separated size IDs; URL stores IDs so fetch receives sizesIds
    const filterValue =
      newSelected.length > 0 ? newSelected.join(',') : undefined;

    handleFilterChange(filterValue);
  };

  return {
    selectedValues,
    handleToggle,
  };
}
