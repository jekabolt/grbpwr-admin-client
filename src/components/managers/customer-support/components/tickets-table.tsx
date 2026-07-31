import { common_SupportTicket } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { formatDateShort } from '../../orders-catalog/components/utility';
import { Filter } from './filter';
import {
  formatPriorityLabel,
  formatStatusLabel,
  getPriorityColor,
  getStatusColor,
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
          accessor: (t: common_SupportTicket) => {
            const ref = t.supportTicketInsert?.orderReference;
            if (!ref) return '-';
            return (
              <Link
                to={`${ROUTES.orders}?ref=${encodeURIComponent(ref)}`}
                onClick={(e) => e.stopPropagation()}
                className='underline underline-offset-2 hover:opacity-70'
              >
                {ref}
              </Link>
            );
          },
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

  return (
    <div className='w-full flex flex-col gap-4'>
      <Filter filters={filters} onFiltersChange={onFiltersChange} isLoading={isLoading} />
      {/* One filled block (Section), not a bordered table with no fill — the grey page ground
          used to show straight through every cell. The cell rules stay as internal grid lines,
          matching the StatGrid table convention. */}
      <Section className='w-full overflow-x-auto'>
        <table className='w-full min-w-max border-collapse'>
          <thead className='h-10'>
            <tr className='border-b border-borderColor'>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'h-10 min-w-20 border border-r border-borderColor bg-bgSecondary px-2 text-center',
                    {
                      'sticky left-0 z-10': col.key === 'id',
                    },
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
                  className='group h-10 border-b border-borderColor last:border-b-0 hover:bg-highlightColor/20 cursor-pointer transition-colors'
                  onClick={() => onSelectTicket(t)}
                >
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={cn('border border-r border-borderColor text-center px-2', {
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
      </Section>
    </div>
  );
}
