import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import {
  MediaUsageMap,
  isMediaInUse,
  mediaUsageRefs,
  usageRefName,
  usageRefSlot,
} from '../utils/media-usage';
import { BulkDeleteResult, useDeleteManyMedia } from '../utils/useMediaQuery';

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

  const ids = selected.map((m) => m.id).filter((id): id is number => id != null);

  // РАЗБОР ДО ПОПЫТКИ, А НЕ ПОСЛЕ — но именно РАЗБОР, а не отсев: удаляется по-прежнему весь
  // набор. Занятость не предсказывает исход, потому что из семнадцати ссылок на медиа пять
  // объявлены ON DELETE SET NULL (свотчи колорвея и лаб-дипа, картинка материала, выноски
  // тех-карты и примерки) — там удаление ПРОЙДЁТ, обнулив указатель. Выкидывать занятые из
  // пачки значило бы навсегда запретить чистку именно этих, служебных файлов.
  //
  // ТРИ ГРУППЫ, А НЕ ДВЕ. «Не выяснено» — не «свободно»: если корзина занятости не доехала или
  // ответила ошибкой, назвать такой набор свободным было бы тем же враньём, от которого карта
  // отличает отсутствие ключа от пустого списка.
  const busy = selected.filter((m) => isMediaInUse(usage, m.id));
  const knownFreeIds = ids.filter((id) => mediaUsageRefs(usage, id)?.length === 0);
  const uncheckedIds = ids.filter((id) => mediaUsageRefs(usage, id) === undefined);

  const handleCopyUrls = () => {
    const urls = selected
      .map((m) => m.media?.fullSize?.mediaUrl || m.media?.thumbnail?.mediaUrl)
      .filter(Boolean)
      .join('\n');
    navigator.clipboard?.writeText(urls);
    showMessage(`copied ${selected.length} urls`, 'success');
  };

  const handleDelete = () => {
    deleteMany.mutate(ids, {
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
            {result.deleted.length} deleted, the bucket refused {result.failed.length}. A refusal
            almost always means one thing: the image is live on the storefront and something links
            to it.
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
        title={`delete ${ids.length} from the library`}
        confirmLabel={deleteMany.isPending ? 'deleting…' : 'delete for good'}
        confirmDisabled={deleteMany.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        {/* ПОДТВЕРЖДЕНИЕ НАЗЫВАЕТ, ЧТО СЛОМАЕТСЯ. Раньше здесь стоял голый список id и обещание,
            что причины отказов будут названы ПОСЛЕ удаления. Уходит по-прежнему весь набор —
            занятость не предсказывает исход, — но теперь до нажатия видно, какие кадры где
            стоят, а какие вообще не проверены. */}
        <div className='space-y-2.5'>
          <Text component='p'>
            The files leave the bucket for good, and there will be nothing to bring them back with.
          </Text>

          {busy.length > 0 && (
            <div>
              <GroupLabel flush>in use · {busy.length}</GroupLabel>
              <ul className='space-y-1'>
                {busy.map((m) => (
                  <li key={m.id}>
                    <Text size='micro' component='span' className='tabular-nums'>
                      {m.id}
                    </Text>
                    <ul className='pl-3'>
                      {mediaUsageRefs(usage, m.id)?.map((ref, i) => (
                        <li key={`${ref.kind}-${ref.entityId}-${ref.slot}-${i}`}>
                          <Text size='micro' component='span'>
                            {usageRefName(ref)}
                          </Text>{' '}
                          <Text size='micro' variant='label' component='span'>
                            {usageRefSlot(ref)}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <Text variant='label' component='p' className='mt-1'>
                The bucket refuses most of these. Where it does not, the picture leaves the places
                above and they are left without one.
              </Text>
            </div>
          )}

          {knownFreeIds.length > 0 && (
            <div>
              <GroupLabel flush={busy.length === 0}>free · {knownFreeIds.length}</GroupLabel>
              {/* Чернилами, а не серым: это тот самый список, который сейчас исчезнет без следа. */}
              <Text size='micro' component='p' className='tabular-nums'>
                {knownFreeIds.join(', ')}
              </Text>
            </div>
          )}

          {uncheckedIds.length > 0 && (
            <div>
              {/* НЕ ПРОВЕРЕНО — СВОЯ ГРУППА, А НЕ ДОБАВКА К СВОБОДНЫМ. Записать их в «free»
                  значило бы утверждать то, чего никто не спрашивал: корзина занятости могла не
                  доехать или ответить ошибкой. */}
              <GroupLabel>not checked · {uncheckedIds.length}</GroupLabel>
              <Text size='micro' component='p' className='tabular-nums'>
                {uncheckedIds.join(', ')}
              </Text>
              <Text variant='label' component='p' className='mt-1'>
                Where these stand was not looked up, so they go in unexamined.
              </Text>
            </div>
          )}

          <Text variant='label' component='p'>
            A file linked up since this list was checked will be refused by the bucket, and you
            will see it named afterwards.
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}
