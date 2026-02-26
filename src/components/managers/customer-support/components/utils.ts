import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_SupportTicketPriority,
  common_SupportTicketStatus,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

export const ticketKeys = {
  all: ['support-tickets'] as const,
  list: () => [...ticketKeys.all, 'list'] as const,
  listFiltered: (filters: Record<string, unknown>) =>
    [...ticketKeys.list(), filters] as const,
  detail: (id: number) => [...ticketKeys.all, 'detail', id] as const,
};

export interface TicketFilters {
  status?: common_SupportTicketStatus;
  priority?: common_SupportTicketPriority;
  email?: string;
  orderReference?: string;
  topic?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useInfiniteTickets(limit: number = 50, filters: TicketFilters = {}) {
  return useInfiniteQuery({
    queryKey: ticketKeys.listFiltered({ limit, ...filters }),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.GetSupportTicketsPaged({
        limit,
        offset: pageParam,
        orderFactor: 'ORDER_FACTOR_DESC',
        status: filters.status,
        email: filters.email || undefined,
        orderReference: filters.orderReference || undefined,
        topic: filters.topic || undefined,
        category: filters.category || undefined,
        priority: filters.priority,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      });
      return {
        tickets: response.tickets || [],
        totalCount: response.totalCount ?? 0,
        nextOffset: (response.tickets?.length ?? 0) === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 60_000,
  });
}

export function useTicketById(id: number | null) {
  return useQuery({
    queryKey: ticketKeys.detail(id!),
    queryFn: () => adminService.GetSupportTicketById({ id: id! }),
    enabled: id !== null,
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      internalNotes,
    }: {
      id: number;
      status: common_SupportTicketStatus;
      internalNotes?: string;
    }) => {
      return await adminService.UpdateSupportTicketStatus({ id, status, internalNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
      showMessage('Ticket status updated', 'success');
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Failed to update ticket status';
      showMessage(msg, 'error');
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();

  return useMutation({
    mutationFn: async ({
      id,
      priority,
      category,
      internalNotes,
    }: {
      id: number;
      priority?: common_SupportTicketPriority;
      category?: string;
      internalNotes?: string;
    }) => {
      return await adminService.UpdateSupportTicket({ id, priority, category, internalNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
      showMessage('Ticket updated', 'success');
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Failed to update ticket';
      showMessage(msg, 'error');
    },
  });
}

export const STATUS_OPTIONS: { value: common_SupportTicketStatus; label: string }[] = [
  { value: 'SUPPORT_TICKET_STATUS_SUBMITTED', label: 'Submitted' },
  { value: 'SUPPORT_TICKET_STATUS_IN_PROGRESS', label: 'In Progress' },
  { value: 'SUPPORT_TICKET_STATUS_WAITING_CUSTOMER', label: 'Waiting Customer' },
  { value: 'SUPPORT_TICKET_STATUS_RESOLVED', label: 'Resolved' },
  { value: 'SUPPORT_TICKET_STATUS_CLOSED', label: 'Closed' },
];

export const PRIORITY_OPTIONS: { value: common_SupportTicketPriority; label: string }[] = [
  { value: 'SUPPORT_TICKET_PRIORITY_LOW', label: 'Low' },
  { value: 'SUPPORT_TICKET_PRIORITY_MEDIUM', label: 'Medium' },
  { value: 'SUPPORT_TICKET_PRIORITY_HIGH', label: 'High' },
  { value: 'SUPPORT_TICKET_PRIORITY_URGENT', label: 'Urgent' },
];

export function formatStatusLabel(status: common_SupportTicketStatus | undefined): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status ?? 'Unknown';
}

export function formatPriorityLabel(
  priority: common_SupportTicketPriority | undefined,
): string {
  return PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? priority ?? '-';
}

export function getStatusColor(status: common_SupportTicketStatus | undefined): string {
  switch (status) {
    case 'SUPPORT_TICKET_STATUS_SUBMITTED':
      return 'bg-sky-100';
    case 'SUPPORT_TICKET_STATUS_IN_PROGRESS':
      return 'bg-blue-200';
    case 'SUPPORT_TICKET_STATUS_WAITING_CUSTOMER':
      return 'bg-yellow-100';
    case 'SUPPORT_TICKET_STATUS_RESOLVED':
      return 'bg-green-200';
    case 'SUPPORT_TICKET_STATUS_CLOSED':
      return 'bg-gray-300';
    default:
      return '';
  }
}

export function getPriorityColor(priority: common_SupportTicketPriority | undefined): string {
  switch (priority) {
    case 'SUPPORT_TICKET_PRIORITY_URGENT':
      return 'bg-red-200';
    case 'SUPPORT_TICKET_PRIORITY_HIGH':
      return 'bg-orange-200';
    case 'SUPPORT_TICKET_PRIORITY_MEDIUM':
      return 'bg-yellow-100';
    case 'SUPPORT_TICKET_PRIORITY_LOW':
      return 'bg-green-100';
    default:
      return '';
  }
}
