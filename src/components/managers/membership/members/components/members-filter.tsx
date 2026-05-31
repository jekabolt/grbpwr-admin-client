import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { MembersFilters } from '../../utils/hooks';
import { MEMBER_STATUS_OPTIONS, TIER_KEY_BY_CODE, TIER_OPTIONS } from '../../utils/tier-utils';

interface MembersFilterProps {
  filters: MembersFilters;
  isLoading: boolean;
  onFiltersChange: (partial: MembersFilters) => void;
  onReset: () => void;
}

const tierOptions = [
  { value: 'all', label: 'All' },
  ...TIER_OPTIONS.map((t) => ({ value: TIER_KEY_BY_CODE[t.value], label: t.label })),
];

const statusOptions = [{ value: 'all', label: 'All' }, ...MEMBER_STATUS_OPTIONS];

export function MembersFilter({
  filters,
  isLoading,
  onFiltersChange,
  onReset,
}: MembersFilterProps) {
  const numberOrUndefined = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <div className='flex flex-wrap gap-3 items-end'>
      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>tier</Text>
        <Selector
          label='Tier'
          options={tierOptions}
          value={filters.tier ?? 'all'}
          onChange={(v: string) => onFiltersChange({ tier: v === 'all' ? undefined : v })}
          disabled={isLoading}
          compact
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>status</Text>
        <Selector
          label='Status'
          options={statusOptions}
          value={filters.status ?? 'all'}
          onChange={(v: string) => onFiltersChange({ status: v === 'all' ? undefined : v })}
          disabled={isLoading}
          compact
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>email</Text>
        <Input
          name='email'
          type='text'
          placeholder='filter by email'
          value={filters.email ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onFiltersChange({ email: e.target.value })
          }
          disabled={isLoading}
          className='w-48'
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>spend min (€)</Text>
        <Input
          name='spendMin'
          type='number'
          placeholder='0'
          value={filters.spendMinEur ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onFiltersChange({ spendMinEur: numberOrUndefined(e.target.value) })
          }
          disabled={isLoading}
          className='w-24'
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>spend max (€)</Text>
        <Input
          name='spendMax'
          type='number'
          placeholder='∞'
          value={filters.spendMaxEur ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onFiltersChange({ spendMaxEur: numberOrUndefined(e.target.value) })
          }
          disabled={isLoading}
          className='w-24'
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>days until review ≤</Text>
        <Input
          name='daysUntilReview'
          type='number'
          placeholder='any'
          value={filters.daysUntilReviewMax ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onFiltersChange({ daysUntilReviewMax: numberOrUndefined(e.target.value) })
          }
          disabled={isLoading}
          className='w-24'
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>registered from</Text>
        <Input
          name='registeredFrom'
          type='date'
          value={filters.registeredFrom ? filters.registeredFrom.slice(0, 10) : ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onFiltersChange({
              registeredFrom: e.target.value
                ? new Date(e.target.value).toISOString()
                : undefined,
            })
          }
          disabled={isLoading}
          className='w-36'
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>registered to</Text>
        <Input
          name='registeredTo'
          type='date'
          value={filters.registeredTo ? filters.registeredTo.slice(0, 10) : ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onFiltersChange({
              registeredTo: e.target.value ? new Date(e.target.value).toISOString() : undefined,
            })
          }
          disabled={isLoading}
          className='w-36'
        />
      </div>

      <button
        type='button'
        onClick={onReset}
        disabled={isLoading}
        className='underline underline-offset-2 hover:opacity-70 disabled:opacity-50 pb-1'
      >
        <Text variant='inactive'>reset</Text>
      </button>
    </div>
  );
}
