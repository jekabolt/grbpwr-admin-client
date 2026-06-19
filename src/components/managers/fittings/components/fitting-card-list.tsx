import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { FittingProductFilter } from './fitting-product-filter';
import { useDeleteFitting, useInfiniteFittings } from './useFittingQuery';
import { useModelsByIds, useProductsByIds } from './useResolvers';
import { formatFittingDate, statusLabel, verdictLabel } from './utils';

const LIMIT = 24;

export function FittingCardList() {
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const deleteFitting = useDeleteFitting();

  const [productId, setProductId] = useState(0);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteFittings(
    { productId },
    LIMIT,
  );
  const { ref, inView } = useInView({ rootMargin: '200px' });
  const [pendingDelete, setPendingDelete] = useState<{ id: number } | null>(null);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const fittings = data?.pages.flatMap((page) => page.fittings) ?? [];
  const total = data?.pages[0]?.total ?? fittings.length;

  const productMap = useProductsByIds(fittings.map((f) => f.fitting?.productId ?? 0));
  const modelMap = useModelsByIds(fittings.map((f) => f.fitting?.modelId ?? 0));

  const productName = (id?: number) =>
    id ? (productMap.get(id)?.productDisplay?.productBody?.translations?.[0]?.name ?? `#${id}`) : '—';
  const productThumb = (id?: number) =>
    (id && productMap.get(id)?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl) || '';
  const modelName = (id?: number) => (id ? (modelMap.get(id)?.model?.name || `#${id}`) : '—');

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteFitting.mutate(pendingDelete.id, {
      onSuccess: () => showMessage('fitting deleted', 'success'),
      onError: (error) =>
        showMessage(error instanceof Error ? error.message : 'Failed to delete fitting', 'error'),
    });
    setPendingDelete(null);
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <FittingProductFilter productId={productId} onChange={setProductId} />
        <Text variant='inactive' size='small'>
          {fittings.length} of {total}
        </Text>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading fittings…
          </Text>
        </div>
      ) : fittings.length === 0 ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='uppercase'>
            no fittings
          </Text>
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'>
          {fittings.map((fitting) => {
            const id = fitting.id ?? 0;
            const insert = fitting.fitting;
            return (
              <div
                key={id}
                role='button'
                tabIndex={0}
                onClick={() => navigate(`/fittings/${id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/fittings/${id}`)}
                className='group relative flex cursor-pointer flex-col overflow-hidden border border-textColor transition-colors hover:bg-highlightColor/5'
              >
                <Media
                  src={productThumb(insert?.productId)}
                  alt={productName(insert?.productId)}
                  aspectRatio='3/4'
                  fit='cover'
                />
                <div className='flex flex-col gap-1 p-2'>
                  <Text>{productName(insert?.productId)}</Text>
                  <Text variant='inactive' size='small'>
                    {modelName(insert?.modelId)} · {formatFittingDate(insert?.fittingDate)}
                  </Text>
                  <Text variant='inactive' size='small'>
                    {statusLabel(insert?.status)} · {verdictLabel(insert?.verdict)} ·{' '}
                    {fitting.media?.length ?? 0} photo(s)
                  </Text>
                </div>
                <Button
                  type='button'
                  aria-label='delete fitting'
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setPendingDelete({ id });
                  }}
                  className='absolute right-1 top-1 z-20 border border-textColor bg-bgColor px-1.5 leading-none opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100'
                >
                  ✕
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {hasNextPage && (
        <div ref={ref} className='flex justify-center py-4'>
          {isFetchingNextPage && <Text variant='inactive'>loading more…</Text>}
        </div>
      )}

      <ConfirmationModal
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={confirmDelete}
        title='delete fitting'
        confirmLabel='delete'
        cancelLabel='cancel'
      >
        <Text>delete this fitting? this cannot be undone.</Text>
      </ConfirmationModal>
    </div>
  );
}
