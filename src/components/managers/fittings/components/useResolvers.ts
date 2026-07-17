import { useQueries } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_Model, common_Colorway } from 'api/proto-http/admin';
import { modelKeys } from 'components/managers/models/components/useModelQuery';

// There is no batch get-by-ids endpoint, so we resolve names per id. React Query
// dedupes and caches each id, so a fittings table only fetches each distinct
// product/model once and reuses it across pages and re-renders.
export function useProductsByIds(ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => id > 0)));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ['products', 'detail', id],
      queryFn: async () => (await adminService.GetColorwayByID({ id })).product?.colorway ?? null,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const map = new Map<number, common_Colorway>();
  unique.forEach((id, i) => {
    const product = results[i]?.data;
    if (product) map.set(id, product);
  });
  return map;
}

export function useModelsByIds(ids: number[]) {
  const unique = Array.from(new Set(ids.filter((id) => id > 0)));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: modelKeys.detail(id),
      queryFn: async () => (await adminService.GetModel({ id })).model ?? null,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const map = new Map<number, common_Model>();
  unique.forEach((id, i) => {
    const model = results[i]?.data;
    if (model) map.set(id, model);
  });
  return map;
}
