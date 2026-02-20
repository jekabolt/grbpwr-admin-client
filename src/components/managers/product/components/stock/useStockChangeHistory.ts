import { useInfiniteQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_OrderFactor, common_StockChangeSource } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

export type StockChangeHistoryFilters = {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  source?: common_StockChangeSource;
  orderFactor?: common_OrderFactor;
  sizeId?: number;
};

export const stockChangeHistoryKeys = {
  all: ['stockChangeHistory'] as const,
  list: (productId: number | undefined, filters: StockChangeHistoryFilters) =>
    [...stockChangeHistoryKeys.all, 'list', productId, filters] as const,
};

const DEFAULT_LIMIT = 30;
const DEFAULT_ORDER_FACTOR: common_OrderFactor = 'ORDER_FACTOR_DESC';
const DEFAULT_SOURCE: common_StockChangeSource = 'STOCK_CHANGE_SOURCE_UNSPECIFIED';

function toRfc3339DateOnly(dateStr: string, endOfDay: boolean): string {
  if (endOfDay) {
    return `${dateStr}T23:59:59.999Z`;
  }
  return `${dateStr}T00:00:00.000Z`;
}

export function useStockChangeHistory(
  productId: number | undefined,
  filters: StockChangeHistoryFilters = {},
  options?: { enabled?: boolean },
) {
  const { showMessage } = useSnackBarStore();
  const { enabled = true } = options ?? {};
  const {
    dateFrom,
    dateTo,
    limit = DEFAULT_LIMIT,
    source = DEFAULT_SOURCE,
    orderFactor = DEFAULT_ORDER_FACTOR,
    sizeId,
  } = filters;

  const result = useInfiniteQuery({
    queryKey: stockChangeHistoryKeys.list(productId, filters),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      try {
        const response = await adminService.ListStockChangeHistory({
          productId,
          sizeId,
          source: source === 'STOCK_CHANGE_SOURCE_UNSPECIFIED' ? undefined : source,
          limit,
          offset: pageParam,
          orderFactor,
          dateFrom: dateFrom ? toRfc3339DateOnly(dateFrom, false) : undefined,
          dateTo: dateTo ? toRfc3339DateOnly(dateTo, true) : undefined,
        });
        const changes = response.changes ?? [];
        const total = response.total ?? 0;
        const nextOffset = pageParam + changes.length;
        return { changes, total, nextOffset };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch stock history';
        showMessage(msg, 'error');
        throw err;
      }
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.changes?.length) return undefined;
      if (lastPage.changes.length < limit) return undefined;
      if (lastPage.total != null && lastPage.nextOffset >= lastPage.total) return undefined;
      return lastPage.nextOffset;
    },
    initialPageParam: 0,
    enabled: enabled && productId != null,
  });

  const changes = result.data?.pages.flatMap((p) => p?.changes ?? []) ?? [];
  return {
    ...result,
    data: changes,
    changes,
  };
}
