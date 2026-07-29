import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { OrderComment } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

// ordComment v2 — the order card's note is now a real author thread. The author is
// stamped server-side from the JWT (like task comments), so the client only ever sends
// the body. Query logic lives here; the component stays presentational.

export const orderCommentsKeys = {
  all: ['order-comments'] as const,
  list: (orderUuid: string) => [...orderCommentsKeys.all, orderUuid] as const,
};

function byOldestFirst(a: OrderComment, b: OrderComment): number {
  return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
}

export function useOrderComments(orderUuid: string | undefined) {
  return useQuery({
    queryKey: orderCommentsKeys.list(orderUuid ?? ''),
    queryFn: async () => {
      const r = await adminService.ListOrderComments({ orderUuid: orderUuid as string });
      return [...(r.comments ?? [])].sort(byOldestFirst);
    },
    enabled: !!orderUuid,
    staleTime: 30_000,
  });
}

export function useAddOrderComment(orderUuid: string | undefined) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (comment: string) =>
      adminService.AddOrderComment({ orderUuid: orderUuid as string, comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orderCommentsKeys.list(orderUuid ?? '') });
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to add comment', 'error'),
  });
}
