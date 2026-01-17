import { useQuery } from '@tanstack/react-query';
import { getProductsPaged } from 'api/admin';
import { common_Product } from 'api/proto-http/admin';

export const productsByTagKeys = {
  all: ['productsByTag'] as const,
  tag: (tag: string) => [...productsByTagKeys.all, tag] as const,
};

export function useProductsByTag(tag: string | undefined | null, enabled = true) {
  return useQuery({
    queryKey: productsByTagKeys.tag(tag || ''),
    queryFn: async () => {
      if (!tag || tag.trim().length === 0) {
        return [];
      }

      const response = await getProductsPaged({
        limit: 1000,
        offset: 0,
        sortFactors: ['SORT_FACTOR_CREATED_AT'],
        orderFactor: 'ORDER_FACTOR_DESC',
        filterConditions: {
          byTag: tag.trim(),
        } as any,
        showHidden: true,
      });

      return (response.products || []) as common_Product[];
    },
    enabled: enabled && !!tag && tag.trim().length > 0,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
