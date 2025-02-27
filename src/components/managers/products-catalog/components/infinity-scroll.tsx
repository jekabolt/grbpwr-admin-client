import { getProductsPaged } from 'api/admin';
import { common_Product } from 'api/proto-http/admin';
import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useSearchParams } from 'react-router-dom';
import { ProductGrid } from './product-grid';
import { getProductPagedParans } from './utility';

const ITEMS_PER_PAGE = 16;

interface Props {
  firstItems: common_Product[];
}

export function InfinityScroll({ firstItems }: Props) {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<common_Product[]>(firstItems);
  const [isLoading, setIsLoading] = useState(false);
  const { ref, inView } = useInView();
  const pageRef = useRef(2);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    setItems(firstItems);
    hasMoreRef.current = true;
    pageRef.current = 2;
    setIsLoading(false);
  }, [firstItems, searchParams]);

  const loadMoreData = async () => {
    if (!hasMoreRef.current || isLoading) {
      console.log('Skipping load:', { hasMore: hasMoreRef.current, isLoading });
      return;
    }
    setIsLoading(true);

    try {
      const params = Object.fromEntries(searchParams.entries());
      const offset = (pageRef.current - 1) * ITEMS_PER_PAGE;

      const response = await getProductsPaged({
        limit: ITEMS_PER_PAGE,
        offset,
        ...getProductPagedParans(params),
      });

      const newProducts = response.products || [];

      if (!newProducts.length || newProducts.length < ITEMS_PER_PAGE) {
        hasMoreRef.current = false;
      }

      pageRef.current += 1;
      setItems((prevItems) => [...prevItems, ...newProducts]);
    } catch (error) {
      console.error('Failed to fetch more products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (inView && hasMoreRef.current && !isLoading) {
      loadMoreData();
    }
  }, [inView, searchParams]);

  function refreshAfterDeletetion(id: number | undefined) {
    if (!id) return;
    setItems(items.filter((item) => item.id !== id));
  }

  return (
    <div>
      <ProductGrid products={items} refresh={refreshAfterDeletetion} />
      {hasMoreRef.current && (
        <div ref={ref} className='text-center text-xl' style={{ minHeight: '100px' }}>
          loading...
        </div>
      )}
    </div>
  );
}
