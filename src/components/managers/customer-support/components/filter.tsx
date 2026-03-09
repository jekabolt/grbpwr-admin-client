import { common_SupportTicketPriority, common_SupportTicketStatus } from 'api/proto-http/admin';
import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TicketFilters } from './utils';

interface FilterProps {
  filters: TicketFilters;
  isLoading: boolean;
  onFiltersChange: (filters: TicketFilters) => void;
}

export function Filter({ filters, onFiltersChange, isLoading }: FilterProps) {
  const statusOptions = [{ value: 'all', label: 'All' }, ...STATUS_OPTIONS];
  const priorityOptions = [{ value: 'all', label: 'All' }, ...PRIORITY_OPTIONS];

  return (
    <div className='flex flex-wrap gap-3 items-end'>
      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>status</Text>
        <Selector
          label='Status'
          options={statusOptions}
          value={filters.status ?? 'all'}
          onChange={(v: string) =>
            onFiltersChange({
              status: v === 'all' ? undefined : (v as common_SupportTicketStatus),
            })
          }
          disabled={isLoading}
          compact
        />
      </div>
      <div className='flex flex-col gap-1'>
        <Text variant='inactive'>priority</Text>
        <Selector
          label='Priority'
          options={priorityOptions}
          value={filters.priority ?? 'all'}
          onChange={(v: string) =>
            onFiltersChange({
              priority: v === 'all' ? undefined : (v as common_SupportTicketPriority),
            })
          }
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
        <Text variant='inactive'>order reference</Text>
        <Input
          name='orderRef'
          type='text'
          placeholder='filter by order'
          value={filters.orderReference ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onFiltersChange({ orderReference: e.target.value })
          }
          disabled={isLoading}
          className='w-36'
        />
      </div>
    </div>
  );
}
