import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { formatDate } from '../orders-catalog/components/utility';
import { useInfiniteTickets, useUpdateTicketStatus } from './components/utils';

type Ticket = NonNullable<
  ReturnType<typeof useInfiniteTickets>['data']
>['pages'][number]['tickets'][number];

export function CustomerPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteTickets();
  const updateStatus = useUpdateTicketStatus();
  const tickets = data?.pages.flatMap((page) => page.tickets) || [];

  const handleToggleStatus = (ticketId: number, currentStatus: boolean) => {
    updateStatus.mutate({ id: ticketId, status: !currentStatus });
  };

  const COLUMNS: { label: string; accessor: (t: Ticket) => React.ReactNode }[] = [
    { label: 'ID', accessor: (t) => t.id },
    {
      label: 'Status',
      accessor: (t) => (
        <Button variant='main' size='lg' onClick={() => handleToggleStatus(t.id!, t.status!)}>
          {t.status ? 'Resolved' : 'Unresolved'}
        </Button>
      ),
    },
    { label: 'Created At', accessor: (t) => formatDate(t.createdAt) },
    { label: 'Updated At', accessor: (t) => formatDate(t.updatedAt) },
    { label: 'Resolved At', accessor: (t) => formatDate(t.resolvedAt) },
    { label: 'First Name', accessor: (t) => t.supportTicketInsert?.firstName },
    { label: 'Last Name', accessor: (t) => t.supportTicketInsert?.lastName },
    { label: 'Civility', accessor: (t) => t.supportTicketInsert?.civility },
    { label: 'Email', accessor: (t) => t.supportTicketInsert?.email },
    { label: 'Subject', accessor: (t) => t.supportTicketInsert?.subject },
    { label: 'Topic', accessor: (t) => t.supportTicketInsert?.topic },
    { label: 'Order Reference', accessor: (t) => t.supportTicketInsert?.orderReference },
    { label: 'Notes', accessor: (t) => t.supportTicketInsert?.notes },
  ];

  return (
    <div className='flex flex-col w-full gap-4 lg:pt-26'>
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-10 overflow-x-scroll'>
            <tr className='border-b border-textColor'>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className='text-center h-10 min-w-26 border border-r border-textColor px-2'
                >
                  <Text variant='uppercase'>{col.label}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className='border-b border-text last:border-b-0 h-10'>
                {COLUMNS.map((col) => (
                  <td key={col.label} className='border border-r border-textColor text-center px-2'>
                    <Text>{col.accessor(t)}</Text>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasNextPage && (
        <Button
          variant='main'
          size='lg'
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </Button>
      )}
    </div>
  );
}
