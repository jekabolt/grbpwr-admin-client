import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import { useUploadMedia } from '../utils/useUploadMedia';
import { MediaExpander } from './expander';

/**
 * ОБРАТНЫЙ КРОП снимка, который УЖЕ лежит в бакете, — брат `MediaRecropDialog` и открывается из
 * того же просмотрщика соседней дверью.
 *
 * ПОЧЕМУ ЗДЕСЬ НЕТ ПРЕДЗАГРУЗКИ БЛОБОМ, а у кроп-диалога есть. Кроппер показывает картинку
 * тегом `<img>` и лезет к пикселям только в момент сохранения, поэтому ему выгодно заранее
 * подменить адрес блобом. Здесь пиксели нужны СРАЗУ — ими живёт пипетка, — и `MediaExpander`
 * тянет их сам через `urlToDataUrl`, то есть через тот же прокси. Две загрузки одного и того же
 * файла были бы лишним трафиком, а отказ бакета всё равно приезжает красной коробкой на сцене.
 */
export function MediaExpandDialog({
  media,
  open,
  onOpenChange,
}: {
  media: common_MediaFull | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const uploadMedia = useUploadMedia();
  const { showMessage } = useSnackBarStore();

  const original = media?.media?.fullSize?.mediaUrl || media?.media?.thumbnail?.mediaUrl;

  const handleSave = async (expandedDataUrl: string) => {
    setBusy(true);
    try {
      await uploadMedia.mutateAsync(expandedDataUrl);
      showMessage('expanded copy uploaded', 'success');
      onOpenChange(false);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'the upload failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!media) return null;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => undefined}
      title={`expand ${media.id}`}
      width='lg'
      hideActions
    >
      <div className='space-y-2.5'>
        <Text variant='label' component='p'>
          The reverse of a crop: the frame grows and the new area is filled with a colour. The
          source stays in the bucket untouched — expanding puts a NEW object with a new id beside
          it.
        </Text>
        <MediaExpander
          selectedFile={open ? original : undefined}
          busy={busy}
          hideHeader
          saveExpandedImage={handleSave}
          onCancel={() => onOpenChange(false)}
        />
      </div>
    </ConfirmationModal>
  );
}
