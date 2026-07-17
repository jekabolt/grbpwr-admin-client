import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { DEFAULT_PRODUCT_LIMIT } from 'constants/filter';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';
import { ProductGrid } from './product-grid';
import { getProductPagedParans } from './utility';

interface Props {
  firstItems: common_Colorway[];
  initialLoading?: boolean;
  onCountChange?: (count: number, hasMore: boolean) => void;
}

export function InfinityScroll({ firstItems, initialLoading = false, onCountChange }: Props) {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<common_Colorway[]>(firstItems);
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

      const response = await adminService.GetColorwaysPaged({
        limit,
        offset,
        ...getProductPagedParans(params),
      });

      const newProducts = response.colorways || [];

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

  useEffect(() => {
    onCountChange?.(items.length, hasMore);
  }, [items.length, hasMore, onCountChange]);

  const showEmpty = !initialLoading && !isLoading && items.length === 0;

  return (
    <div>
      {showEmpty ? (
        <div className='flex flex-col items-center justify-center gap-2 py-20'>
          <Text variant='uppercase'>no products found</Text>
          <Text variant='inactive' size='small'>
            try adjusting or clearing the filters
          </Text>
        </div>
      ) : (
        <ProductGrid products={items} refresh={refreshAfterDeletetion} />
      )}
      {hasMore && items.length > 0 && (
        <div ref={ref} className='flex justify-center py-6' style={{ minHeight: '80px' }}>
          {isLoading && (
            <Text variant='inactive' className='animate-pulse'>
              loading more…
            </Text>
          )}
        </div>
      )}
      {initialLoading && items.length === 0 && (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading products…
          </Text>
        </div>
      )}
    </div>
  );
}
