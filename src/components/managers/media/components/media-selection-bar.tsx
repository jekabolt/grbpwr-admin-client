import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button, CalloutBox, ConfirmationModal, GroupLabel, Text } from 'ui';
import { MediaUsageMap, isMediaInUse } from '../utils/media-usage';
import { BulkDeleteResult, useDeleteManyMedia } from '../utils/useMediaQuery';
import { KeptRow, splitForDelete } from './media-delete-sheet';

/**
 * Полоса групповых действий над выбранными снимками.
 *
 * Раньше страница библиотеки монтировалась с `disabled`, то есть выбор на ней был мёртв
 * физически: удалять приходилось по одному, наводя мышь на плитку и попадая в шестнадцать
 * пикселей крестика. Чистка библиотеки после съёмки — сотня файлов — этим способом занимает
 * столько времени, что её не делают вовсе.
 */
export function MediaSelectionBar({
  selected,
  usage,
  onClear,
}: {
  selected: common_MediaFull[];
  /** Где стоят выбранные кадры. Пустая карта — просто ничего ещё не известно. */
  usage: MediaUsageMap;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BulkDeleteResult | undefined>(undefined);
  const deleteMany = useDeleteManyMedia();
  const { showMessage } = useSnackBarStore();

  if (!selected.length && !result) return null;

  // ТОЛЬКО ТОЧНО СВОБОДНЫЕ УХОДЯТ НА УДАЛЕНИЕ. Занятые и невыясненные остаются: сервер теперь
  // сам отказывает в удалении занятого (FailedPrecondition), а «не проверено» — не «свободно».
  const { free, kept } = splitForDelete(selected, usage);
  const freeIds = free.map((m) => m.id).filter((id): id is number => id != null);
  const busy = selected.filter((m) => isMediaInUse(usage, m.id));

  const handleCopyUrls = () => {
    const urls = selected
      .map((m) => m.media?.fullSize?.mediaUrl || m.media?.thumbnail?.mediaUrl)
      .filter(Boolean)
      .join('\n');
    navigator.clipboard?.writeText(urls);
    showMessage(`copied ${selected.length} urls`, 'success');
  };

  const handleDelete = () => {
    if (!freeIds.length) return;
    deleteMany.mutate(freeIds, {
      onSuccess: (res) => {
        setResult(res);
        setConfirming(false);
        // Отказы остаются на экране плашкой, а не тостом: разбирать их человек будет глазами,
        // сверяя со списком карточек, где эти снимки стоят.
        if (!res.failed.length) {
          showMessage(`deleted ${res.deleted.length}`, 'success');
          setResult(undefined);
        }
        onClear();
      },
    });
  };

  return (
    <>
      {result && result.failed.length > 0 && (
        <CalloutBox tone='error' className='mt-2.5'>
          <Text component='span' className='block'>
            {result.deleted.length} deleted · {result.failed.length} kept
          </Text>
          <ul className='mt-1.5 space-y-0.5'>
            {result.failed.map((f) => (
              <li key={f.id}>
                <Text size='micro' component='span' className='tabular-nums'>
                  {f.id}
                </Text>
                <Text size='micro' variant='label' component='span'>
                  {' '}
                  {f.reason}
                </Text>
              </li>
            ))}
          </ul>
          <Button size='sm' className='mt-2' onClick={() => setResult(undefined)}>
            got it
          </Button>
        </CalloutBox>
      )}

      {selected.length > 0 && (
        <div className='sticky bottom-0 z-[var(--z-sticky)] mt-2.5 flex flex-wrap items-center gap-2.5 bg-textColor px-2.5 py-1.5 text-bgColor'>
          <Text component='span' className='tabular-nums'>
            {selected.length} selected
          </Text>
          {/* Сколько из набранного удалить нельзя — видно ДО открытия диалога: иначе человек
              жмёт «delete selected», чтобы выяснить, что удалять почти нечего. */}
          {busy.length > 0 && (
            <Text component='span' className='tabular-nums opacity-70'>
              {busy.length} in use
            </Text>
          )}
          <div className='ml-auto flex flex-wrap items-center gap-2'>
            <Button size='sm' variant='simpleReverse' onClick={handleCopyUrls}>
              copy urls
            </Button>
            <Button size='sm' variant='simpleReverse' onClick={() => setConfirming(true)}>
              delete selected
            </Button>
            <Button size='sm' variant='simpleReverse' onClick={onClear}>
              clear selection
            </Button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={handleDelete}
        title={`delete ${freeIds.length} of ${selected.length}`}
        confirmLabel={
          deleteMany.isPending
            ? 'deleting…'
            : freeIds.length
              ? `delete ${freeIds.length}`
              : '0 free'
        }
        confirmDisabled={deleteMany.isPending || !freeIds.length}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='space-y-2.5'>
          {freeIds.length > 0 && (
            <div>
              <GroupLabel flush>free · deleted · {freeIds.length}</GroupLabel>
              <Text size='micro' component='p' className='tabular-nums'>
                {freeIds.join(', ')}
              </Text>
            </div>
          )}
          {kept.length > 0 && (
            <div className='border border-error'>
              <div className='flex justify-between px-2 py-1.5 text-micro uppercase tracking-label text-error'>
                <span>in use · kept</span>
                <span className='tabular-nums'>{kept.length}</span>
              </div>
              <ul>
                {kept.map((m) => (
                  <KeptRow key={m.id} media={m} usage={usage} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </ConfirmationModal>
    </>
  );
}
