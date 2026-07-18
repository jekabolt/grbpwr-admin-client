import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { DEFAULT_PRODUCT_LIMIT } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';
import { BatchActionBar } from './batch-action-bar';
import { ProductGrid } from './product-grid';
import { SelectionToolbar } from './selection-toolbar';
import { getProductPagedParans } from './utility';
import { useCatalogSelection } from './useCatalogSelection';

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

  const canEdit = usePermissions().canWrite(SECTION.products);
  const selection = useCatalogSelection({ items, setItems });
  const { exitSelection } = selection;

  useEffect(() => {
    setItems(firstItems);
    const noLoadMore = searchParams.has('limit');
    hasMoreRef.current = !noLoadMore;
    setHasMore(!noLoadMore);
    pageRef.current = 2;
    setIsLoading(false);
    // A new filter/search result invalidates any in-progress selection.
    exitSelection();
  }, [firstItems, searchParams, exitSelection]);

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
        <div className='flex flex-col gap-4'>
          {canEdit && (
            <SelectionToolbar
              selectionMode={selection.selectionMode}
              onEnter={selection.enterSelection}
              onExit={selection.exitSelection}
              selectedCount={selection.selectedCount}
              totalOnPage={selection.totalOnPage}
              allOnPageSelected={selection.allOnPageSelected}
              onSelectAll={selection.selectAllOnPage}
            />
          )}
          <ProductGrid
            products={items}
            refresh={refreshAfterDeletetion}
            selectionMode={selection.selectionMode}
            isSelected={selection.isSelected}
            onToggleSelect={selection.toggle}
          />
        </div>
      )}
      {canEdit && (
        <BatchActionBar
          selectedCount={selection.selectedCount}
          hideableCount={selection.hideableCount}
          unhideableCount={selection.unhideableCount}
          busy={selection.busy}
          onHide={selection.hideSelected}
          onUnhide={selection.unhideSelected}
          onClear={selection.clearSelection}
        />
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
