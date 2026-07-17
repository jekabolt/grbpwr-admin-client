import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { useCallback, useEffect, useState } from 'react';

// Paged product catalog loader for the ProductPicker (fitting form field & list
// filter). Accumulates pages and dedupes by id.
export function useProductCatalog(limit = 50) {
  const [products, setProducts] = useState<common_Colorway[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await adminService.GetColorwaysPaged({
          limit,
          offset: (page - 1) * limit,
          sortFactors: ['SORT_FACTOR_CREATED_AT'],
          orderFactor: 'ORDER_FACTOR_DESC',
          filterConditions: undefined,
          statuses: undefined,
        });
        if (!active) return;
        const next = res.colorways || [];
        if (next.length < limit) setHasMore(false);
        setProducts((prev) => {
          const combined = [...prev, ...next];
          return combined.reduce<common_Colorway[]>((acc, cur) => {
            if (!acc.find((p) => p.id === cur.id)) acc.push(cur);
            return acc;
          }, []);
        });
      } catch (e) {
        console.error('Failed to load products', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchProducts();
    return () => {
      active = false;
    };
  }, [page, limit]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) setPage((p) => p + 1);
  }, [loading, hasMore]);

  return { products, hasMore, loadMore };
}
