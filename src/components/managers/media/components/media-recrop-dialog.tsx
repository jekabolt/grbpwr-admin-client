import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { useUploadMedia } from '../utils/useUploadMedia';
import { MediaCropper } from './cropper';

/**
 * Кадрирование снимка, который УЖЕ лежит в бакете.
 *
 * Раньше это жило в диалоге `PreviewMedia`, и жило плохо: кадрировать предлагалось МИНИАТЮРУ
 * (`handleViewMedia` брал `thumbnail.mediaUrl`, то есть 480 пикселей по длинной стороне), а
 * кнопка «upload» стояла заблокированной с подсказкой «Crop the image first to save it as new
 * media» — единственное место во всём приложении, где было сказано, что получится НОВЫЙ объект.
 * Здесь берётся оригинал, а про новый файл написано на самом видном месте.
 */
export function MediaRecropDialog({
  media,
  open,
  onOpenChange,
}: {
  media: common_MediaFull | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [source, setSource] = useState<string | undefined>(undefined);
  const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const uploadMedia = useUploadMedia();
  const { showMessage } = useSnackBarStore();

  const original = media?.media?.fullSize?.mediaUrl || media?.media?.thumbnail?.mediaUrl;

  // Холст рисует на canvas, а `canvas.toDataURL` на чужом источнике падает на CORS. Картинка
  // сначала тянется блобом; если бакет не отдал заголовки, остаётся прямой адрес, и тогда
  // ошибка придёт при сохранении, а не молча.
  useEffect(() => {
    if (!open || !original) return;
    let cancelled = false;
    setSource(original);
    fetch(original, { mode: 'cors', credentials: 'omit' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setSource(url);
      })
      .catch(() => {
        /* остаётся прямой адрес */
      });
    return () => {
      cancelled = true;
    };
  }, [open, original]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleSave = async (croppedDataUrl: string) => {
    setBusy(true);
    try {
      await uploadMedia.mutateAsync(croppedDataUrl);
      showMessage('cropped copy uploaded', 'success');
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
      title={`crop ${media.id}`}
      width='lg'
      hideActions
    >
      <div className='space-y-2.5'>
        <Text variant='label' component='p'>
          The source stays in the bucket untouched: cropping puts a NEW object with a new id beside
          it. Three tries at finding the frame leave three files in the library.
        </Text>
        <MediaCropper
          selectedFile={source}
          busy={busy}
          hideHeader
          saveLabel='create cropped copy'
          saveCroppedImage={handleSave}
          onCancel={() => onOpenChange(false)}
        />
      </div>
    </ConfirmationModal>
  );
}
