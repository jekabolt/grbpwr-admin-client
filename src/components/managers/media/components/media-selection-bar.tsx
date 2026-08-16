import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
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
  onClear,
}: {
  selected: common_MediaFull[];
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BulkDeleteResult | undefined>(undefined);
  const deleteMany = useDeleteManyMedia();
  const { showMessage } = useSnackBarStore();

  if (!selected.length && !result) return null;

  const ids = selected.map((m) => m.id).filter((id): id is number => id != null);

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
        title={`delete ${selected.length} from the library`}
        confirmLabel={deleteMany.isPending ? 'deleting…' : 'delete for good'}
        confirmDisabled={deleteMany.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='space-y-2.5'>
          <Text component='p'>
            The files leave the bucket for good, and there will be nothing to bring them back with.
          </Text>
          <Text variant='label' component='p'>
            The bucket will not give up an image that is live on the storefront: those stay where
            they are, and after the deletion you will see which ones and why.
          </Text>
          <Text size='micro' variant='label' component='p' className='tabular-nums'>
            {ids.join(', ')}
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}
