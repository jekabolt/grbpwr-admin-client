import {
  common_SupportTicket,
  common_SupportTicketPriority,
  common_SupportTicketStatus,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { formatDateShort } from '../../orders-catalog/components/utility';
import {
  formatPriorityLabel,
  formatStatusLabel,
  getPriorityColor,
  getStatusColor,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  TicketFilters,
} from './utils';

interface TicketsTableProps {
  tickets: common_SupportTicket[];
  filters: TicketFilters;
  isLoading: boolean;
  onFiltersChange: (f: Partial<TicketFilters>) => void;
  onSelectTicket: (ticket: common_SupportTicket) => void;
}

export function TicketsTable({
  tickets,
  filters,
  isLoading,
  onFiltersChange,
  onSelectTicket,
}: TicketsTableProps) {
  const COLUMNS = useMemo(
    () =>
      [
        { key: 'id', label: 'ID', accessor: (t: common_SupportTicket) => t.id },
        {
          key: 'caseNumber',
          label: 'Case #',
          accessor: (t: common_SupportTicket) => t.caseNumber,
        },
        {
          key: 'status',
          label: 'Status',
          accessor: (t: common_SupportTicket) => (
            <span className={`inline-block px-1.5 py-0.5 ${getStatusColor(t.status)}`}>
              {formatStatusLabel(t.status)}
            </span>
          ),
        },
        {
          key: 'priority',
          label: 'Priority',
          accessor: (t: common_SupportTicket) => (
            <span className={`inline-block px-1.5 py-0.5 ${getPriorityColor(t.priority)}`}>
              {formatPriorityLabel(t.priority)}
            </span>
          ),
        },
        {
          key: 'email',
          label: 'Email',
          accessor: (t: common_SupportTicket) => t.supportTicketInsert?.email,
        },
        {
          key: 'name',
          label: 'Name',
          accessor: (t: common_SupportTicket) =>
            [t.supportTicketInsert?.firstName, t.supportTicketInsert?.lastName]
              .filter(Boolean)
              .join(' ') || '-',
        },
        {
          key: 'topic',
          label: 'Topic',
          accessor: (t: common_SupportTicket) => t.supportTicketInsert?.topic,
        },
        {
          key: 'subject',
          label: 'Subject',
          accessor: (t: common_SupportTicket) => t.supportTicketInsert?.subject,
        },
        {
          key: 'orderRef',
          label: 'Order Ref',
          accessor: (t: common_SupportTicket) => t.supportTicketInsert?.orderReference,
        },
        {
          key: 'category',
          label: 'Category',
          accessor: (t: common_SupportTicket) => t.category,
        },
        {
          key: 'created',
          label: 'Created',
          accessor: (t: common_SupportTicket) => formatDateShort(t.createdAt),
        },
      ] as const,
    [],
  );

  const statusOptions = [{ value: 'all', label: 'All' }, ...STATUS_OPTIONS];
  const priorityOptions = [{ value: 'all', label: 'All' }, ...PRIORITY_OPTIONS];

  return (
    <div className='w-full flex flex-col gap-4'>
      <div className='flex flex-wrap gap-3 items-end'>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            Status
          </Text>
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
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            Priority
          </Text>
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
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            Email
          </Text>
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
          <Text variant='inactive' size='small'>
            Order Ref
          </Text>
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

      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-10'>
            <tr className='border-b border-textColor'>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'text-center h-10 min-w-20 border border-r border-textColor px-2',
                    { 'sticky left-0 bg-textInactiveColor z-10': col.key === 'id' },
                  )}
                >
                  <Text variant='uppercase'>{col.label}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className='text-center py-8'>
                  <Text variant='uppercase'>no tickets found</Text>
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr
                  key={t.id}
                  className='group border-b border-text last:border-b-0 h-10 hover:bg-highlightColor/20 cursor-pointer transition-colors'
                  onClick={() => onSelectTicket(t)}
                >
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={cn('border border-r border-textColor text-center px-2', {
                        'sticky left-0 bg-bgColor group-hover:bg-highlightColor/20 z-10':
                          col.key === 'id',
                      })}
                    >
                      <Text>{col.accessor(t)}</Text>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
