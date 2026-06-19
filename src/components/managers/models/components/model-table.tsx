import { genderOptions } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { useDeleteModel, useInfiniteModels } from './useModelQuery';

const LIMIT = 30;

const COLUMNS = ['id', 'name', 'gender', 'sample size', 'measurements', ''];

function genderLabel(gender?: string) {
  if (!gender || gender === 'GENDER_ENUM_UNKNOWN') return '—';
  return genderOptions.find((g) => g.value === gender)?.label ?? '—';
}

export function ModelTable() {
  const navigate = useNavigate();
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const deleteModel = useDeleteModel();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteModels(LIMIT);
  const { ref, inView } = useInView({ rootMargin: '200px' });

  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const models = data?.pages.flatMap((page) => page.models) ?? [];
  const total = data?.pages[0]?.total ?? models.length;

  const sizeName = (sizeId?: number) => {
    if (!sizeId) return '—';
    return dictionary?.sizes?.find((s) => s.id === sizeId)?.name ?? `#${sizeId}`;
  };

  function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    deleteModel.mutate(id, {
      onSuccess: () => showMessage('model deleted', 'success'),
      onError: (error) =>
        showMessage(error instanceof Error ? error.message : 'Failed to delete model', 'error'),
    });
    setPendingDelete(null);
  }

  if (isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading models…
        </Text>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='uppercase'>
          no models yet
        </Text>
      </div>
    );
  }

  return (
    <>
      <Text variant='inactive' size='small'>
        {models.length} of {total}
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
            {models.map((model) => {
              const id = model.id ?? 0;
              const insert = model.model;
              return (
                <tr
                  key={id}
                  role='button'
                  tabIndex={0}
                  onClick={() => navigate(`/models/${id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/models/${id}`)}
                  className='cursor-pointer border-b border-textColor hover:bg-textInactiveColor'
                >
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{id}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{insert?.name || '—'}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{genderLabel(insert?.gender)}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{sizeName(insert?.defaultSampleSizeId)}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1'>
                    <Text>{insert?.measurements?.length ?? 0}</Text>
                  </td>
                  <td className='border border-textColor px-2 py-1 text-right'>
                    <Button
                      type='button'
                      variant='secondary'
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setPendingDelete({ id, name: insert?.name || `model ${id}` });
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
        {models.map((model) => {
          const id = model.id ?? 0;
          const insert = model.model;
          return (
            <div
              key={id}
              role='button'
              tabIndex={0}
              onClick={() => navigate(`/models/${id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/models/${id}`)}
              className='flex cursor-pointer items-start justify-between gap-3 border border-textColor p-3'
            >
              <div className='min-w-0 flex-1 space-y-0.5'>
                <Text>
                  {insert?.name || '—'} <span className='text-textInactiveColor'>#{id}</span>
                </Text>
                <Text variant='inactive' size='small'>
                  {genderLabel(insert?.gender)} · sample {sizeName(insert?.defaultSampleSizeId)} ·{' '}
                  {insert?.measurements?.length ?? 0} measurement(s)
                </Text>
              </div>
              <Button
                type='button'
                variant='secondary'
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setPendingDelete({ id, name: insert?.name || `model ${id}` });
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
        title='delete model'
        confirmLabel='delete'
        cancelLabel='cancel'
      >
        <Text>
          delete “{pendingDelete?.name}”? this cannot be undone.
        </Text>
      </ConfirmationModal>
    </>
  );
}
