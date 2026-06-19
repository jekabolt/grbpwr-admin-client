import { genderOptions } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { useAllModels, useDeleteModel } from './useModelQuery';

const ALL = 'ALL';

function genderLabel(gender?: string) {
  if (!gender || gender === 'GENDER_ENUM_UNKNOWN') return '—';
  return genderOptions.find((g) => g.value === gender)?.label ?? '—';
}

export function ModelCardList() {
  const navigate = useNavigate();
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const deleteModel = useDeleteModel();
  const { data: models, isLoading } = useAllModels();

  const [gender, setGender] = useState<string>(ALL);
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const sizeName = (sizeId?: number) => {
    if (!sizeId) return '—';
    return dictionary?.sizes?.find((s) => s.id === sizeId)?.name ?? `#${sizeId}`;
  };

  const filtered = useMemo(() => {
    const q = name.trim().toLowerCase();
    return (models ?? []).filter((m) => {
      if (gender !== ALL && m.model?.gender !== gender) return false;
      if (q && !(m.model?.name ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [models, gender, name]);

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
          {filtered.length} of {models?.length ?? 0}
        </Text>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading models…
          </Text>
        </div>
      ) : filtered.length === 0 ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='uppercase'>
            no models
          </Text>
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'>
          {filtered.map((model) => {
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
                    {genderLabel(insert?.gender)} · sample {sizeName(insert?.defaultSampleSizeId)} ·{' '}
                    {insert?.measurements?.length ?? 0} meas.
                  </Text>
                </div>
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
              </div>
            );
          })}
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
