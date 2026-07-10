import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { genderOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { useDeleteModel, useInfiniteModels } from './useModelQuery';

const ALL = 'ALL';
const LIMIT = 24;

function genderLabel(gender?: string) {
  if (!gender || gender === 'GENDER_ENUM_UNKNOWN') return '—';
  return genderOptions.find((g) => g.value === gender)?.label ?? '—';
}

export function ModelCardList() {
  const navigate = useNavigate();
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const deleteModel = useDeleteModel();
  const canEdit = usePermissions().canWrite(SECTION.models);

  const [gender, setGender] = useState<string>(ALL);
  const [name, setName] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  // Debounce the name search so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(name), 300);
    return () => clearTimeout(t);
  }, [name]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteModels(
    { gender: gender === ALL ? '' : gender, name: debouncedName },
    LIMIT,
  );
  const { ref, inView } = useInView({ rootMargin: '200px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const models = data?.pages.flatMap((page) => page.models) ?? [];
  const total = data?.pages[0]?.total ?? models.length;

  const sizesLabel = (ids?: number[]) => {
    if (!ids?.length) return '—';
    return ids
      .map((id) => dictionary?.sizes?.find((s) => s.id === id)?.name ?? `#${id}`)
      .join(', ');
  };

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteModel.mutate(pendingDelete.id, {
      onSuccess: () => showMessage('model deleted', 'success'),
      onError: (e) =>
        showMessage(e instanceof Error ? e.message : 'Failed to delete model', 'error'),
    });
    setPendingDelete(null);
  }

  const genderItems = [{ value: ALL, label: 'all genders' }, ...genderOptions];

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <div className='sm:w-64'>
          <Input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder='search by name'
          />
        </div>
        <div className='sm:w-48'>
          <Select
            name='gender-filter'
            items={genderItems}
            value={gender}
            onValueChange={(v: string) => setGender(v)}
            placeholder='all genders'
            fullWidth
          />
        </div>
        <Text variant='inactive' size='small'>
          {models.length} of {total}
        </Text>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading models…
          </Text>
        </div>
      ) : models.length === 0 ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='uppercase'>
            no models
          </Text>
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'>
          {models.map((model) => {
            const id = model.id ?? 0;
            const insert = model.model;
            const thumb = model.thumbnail?.media?.thumbnail?.mediaUrl || '';
            return (
              <div
                key={id}
                role='button'
                tabIndex={0}
                onClick={() => navigate(`/models/${id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/models/${id}`)}
                className='group relative flex cursor-pointer flex-col overflow-hidden border border-textColor transition-colors hover:bg-highlightColor/5'
              >
                <Media src={thumb} alt={insert?.name || 'model'} aspectRatio='3/4' fit='cover' />
                <div className='flex flex-col gap-1 p-2'>
                  <Text>
                    {insert?.name || '—'} <span className='text-textInactiveColor'>#{id}</span>
                  </Text>
                  <Text variant='inactive' size='small'>
                    {genderLabel(insert?.gender)} · sizes {sizesLabel(insert?.defaultSizeIds)} ·{' '}
                    {insert?.measurements?.length ?? 0} meas.
                  </Text>
                </div>
                {canEdit && (
                  <Button
                    type='button'
                    aria-label='delete model'
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setPendingDelete({ id, name: insert?.name || `model ${id}` });
                    }}
                    className='absolute right-1 top-1 z-20 border border-textColor bg-bgColor px-1.5 leading-none opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100'
                  >
                    ✕
                  </Button>
                )}
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
        title='delete model'
        confirmLabel='delete'
        cancelLabel='cancel'
      >
        <Text>delete “{pendingDelete?.name}”? this cannot be undone.</Text>
      </ConfirmationModal>
    </div>
  );
}
