import { AcctAccount } from 'api/proto-http/admin';
import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { ACCT_SOURCE_TYPES } from '../../utils/constants';

export type JournalFilterState = {
  from: string;
  to: string;
  accountCode?: string;
  sourceType?: string;
  // Free-text search over description / #id. The API has no `q` param, so a non-empty search
  // switches the page into fetch-all + client-filter mode (useAllJournalEntries).
  q?: string;
  // 'desc' (newest first) is the server's fixed order; 'asc' flips the fully-fetched set on the
  // client for the same reason.
  order: 'desc' | 'asc';
};

type Props = {
  filters: JournalFilterState;
  accounts: AcctAccount[];
  isLoading: boolean;
  onChange: (partial: Partial<JournalFilterState>) => void;
  onAllTime: () => void;
};

// Radix Select throws on an item with value='' (documented in currency-select.tsx). The "all"
// options therefore use a sentinel 'all' mapped back to undefined when building the request.
const SOURCE_OPTIONS = [
  { value: 'all', label: 'all sources' },
  ...ACCT_SOURCE_TYPES.map((t) => ({ value: t.value, label: t.label })),
];

// Journal list filters (03 §3.2): date range (defaults to the current month upstream, reset via
// "all time" so a new user's older postings don't silently vanish), account, and source type.
// Local-state + debounce lives in the parent page (members/page.tsx pattern); this is presentational.
export function EntriesFilter({ filters, accounts, isLoading, onChange, onAllTime }: Props) {
  const accountOptions = [
    { value: 'all', label: 'all accounts' },
    ...accounts.map((a) => ({ value: a.code ?? '', label: `${a.code} — ${a.name}` })),
  ];

  return (
    <div className='flex flex-wrap items-end gap-3'>
      <div className='flex flex-col gap-1'>
        <Text variant='inactive' size='small'>
          from
        </Text>
        <Input
          name='from'
          type='date'
          value={filters.from}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ from: e.target.value })}
          disabled={isLoading}
          className='w-36'
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive' size='small'>
          to
        </Text>
        <Input
          name='to'
          type='date'
          value={filters.to}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ to: e.target.value })}
          disabled={isLoading}
          className='w-36'
        />
      </div>

      <button
        type='button'
        onClick={onAllTime}
        disabled={isLoading}
        className='pb-1 underline underline-offset-2 hover:opacity-70 disabled:opacity-50'
      >
        <Text variant='inactive'>all time</Text>
      </button>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive' size='small'>
          account
        </Text>
        <Selector
          label='account'
          options={accountOptions}
          value={filters.accountCode ?? 'all'}
          onChange={(v: string) => onChange({ accountCode: v === 'all' ? undefined : v })}
          disabled={isLoading}
          compact
        />
      </div>

      <div className='flex flex-col gap-1'>
        <Text variant='inactive' size='small'>
          source
        </Text>
        <Selector
          label='source'
          options={SOURCE_OPTIONS}
          value={filters.sourceType ?? 'all'}
          onChange={(v: string) => onChange({ sourceType: v === 'all' ? undefined : v })}
          disabled={isLoading}
          compact
        />
      </div>

      <div className='flex min-w-48 flex-1 flex-col gap-1'>
        <Text variant='inactive' size='small'>
          search
        </Text>
        <Input
          name='q'
          value={filters.q ?? ''}
          placeholder='description or #id'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ q: e.target.value })}
        />
      </div>

      <button
        type='button'
        onClick={() => onChange({ order: filters.order === 'desc' ? 'asc' : 'desc' })}
        disabled={isLoading}
        className='pb-1 underline underline-offset-2 hover:opacity-70 disabled:opacity-50'
        title='flip between newest-first and oldest-first'
      >
        <Text variant='inactive'>
          {filters.order === 'desc' ? 'newest first ↓' : 'oldest first ↑'}
        </Text>
      </button>
    </div>
  );
}
