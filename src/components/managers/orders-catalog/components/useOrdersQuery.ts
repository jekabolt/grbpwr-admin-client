import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_OrderStatusEnum } from 'api/proto-http/admin';

export const ordersKeys = {
  all: ['order'] as const,
  orders: (orderFactor?: string) => [...ordersKeys.all, 'orders', orderFactor] as const,
  order: (filters: { limit: number; offset: number }) => [...ordersKeys.orders(), filters] as const,
};

export function useOrders(limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: ordersKeys.order({ limit, offset }),
    queryFn: async () => {
      const response = await adminService.ListOrders({
        limit,
        offset,
        orderFactor: 'ORDER_FACTOR_DESC',
        status: undefined,
        paymentMethod: undefined,
        email: undefined,
        orderId: undefined,
        orderUuid: undefined,
      });
      return response.orders || [];
    },
  });
}

/** Which of the three `ListOrders` lookups a typed search string resolved to. */
export type OrderSearchKind = 'id' | 'email' | 'uuid';

export type ParsedOrderSearch = {
  kind?: OrderSearchKind;
  orderId?: number;
  orderUuid?: string;
  email?: string;
};

/**
 * ordFilters v3 — one box, three targets. `ListOrders` already accepts orderId,
 * orderUuid and email as separate parameters; the operator should not have to know
 * which field they are holding.
 *
 *   digits (`1042`, `#1042`) → orderId
 *   contains `@`             → buyer email
 *   anything else            → orderUuid
 *
 * The `?ref=` deep link from a support ticket lands in the same box and is parsed the
 * same way, so a ticket carrying either an id or a uuid resolves without branching.
 */
export function parseOrderSearch(value: string): ParsedOrderSearch {
  const trimmed = value.trim();
  if (!trimmed) return {};
  // Operators paste order numbers straight out of an email, `#` and all.
  const digits = trimmed.replace(/^#/, '');
  if (/^\d+$/.test(digits)) return { kind: 'id', orderId: Number(digits) };
  if (trimmed.includes('@')) return { kind: 'email', email: trimmed };
  return { kind: 'uuid', orderUuid: trimmed };
}

export function useInfiniteOrders(
  limit: number = 50,
  orderFactor: 'ORDER_FACTOR_ASC' | 'ORDER_FACTOR_DESC' = 'ORDER_FACTOR_DESC',
  status?: common_OrderStatusEnum,
  search?: string,
) {
  const { orderId, orderUuid, email } = parseOrderSearch(search ?? '');
  return useInfiniteQuery({
    queryKey: [...ordersKeys.orders(orderFactor), email, status, orderId, orderUuid],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const response = await adminService.ListOrders({
        limit,
        offset: pageParam,
        orderFactor,
        status,
        paymentMethod: undefined,
        email,
        orderId,
        orderUuid,
      });
      return {
        orders: response.orders || [],
        nextOffset: response.orders?.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => {
      return lastPage.nextOffset;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
}
