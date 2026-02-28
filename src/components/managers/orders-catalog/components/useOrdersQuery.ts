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

/** Parses search value: numeric → orderId, else → orderUuid */
export function parseOrderSearch(value: string): { orderId?: number; orderUuid?: string } {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (/^\d+$/.test(trimmed)) return { orderId: Number(trimmed) };
  return { orderUuid: trimmed };
}

export function useInfiniteOrders(
  limit: number = 50,
  orderFactor: 'ORDER_FACTOR_ASC' | 'ORDER_FACTOR_DESC' = 'ORDER_FACTOR_DESC',
  email?: string,
  status?: common_OrderStatusEnum,
  orderSearch?: string,
) {
  const { orderId, orderUuid } = parseOrderSearch(orderSearch ?? '');
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
