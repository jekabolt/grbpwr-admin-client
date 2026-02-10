import { adminService } from 'api/api';
import { common_Product } from 'api/proto-http/admin';
import { DEFAULT_PRODUCT_LIMIT } from 'constants/filter';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useSearchParams } from 'react-router-dom';
import { ProductGrid } from './product-grid';
import { getProductPagedParans } from './utility';

interface Props {
  firstItems: common_Product[];
}

export function InfinityScroll({ firstItems }: Props) {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<common_Product[]>(firstItems);
  const [isLoading, setIsLoading] = useState(false);
  const { showMessage } = useSnackBarStore();
  const { ref, inView } = useInView();
  const pageRef = useRef(2);
  const hasMoreRef = useRef(true);
  const [hasMore, setHasMore] = useState(true);
  const prevInViewRef = useRef(false);

  useEffect(() => {
    setItems(firstItems);
    const noLoadMore = searchParams.has('limit');
    hasMoreRef.current = !noLoadMore;
    setHasMore(!noLoadMore);
    pageRef.current = 2;
    setIsLoading(false);
  }, [firstItems, searchParams]);

  const params = Object.fromEntries(searchParams.entries());
  const limit = params.limit
    ? Math.max(1, parseInt(params.limit, 10) || DEFAULT_PRODUCT_LIMIT)
    : DEFAULT_PRODUCT_LIMIT;
  // When user selected a limit (in URL), show only that many — no "load more"
  const limitFixedByUser = searchParams.has('limit');

  const loadMoreData = async () => {
    if (!hasMoreRef.current || isLoading) {
      console.log('Skipping load:', { hasMore: hasMoreRef.current, isLoading });
      return;
    }
    setIsLoading(true);

    try {
      const offset = (pageRef.current - 1) * limit;

      const response = await adminService.GetProductsPaged({
        limit,
        offset,
        ...getProductPagedParans(params),
      });

      const newProducts = response.products || [];

      if (!newProducts.length || newProducts.length < limit) {
        hasMoreRef.current = false;
        setHasMore(false);
      }

      pageRef.current += 1;
      setItems((prevItems) => [...prevItems, ...newProducts]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch more products';
      showMessage(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (limitFixedByUser) return; // fixed limit = no load more
    const justEnteredView = inView && !prevInViewRef.current;
    prevInViewRef.current = inView;
    if (firstItems.length === 0) return;
    if (justEnteredView && hasMoreRef.current && !isLoading) {
      loadMoreData();
    }
  }, [inView, searchParams, firstItems.length, limitFixedByUser]);

  function refreshAfterDeletetion(id: number | undefined) {
    if (!id) return;
    setItems(items.filter((item) => item.id !== id));
  }

  return (
    <div>
      <ProductGrid products={items} refresh={refreshAfterDeletetion} />
      {hasMore && (
        <div ref={ref} className='text-center' style={{ minHeight: '100px' }}>
          loading...
        </div>
      )}
    </div>
  );
}
