import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { useDeleteFitting, useInfiniteFittings } from './useFittingQuery';
import { useModelsByIds, useProductsByIds } from './useResolvers';
import { formatFittingDate, statusLabel, verdictLabel } from './utils';

const LIMIT = 30;
const COLUMNS = ['id', 'product', 'model', 'date', 'status', 'verdict', 'photos', ''];

export function FittingTable() {
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const deleteFitting = useDeleteFitting();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteFittings(
    {},
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

  const productName = (productId?: number) => {
    if (!productId) return undefined;
    const product = productMap.get(productId);
    return product?.productDisplay?.productBody?.translations?.[0]?.name ?? `#${productId}`;
  };
  const productThumb = (productId?: number) =>
    (productId && productMap.get(productId)?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl) ||
    '';
  const modelName = (modelId?: number) =>
    modelId ? (modelMap.get(modelId)?.model?.name || `#${modelId}`) : '—';

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteFitting.mutate(pendingDelete.id, {
      onSuccess: () => showMessage('fitting deleted', 'success'),
      onError: (error) =>
        showMessage(error instanceof Error ? error.message : 'Failed to delete fitting', 'error'),
    });
    setPendingDelete(null);
  }

  if (isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading fittings…
        </Text>
      </div>
    );
  }

  if (fittings.length === 0) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='uppercase'>
          no fittings yet
        </Text>
      </div>
    );
  }

  return (
    <>
      <Text variant='inactive' size='small'>
        {fittings.length} of {total}
      </Text>

      {/* Desktop table */}
      <div className='hidden w-full overflow-x-auto lg:block'>
        <table className='w-full border-collapse border border-textColor'>
          <thead className='bg-textInactiveColor'>
            <tr>
              {COLUMNS.map((col, i) => (
                <th key={i} className='border border-textColor px-2 py-1 text-left'>
                  <Text variant='uppercase' size='small'>
                    {col}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fittings.map((fitting) => {
              const id = fitting.id ?? 0;
              const insert = fitting.fitting;
              return (
                <tr
                  key={id}
                  role='button'
                  tabIndex={0}
                  onClick={() => navigate(`/fittings/${id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/fittings/${id}`)}
                  className='cursor-pointer border-b border-textColor hover:bg-textInactiveColor'
                >
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{id}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    {insert?.productId ? (
                      <Link
                        to={`/products/${insert.productId}`}
                        onClick={(e) => e.stopPropagation()}
                        className='flex items-center gap-2 underline'
                      >
                        <span className='w-8 shrink-0'>
                          <Media
                            src={productThumb(insert.productId)}
                            alt=''
                            aspectRatio='1/1'
                            fit='contain'
                          />
                        </span>
                        <Text>{productName(insert.productId)}</Text>
                      </Link>
                    ) : (
                      <Text>—</Text>
                    )}
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{modelName(insert?.modelId)}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{formatFittingDate(insert?.fittingDate)}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{statusLabel(insert?.status)}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{verdictLabel(insert?.verdict)}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{fitting.media?.length ?? 0}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1 text-right'>
                    <Button
                      type='button'
                      variant='secondary'
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setPendingDelete({ id });
                      }}
                    >
                      delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className='flex flex-col gap-3 lg:hidden'>
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
              className='flex cursor-pointer items-start gap-3 border border-textColor p-3'
            >
              <span className='w-14 shrink-0'>
                <Media
                  src={productThumb(insert?.productId)}
                  alt=''
                  aspectRatio='1/1'
                  fit='contain'
                />
              </span>
              <div className='min-w-0 flex-1 space-y-0.5'>
                <Text>{insert?.productId ? productName(insert.productId) : '—'}</Text>
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
                variant='secondary'
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setPendingDelete({ id });
                }}
              >
                delete
              </Button>
            </div>
          );
        })}
      </div>

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
    </>
  );
}
