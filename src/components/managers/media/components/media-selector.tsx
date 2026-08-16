import * as DialogPrimitive from '@radix-ui/react-dialog';
import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useCallback, useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { MediaManager } from '..';
import { matchesSlotRatio, readSlotAspect } from '../utils/calculate-aspect';
import { usePasteFiles } from '../utils/usePasteFiles';
import { useUploadMedia } from '../utils/useUploadMedia';
import { MediaCropper } from './cropper';
import { MediaIntakeDialog } from './media-intake-dialog';

interface MediaSelectorProps {
  label: string;
  /** What this media is for (e.g. "landscape", "thumbnail") — shown in the dialog header. */
  purpose?: string;
  aspectRatio?: string[];
  allowMultiple?: boolean;
  showVideos?: boolean;
  isDeleteAccepted?: boolean;
  triggerClassName?: string;
  /** Custom trigger element (rendered through Radix `asChild`) in place of the default button —
   *  lets a caller demote the library to a quiet "browse all…" beside an inline add strip. */
  trigger?: React.ReactNode;
  saveSelectedMedia: (media: common_MediaFull[]) => void;
}

export function MediaSelector({
  label,
  purpose,
  aspectRatio,
  allowMultiple = true,
  showVideos = true,
  isDeleteAccepted = false,
  triggerClassName,
  trigger,
  saveSelectedMedia,
}: MediaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<common_MediaFull[]>([]);
  const [dialogKey, setDialogKey] = useState(0);

  // Crop-on-select state (slots with a fixed ratio).
  const [cropMedia, setCropMedia] = useState<common_MediaFull | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropBlobUrl, setCropBlobUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  /** Файлы, вставленные ⌘V прямо в диалоге. Непусто — открыта приёмная модалка. */
  const [pasted, setPasted] = useState<File[]>([]);

  const uploadMedia = useUploadMedia();

  // A slot has a fixed ratio when it lists concrete ratios and no "Custom" (free-form) option.
  const slot = readSlotAspect(aspectRatio);
  const ratioConstrained = slot.constrained;
  const cropAspect = slot.primary;
  // Add one item per click (so each can be ratio-checked) when the slot is ratio-constrained.
  const oneAtATime = ratioConstrained;

  const matchesRatio = (m: common_MediaFull) => {
    const dim = m.media?.fullSize ?? m.media?.thumbnail;
    return matchesSlotRatio(dim?.width, dim?.height, slot.ratios);
  };

  useEffect(() => {
    return () => {
      if (cropBlobUrl) URL.revokeObjectURL(cropBlobUrl);
    };
  }, [cropBlobUrl]);

  const exitCrop = useCallback(() => {
    setCropMedia(null);
    setCropSrc(null);
    setCropBlobUrl(null);
  }, []);

  const closeAndReset = useCallback(() => {
    setSelectedMedia([]);
    setDialogKey((prev) => prev + 1);
    setOpen(false);
    exitCrop();
  }, [exitCrop]);

  // Add resolved media; keep the dialog open for galleries so more can be added.
  const commitMedia = useCallback(
    (media: common_MediaFull[]) => {
      saveSelectedMedia(media);
      exitCrop();
      if (allowMultiple) {
        setSelectedMedia([]);
        setDialogKey((prev) => prev + 1);
      } else {
        closeAndReset();
      }
    },
    [allowMultiple, saveSelectedMedia, exitCrop, closeAndReset],
  );

  const enterCrop = useCallback((m: common_MediaFull) => {
    const url = m.media?.fullSize?.mediaUrl || m.media?.thumbnail?.mediaUrl || '';
    setCropMedia(m);
    setCropSrc(url);
    fetch(url, { mode: 'cors', credentials: 'omit' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) {
          const obj = URL.createObjectURL(blob);
          setCropBlobUrl(obj);
          setCropSrc(obj);
        }
      })
      .catch(() => {
        /* keep direct url */
      });
  }, []);

  const handleSelectionChange = useCallback(
    (media: common_MediaFull[]) => {
      if (oneAtATime) {
        // MediaManager is single-select here, so media is at most one item.
        if (media.length === 0) return;
        const m = media[0];
        const url = m.media?.fullSize?.mediaUrl || m.media?.thumbnail?.mediaUrl || '';
        // Right ratio (or video) → add as-is; wrong ratio → offer crop/keep.
        if (isVideo(url) || matchesRatio(m)) {
          commitMedia([m]);
        } else {
          enterCrop(m);
        }
        return;
      }

      // Free-form / no ratio: original behavior (single closes, multi batches).
      setSelectedMedia(media);
      if (!allowMultiple && media.length > 0) {
        saveSelectedMedia(media);
        closeAndReset();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oneAtATime, allowMultiple, saveSelectedMedia, closeAndReset, commitMedia, enterCrop],
  );

  // ⌘V ПРЯМО В ДИАЛОГЕ. Скриншот уже в буфере: заставлять сохранять его файлом, чтобы потом
  // искать в библиотеке, — три шага ради картинки, которая в руках. Вставленное проходит ту же
  // приёмную модалку, что и вставка в слот: превью, кроп по соотношению этого слота,
  // подтверждение, — и только потом уходит владельцу тем же путём, что выбранное мышью.
  //
  // Включено, только пока диалог открыт и не в режиме кропа: там ⌘V означал бы вставку поверх
  // кадрируемого снимка, а этого никто не просил.
  usePasteFiles(
    {
      // ОЧЕРЕДЬ ДЕРЖИТСЯ ВСЁ ВРЕМЯ, ПОКА ДИАЛОГ ОТКРЫТ, а принимается вставка только вне кропа и
      // приёмки. Отдать очередь на это время значило бы уронить ⌘V в галерею ПОД диалогом: она
      // осталась «горячей» (появление модалки само по себе не шлёт `pointerleave`), и картинка
      // прикрепилась бы туда мимо кропа, ради которого диалог и открыт.
      claims: open,
      accepts: open && !cropMedia && pasted.length === 0,
      accept: showVideos ? 'media' : 'image',
      // Слот с фиксированным соотношением сторон и одиночный выбор принимают РОВНО ОДНУ картинку.
      // Без предела приёмка провела бы через кроп все из буфера, а прикрепилась бы первая:
      // остальные осели бы в библиотеке файлами, которых никто не просил.
      limit: oneAtATime || !allowMultiple ? 1 : undefined,
    },
    setPasted,
  );

  const handleCropSave = async (croppedDataUrl: string) => {
    setIsUploading(true);
    try {
      const newMedia = await uploadMedia.mutateAsync(croppedDataUrl);
      commitMedia([newMedia]);
    } catch {
      /* error surfaced by the upload hook */
    } finally {
      setIsUploading(false);
    }
  };

  const handleUseOriginal = () => {
    if (cropMedia) commitMedia([cropMedia]);
  };

  const handleSave = () => {
    if (selectedMedia.length > 0) {
      saveSelectedMedia(selectedMedia);
      closeAndReset();
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    setSelectedMedia([]);
    exitCrop();
    if (newOpen) {
      setDialogKey((prev) => prev + 1);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        {trigger ?? (
          <Button
            variant='main'
            size='lg'
            className={triggerClassName ?? 'whitespace-nowrap cursor-pointer'}
          >
            {label}
          </Button>
        )}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-overlay' />
        <DialogPrimitive.Content className='fixed left-[50%] top-[50%] z-50 flex h-[90vh] w-full max-w-6xl translate-x-[-50%] translate-y-[-50%] flex-col border border-textInactiveColor bg-bgColor p-2.5'>
          <div className='flex flex-shrink-0 items-center justify-between'>
            <DialogPrimitive.Title className='text-lg uppercase'>
              {cropMedia ? 'crop' : 'select'} {purpose ? purpose : 'media'}
            </DialogPrimitive.Title>
            <div className='flex items-center gap-3'>
              {!cropMedia && !oneAtATime && allowMultiple && selectedMedia.length > 0 && (
                <Text variant='inactive'>{selectedMedia.length} selected</Text>
              )}
              <DialogPrimitive.Close asChild>
                <Button className='py-1'>[x]</Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          {cropMedia ? (
            <div className='mt-4 flex-1 min-h-0 overflow-y-auto'>
              <MediaCropper
                selectedFile={cropSrc ?? undefined}
                initialAspect={cropAspect}
                lockAspect={ratioConstrained}
                busy={isUploading}
                saveCroppedImage={handleCropSave}
                onUseOriginal={handleUseOriginal}
                onCancel={exitCrop}
              />
            </div>
          ) : (
            <>
              <DialogPrimitive.Description className='mt-1 flex-shrink-0 text-small text-textInactiveColor'>
                {pasted.length > 0
                  ? 'review the pasted media…'
                  : ratioConstrained
                    ? `click an item · target ${aspectRatio?.[0]} — wrong-ratio images can be cropped · ⌘V pastes from the clipboard`
                    : allowMultiple
                      ? 'click items to select, then save · ⌘V pastes from the clipboard'
                      : 'click an item to select it · ⌘V pastes from the clipboard'}
              </DialogPrimitive.Description>

              <div className='mt-4 flex-1 min-h-0 overflow-y-scroll'>
                <MediaManager
                  key={dialogKey}
                  aspectRatio={undefined}
                  allowMultiple={oneAtATime ? false : allowMultiple}
                  disabled={false}
                  showVideos={showVideos}
                  showFilters={false}
                  onSelectionChange={handleSelectionChange}
                  selectionMode={true}
                />
              </div>

              {oneAtATime && allowMultiple && (
                <div className='flex flex-shrink-0 items-center justify-between gap-4 border-t border-textInactiveColor pt-4'>
                  <Text variant='inactive' size='small'>
                    added items appear in the gallery — close when done
                  </Text>
                  <DialogPrimitive.Close asChild>
                    <Button size='lg' variant='main' className='uppercase'>
                      done
                    </Button>
                  </DialogPrimitive.Close>
                </div>
              )}

              {!oneAtATime && allowMultiple && (
                <div className='flex flex-shrink-0 items-center justify-end gap-4 border-t border-textInactiveColor bg-bgColor pt-4'>
                  <DialogPrimitive.Close asChild>
                    <Button size='lg' className='uppercase' variant='simpleReverse'>
                      cancel
                    </Button>
                  </DialogPrimitive.Close>
                  <Button
                    className='uppercase'
                    variant='main'
                    size='lg'
                    onClick={handleSave}
                    disabled={selectedMedia.length === 0}
                  >
                    save ({selectedMedia.length})
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Приёмка вставленного — поверх диалога библиотеки, той же дорогой, что и вставка
              прямо в слот: превью, кроп, подтверждение. */}
          <MediaIntakeDialog
            files={pasted}
            aspect={cropAspect}
            lockAspect={ratioConstrained}
            purpose={purpose}
            onDone={(media) => {
              setPasted([]);
              commitMedia(media);
            }}
            onCancel={() => setPasted([])}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
