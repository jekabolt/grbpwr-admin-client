import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';

export const customerKeys = {
  all: ['customer'] as const,
  tickets: () => [...customerKeys.all, 'tickets'] as const,
  ticket: (filters: { limit: number; offset: number }) =>
    [...customerKeys.tickets(), filters] as const,
};

export function useTickets(limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: customerKeys.ticket({ limit, offset }),
    queryFn: async () => {
      const response = await adminService.GetSupportTicketsPaged({
        limit,
        offset,
        orderFactor: 'ORDER_FACTOR_DESC',
        resolved: undefined,
      });
      return response.tickets || [];
    },
  });
}

export function useInfiniteTickets(limit: number = 50) {
  return useInfiniteQuery({
    queryKey: customerKeys.tickets(),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.GetSupportTicketsPaged({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
        resolved: undefined,
      });
      return {
        tickets: response.tickets || [],
        nextOffset: response.tickets?.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: boolean }) => {
      return await adminService.UpdateSupportTicketStatus({
        id,
        status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.tickets() });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Failed to update ticket status';
      showMessage(msg, 'error');
    },
  });
}
