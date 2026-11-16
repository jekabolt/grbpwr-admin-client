import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { genderOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { notify } from 'lib/stores/store';
import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Close,
  ConfirmationModal,
  Input,
  Pill,
  Placeholder,
  Select,
  Text,
  Tile,
  Tiles,
} from 'ui';
import { ModelCardMannequinPreviewWithSavedPoseV1 } from './model-card-mannequin-preview-v1';
import { resolveModelCardListIdentitiesV1 } from './model-card-list-identity-v1';
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
  const deleteModel = useDeleteModel();
  const canEdit = usePermissions().canWrite(SECTION.models);

  const [gender, setGender] = useState<string>(ALL);
  const [name, setName] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [activePreviewModelId, setActivePreviewModelId] = useState<number | null>(null);

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

  const models = useMemo(() => data?.pages.flatMap((page) => page.models) ?? [], [data?.pages]);
  const modelIdentities = useMemo(() => resolveModelCardListIdentitiesV1(models), [models]);
  const total = data?.pages[0]?.total ?? models.length;

  useEffect(() => {
    setActivePreviewModelId(null);
  }, [debouncedName, gender]);

  useEffect(() => {
    if (
      activePreviewModelId !== null &&
      !modelIdentities.some(({ id }) => id === activePreviewModelId)
    ) {
      setActivePreviewModelId(null);
    }
  }, [activePreviewModelId, modelIdentities]);

  const sizesLabel = (ids?: number[]) => {
    if (!ids?.length) return '—';
    return ids
      .map((id) => dictionary?.sizes?.find((s) => s.id === id)?.name ?? `#${id}`)
      .join(', ');
  };

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    // The tile leaving the list is the receipt.
    deleteModel.mutate(id, {
      onError: (e) =>
        notify({
          sev: 'error',
          subject: `MODEL ${id}`,
          text: 'not deleted',
          detail: e instanceof Error ? e.message : undefined,
        }),
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
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
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
        <Tiles min={160}>
          {models.map((m, index) => {
            const identity = modelIdentities[index];
            const id = identity.id;
            const insert = m.model;
            const thumb = m.media?.[0]?.media?.thumbnail?.mediaUrl || '';
            const label = insert?.name || (id === null ? 'model with invalid id' : `model #${id}`);
            const showing3d = id !== null && activePreviewModelId === id;
            const idIssueLabel =
              identity.status === 'duplicate' ? 'duplicate model ID' : 'invalid model ID';
            const meta = [
              genderLabel(insert?.gender),
              `sizes ${sizesLabel(insert?.defaultSizeIds)}`,
              `${insert?.measurements?.length ?? 0} meas.`,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div
                key={identity.key}
                className='relative'
                data-testid='model-card-list-item'
                data-model-card-id-status={identity.status}
                data-model-id={identity.rawId}
              >
                <Tile
                  media={
                    showing3d ? (
                      <ModelCardMannequinPreviewWithSavedPoseV1 model={m} label={label} />
                    ) : thumb ? (
                      <img
                        src={thumb}
                        alt=''
                        loading='lazy'
                        className='aspect-[3/4] w-full border border-borderColor object-cover'
                      />
                    ) : (
                      <Placeholder aspect='3/4' label='model' />
                    )
                  }
                  name={label}
                  onClick={id === null ? undefined : () => navigate(`/models/${id}`)}
                  className='h-full w-full'
                >
                  <div className='mt-1 flex flex-wrap items-center gap-1'>
                    <Pill tone={id === null ? 'warn' : 'mut'}>
                      {id === null ? idIssueLabel : `#${id}`}
                    </Pill>
                  </div>
                  {meta && (
                    <Text size='nano' variant='label' className='mt-1 truncate uppercase'>
                      {meta}
                    </Text>
                  )}
                </Tile>
                <div className='absolute top-2 left-2 z-10'>
                  <Button
                    type='button'
                    variant='simpleReverseWithBorder'
                    size='xs'
                    aria-label={
                      id === null
                        ? `mannequin unavailable for ${label}: ${idIssueLabel}`
                        : `mannequin preview for ${label}`
                    }
                    aria-pressed={showing3d}
                    disabled={id === null}
                    data-testid={
                      id === null
                        ? `model-card-mannequin-toggle-${identity.status}-${index}`
                        : `model-card-mannequin-toggle-${id}`
                    }
                    className='flex min-h-11 min-w-11 items-center justify-center bg-bgColor'
                    onClick={() => {
                      if (id !== null) setActivePreviewModelId(showing3d ? null : id);
                    }}
                  >
                    {showing3d ? 'photo' : 'mannequin'}
                  </Button>
                </div>
                {canEdit && id !== null && (
                  <div className='absolute top-1 right-1'>
                    <Close
                      size='sm'
                      aria-label='delete model'
                      className='bg-bgColor'
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                        setPendingDelete({ id, name: insert?.name || `model ${id}` });
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </Tiles>
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
