import { LIMIT_OPTIONS, ORDER_FACTOR_OPTIONS, SOURCE_OPTIONS } from 'constants/constants';
import { useMemo } from 'react';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';

export interface StockHistorySizeOption {
  id?: number;
  name?: string;
}

export function getSizeItems(sizes: StockHistorySizeOption[]): { value: string; label: string }[] {
  return [
    { value: '__all__', label: 'All sizes' },
    ...sizes
      .filter((s) => s.id != null)
      .map((s) => ({ value: String(s.id), label: s.name ?? String(s.id) })),
  ];
}

interface StockHistoryFiltersProps {
  sizes?: StockHistorySizeOption[];
}

const inputClassName =
  'border border-textInactiveColor bg-bgColor px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-textColor';

export function StockHistoryFilters({ sizes = [] }: StockHistoryFiltersProps) {
  const sizeItems = useMemo(() => getSizeItems(sizes), [sizes]);

  return (
    <div className='shrink-0 grid grid-cols-2 gap-3 lg:grid-cols-3'>
      <InputField name='dateFrom' label='Date from' type='date' className={inputClassName} />
      <InputField name='dateTo' label='Date to' type='date' className={inputClassName} />
      <SelectField name='limit' label='Limit' placeholder='Limit' items={LIMIT_OPTIONS} />
      <SelectField name='source' label='Source' placeholder='Source' items={SOURCE_OPTIONS} />
      <SelectField
        name='orderFactor'
        label='Order'
        placeholder='Order'
        items={ORDER_FACTOR_OPTIONS}
      />
      <SelectField name='sizeId' label='Size' placeholder='Size' items={sizeItems} />
    </div>
  );
}
