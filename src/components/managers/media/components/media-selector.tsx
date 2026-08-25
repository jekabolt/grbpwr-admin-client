import * as DialogPrimitive from '@radix-ui/react-dialog';
import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import Text from 'ui/components/text';
import { MediaManager } from '..';
import { matchesSlotRatio, parseAspect, readSlotAspect } from '../utils/calculate-aspect';
import { mergeQueue } from '../utils/intake-queue';
import { filesOfKind, usePasteFiles } from '../utils/usePasteFiles';
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
  /**
   * Номер текущего захода в кроп. Ответ бакета приходит позже клика, и без сторожа поздний `.then`
   * писал бы кадр отменённого или предыдущего захода: человек отменил кроп и выбрал другой снимок,
   * а в рамке через секунду появляется первый. Блоб создаётся ТОЛЬКО после проверки — иначе
   * протухший объект висел бы до перезагрузки, отозвать его уже некому.
   */
  const cropRequestRef = useRef(0);
  const [isUploading, setIsUploading] = useState(false);
  /** Файлы, вставленные ⌘V прямо в диалоге. Непусто — открыта приёмная модалка. */
  const [pasted, setPasted] = useState<File[]>([]);
  // Живой снимок для замыкания слушателя буфера: вторая вставка обязана складываться с текущей
  // очередью, а не с той, что была на рендере подписки.
  const pastedRef = useRef<File[]>(pasted);
  pastedRef.current = pasted;

  const uploadMedia = useUploadMedia();
  const { showMessage } = useSnackBarStore();

  // A slot has a fixed ratio when it lists concrete ratios and no "Custom" (free-form) option.
  // Разбор ЗАПОМИНАЕТСЯ по самому списку: вызывающие пишут его литералом прямо в JSX, и без
  // этого `targetRatios` был бы новым массивом на каждый рендер — а по нему внутри библиотеки
  // считаются полосы «встанут как есть» / «нужен кроп».
  const aspectKey = (aspectRatio ?? []).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slot = useMemo(() => readSlotAspect(aspectRatio), [aspectKey]);
  const targetRatios = useMemo(
    () => (slot.ratios.length ? slot.ratios : undefined),
    [slot],
  );
  const ratioConstrained = slot.constrained;
  const cropAspect = slot.primary;
  // Add one item per click (so each can be ratio-checked) when the slot is ratio-constrained.
  const oneAtATime = ratioConstrained;
  /** Лоток в подвале: набирают пачкой и ставят разом. */
  const trayMode = !oneAtATime && allowMultiple;
  /**
   * Подпись первого КОНКРЕТНОГО соотношения — та же запись, из которой взят `slot.primary`.
   * Печатать `aspectRatio?.[0]` вслепую нельзя: у списка `['Custom','4:5']` нулевым лежит
   * свободный кроп, и шапка сказала бы «нужно Custom».
   */
  const primaryLabel = (aspectRatio ?? []).find((r) => parseAspect(r) !== undefined);

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
    cropRequestRef.current += 1;
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
    const request = ++cropRequestRef.current;
    const url = m.media?.fullSize?.mediaUrl || m.media?.thumbnail?.mediaUrl || '';
    setCropMedia(m);
    setCropSrc(url);
    // Прежний блоб отзывается эффектом очистки по смене `cropBlobUrl`.
    setCropBlobUrl(null);
    fetch(url, { mode: 'cors', credentials: 'omit' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cropRequestRef.current !== request) return;
        const obj = URL.createObjectURL(blob);
        setCropBlobUrl(obj);
        setCropSrc(obj);
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
  /**
   * ЕДИНСТВЕННЫЕ ВОРОТА ПРИЁМКИ — и предел живёт ровно здесь, на всех трёх дорогах сразу: ⌘V,
   * «выбрать файл…» и бросок в сетку.
   *
   * Слот с фиксированным соотношением и одиночный слот принимают РОВНО ОДНУ картинку. Без предела
   * приёмка проводит через кроп всё принесённое и ЗАГРУЖАЕТ каждое в бакет, а в слот встанет
   * первое: выбрать три файла в обложку товара значило оставить два осиротевших объекта, о
   * которых никто не узнает.
   */
  const takeFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      // Бросок несёт что угодно, а приёмка открывает КРОП: PDF или zip показали бы пустой холст.
      // ⌘V отсеивается самим перехватчиком буфера, у `input` фильтр — только подсказка диалога
      // ОС, поэтому отбор стоит здесь, на общих воротах, и об отброшенном говорится вслух.
      const kind = showVideos ? 'media' : 'image';
      const usable = filesOfKind(files, kind);
      if (!usable.length) {
        showMessage(
          kind === 'media' ? 'images and videos go here' : 'only images go here',
          'error',
        );
        return;
      }
      const limit = oneAtATime || !allowMultiple ? 1 : undefined;
      // ВСТАВКА ДОБАВЛЯЕТ, А НЕ ЗАМЕЩАЕТ — та же развилка, что и у приёмки слота, и живёт она в
      // одном месте на обе дороги. Слот на одну картинку по-прежнему замещает кадр: «вставил не
      // тот скриншот, вставил правильный» — это то, ради чего там жмут ⌘V второй раз.
      const merged = mergeQueue(pastedRef.current, usable, limit);
      if (merged.dropped > 0) {
        const taken = usable.length - merged.dropped;
        showMessage(
          taken > 0
            ? `took ${taken} of ${usable.length} — that is all the room left`
            : `no room left — ${merged.dropped} did not fit`,
          'error',
        );
      }
      setPasted(merged.queue);
    },
    [oneAtATime, allowMultiple, showVideos, showMessage],
  );

  usePasteFiles(
    {
      // ОЧЕРЕДЬ ДЕРЖИТСЯ ВСЁ ВРЕМЯ, ПОКА ДИАЛОГ ОТКРЫТ, а принимается вставка только вне кропа и
      // приёмки. Отдать очередь на это время значило бы уронить ⌘V в галерею ПОД диалогом: она
      // осталась «горячей» (появление модалки само по себе не шлёт `pointerleave`), и картинка
      // прикрепилась бы туда мимо кропа, ради которого диалог и открыт.
      claims: open,
      // Приёмка БОЛЬШЕ НЕ ГЛУШИТ ВСТАВКУ: она копит. Гасится только кроп — там ⌘V означал бы
      // вставку поверх кадрируемого снимка, а этого никто не просил.
      accepts: open && !cropMedia,
      accept: showVideos ? 'media' : 'image',
    },
    takeFiles,
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
        <DialogPrimitive.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <DialogPrimitive.Content className='fixed left-[50%] top-[50%] z-[var(--z-modal)] flex h-[90vh] w-full max-w-6xl translate-x-[-50%] translate-y-[-50%] flex-col border border-textInactiveColor bg-bgColor p-2.5'>
          <div className='flex flex-shrink-0 flex-wrap items-center gap-2'>
            {/* ХЛЕБНЫЕ КРОШКИ ВМЕСТО ПОДМЕНЫ ЗАГОЛОВКА. Кроп не отдельный экран, а второй шаг
                того же выбора: раньше тело диалога подменялось целиком и слово в заголовке
                менялось с «select» на «crop», из-за чего было неясно, куда делась библиотека и
                как в неё вернуться. */}
            {/* Заголовок ДИАЛОГА, а не страницы: 12px жирным прописным, как `SectionHeader`. */}
            <DialogPrimitive.Title asChild>
              <Text component='h2' variant='uppercase' tracking='section' className='font-bold'>
                {purpose ? purpose : 'media'}
              </Text>
            </DialogPrimitive.Title>
            <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
              <span className={cropMedia ? '' : 'font-bold text-textColor'}>select</span>
              {' › '}
              <span className={cropMedia ? 'font-bold text-textColor' : ''}>crop</span>
            </Text>

            {/* ОДНА ПИЛЮЛЯ, И ОНА ГОВОРИТ ПРАВДУ. Требование — это `slot.constrained`, а не
                «в списке есть конкретное соотношение»: список `['4:5','Custom']` конкретное
                содержит, но НИЧЕГО не требует, и шапка показывала обе пилюли разом — «нужно 4:5»
                и «любое соотношение» рядом. */}
            {slot.constrained && primaryLabel && (
              <Pill tone='ink'>
                <span className='flex items-center gap-1'>
                  <RatioGlyph ratio={primaryLabel} size={9} />
                  needs {primaryLabel}
                </span>
              </Pill>
            )}
            {!slot.constrained && slot.hasCustom && (
              <Pill>
                {primaryLabel ? (
                  <span className='flex items-center gap-1'>
                    <RatioGlyph ratio={primaryLabel} size={9} />
                    {primaryLabel} or free
                  </span>
                ) : (
                  'any ratio'
                )}
              </Pill>
            )}

            <div className='ml-auto flex items-center gap-2'>
              <DialogPrimitive.Close asChild>
                <Button className='py-1' aria-label='close'>
                  ×
                </Button>
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
              {/* Это предложение, а не метка: капсом в системе набирают только метку, кнопку и
                  заголовок до четырёх слов. */}
              <DialogPrimitive.Description asChild>
                <Text size='micro' variant='label' component='p' className='mt-1 flex-shrink-0'>
                  {pasted.length > 0
                    ? 'sort out what you pasted'
                    : oneAtATime
                      ? 'a click places the frame at once · a frame of the wrong ratio opens cropping'
                      : allowMultiple
                        ? 'a click fills the tray, “add all” places them in one go'
                        : 'a click places the frame and closes the dialog'}
                </Text>
              </DialogPrimitive.Description>

              <div className='mt-2.5 flex-1 min-h-0 overflow-y-scroll'>
                <MediaManager
                  key={dialogKey}
                  aspectRatio={undefined}
                  targetRatios={targetRatios}
                  // Файл с диска и файл, брошенный в сетку, идут той же дорогой, что и ⌘V:
                  // превью, кроп по пропорции этого слота, подтверждение. В общую очередь
                  // библиотеки они не попадают.
                  onFilesPicked={takeFiles}
                  // НАБОР ЖИВЁТ ЗДЕСЬ, У ЛОТКА. Пока сетка вела свой список, крестик лотка не
                  // говорил ей ничего: следующий выбор возвращал убранный кадр обратно.
                  selected={trayMode ? selectedMedia : undefined}
                  allowMultiple={oneAtATime ? false : allowMultiple}
                  disabled={false}
                  showVideos={showVideos}
                  showFilters
                  onSelectionChange={handleSelectionChange}
                  selectionMode={true}
                />
              </div>

              {/* ЛОТОК ВЫБРАННОГО. Раньше о наборе говорил только счётчик «3 selected»: что
                  именно набрано, приходилось помнить, а убрать лишнее — искать плитку в сетке. */}
              {trayMode && selectedMedia.length > 0 && (
                <div className='mt-2.5 flex flex-shrink-0 flex-wrap items-center gap-1.5 border-t border-hairline pt-2'>
                  <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
                    in the tray {selectedMedia.length}
                  </Text>
                  {selectedMedia.map((m) => (
                    <span key={m.id} className='relative'>
                      <img
                        src={m.media?.thumbnail?.mediaUrl}
                        alt=''
                        className='size-10 border border-borderColor bg-bgZebra object-cover'
                      />
                      <button
                        type='button'
                        aria-label={`remove ${m.id} from the tray`}
                        // Снимается ЗДЕСЬ, и сетка узнаёт об этом сразу: набор у неё тот же самый.
                        onClick={() =>
                          setSelectedMedia((prev) => prev.filter((x) => x.id !== m.id))
                        }
                        className='absolute -right-1 -top-1 flex size-4 items-center justify-center border border-borderColor bg-bgColor text-nano leading-none hover:bg-textColor hover:text-bgColor'
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {oneAtATime && allowMultiple && (
                // ЛИНЕЙКА ВНУТРИ КОРОБКИ — `hairline`. `borderColor` держит ВНЕШНИЙ контур
                // диалога, и подвал, отбитый им же, читался как второй бокс внутри первого.
                <div className='flex flex-shrink-0 items-center justify-between gap-4 border-t border-hairline pt-2.5'>
                  <Text variant='label' size='small'>
                    every addition goes straight to the gallery, close when you have enough
                  </Text>
                  <DialogPrimitive.Close asChild>
                    <Button size='lg' variant='main' className='uppercase'>
                      done
                    </Button>
                  </DialogPrimitive.Close>
                </div>
              )}

              {trayMode && (
                <div className='flex flex-shrink-0 items-center justify-end gap-4 border-t border-hairline bg-bgColor pt-2.5'>
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
                    add all ({selectedMedia.length})
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
            // Очередью правит сама приёмка: пачка может доехать наполовину, и отказавшееся
            // остаётся в ней с причиной. Гасить очередь здесь значило бы выбрасывать то, что
            // человек ещё может повторить.
            onQueueChange={setPasted}
            onDone={commitMedia}
            onCancel={() => setPasted([])}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
