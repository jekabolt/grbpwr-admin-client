import { common_SupportTicket } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { TicketDetail } from './components/ticket-detail';
import { TicketsTable } from './components/tickets-table';
import { TicketFilters, useInfiniteTickets } from './components/utils';

export function CustomerPage() {
  const [filters, setFilters] = useState<TicketFilters>({});
  const [debouncedFilters, setDebouncedFilters] = useState<TicketFilters>({});
  const [selectedTicket, setSelectedTicket] = useState<common_SupportTicket | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteTickets(50, debouncedFilters);
  const tickets = data?.pages.flatMap((page) => page.tickets) || [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const handleFiltersChange = (partial: Partial<TicketFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const handleSelectTicket = (ticket: common_SupportTicket) => {
    setSelectedTicket(ticket);
  };

  const handleCloseDetail = () => {
    setSelectedTicket(null);
  };

  return (
    <div className='flex flex-col w-full gap-4 pb-16'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='large'>
          Support Tickets {totalCount > 0 && `(${totalCount})`}
        </Text>
      </div>

      {selectedTicket ? (
        <TicketDetail ticket={selectedTicket} onClose={handleCloseDetail} />
      ) : (
        <>
          <TicketsTable
            tickets={tickets}
            filters={filters}
            isLoading={isLoading || isFetchingNextPage}
            onFiltersChange={handleFiltersChange}
            onSelectTicket={handleSelectTicket}
          />
          {hasNextPage && (
            <div className='flex justify-center'>
              <Button
                variant='main'
                size='lg'
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                loading={isFetchingNextPage}
              >
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
