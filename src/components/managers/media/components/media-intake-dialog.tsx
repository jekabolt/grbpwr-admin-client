import * as DialogPrimitive from '@radix-ui/react-dialog';
import { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { isVideoFile } from '../utils/usePasteFiles';
import { useUploadMedia } from '../utils/useUploadMedia';
import { MediaCropper } from './cropper';

// ПРИЁМНАЯ МОДАЛКА — ЕДИНСТВЕННЫЙ ПУТЬ, КОТОРЫМ ФАЙЛ ИЗВНЕ ПОПАДАЕТ В СЛОТ.
//
// Вставленное по ⌘V и брошенное на слот раньше уезжало в библиотеку МОЛЧА: человек видел результат
// уже прикреплённым, и если в буфере оказался не тот скриншот — файл всё равно лежал в общей
// библиотеке, а слот приходилось чистить руками. Между «пришло» и «легло» нужен один экран:
// посмотреть, что это, обрезать и подтвердить.
//
// ЗАГРУЗКА ПРОИСХОДИТ ЗДЕСЬ, а не в вызывающем. Слот получает готовое `common_MediaFull` — ровно
// то же, что отдаёт выбор из библиотеки, — поэтому у него один-единственный обработчик «положить
// медиа», а не три разных на клик, вставку и бросок.
//
// ОЧЕРЕДЬ, А НЕ ОДИН ФАЙЛ. В буфере и в броске законно приходит несколько картинок, а кроп — жест
// над ОДНОЙ. Файлы проходят по очереди, счётчик виден в заголовке; галерея так наполняется одним
// ⌘V, а слот на одну картинку получает `limit: 1` и очереди не видит вовсе.
//
// ВИДЕО НЕ КАДРИРУЕТСЯ. Кроп видео — это перекодирование, которого в браузере здесь нет и не
// планировалось. Для ролика экран показывает проигрыватель и одну кнопку: загрузить как есть.

export type MediaIntakeDialogProps = {
  /** Очередь принятых извне файлов. Пустая — модалки нет. */
  files: File[];
  /** Соотношение, с которым открывается кроп. */
  aspect?: number;
  /** Соотношение обязательно: сетка кропа сводится к одной кнопке. */
  lockAspect?: boolean;
  /** Куда это ляжет — в заголовок («thumbnail», «moodboard reference»). */
  purpose?: string;
  /** Готовое медиа, в том же виде, в каком его отдаёт выбор из библиотеки. */
  onDone: (media: common_MediaFull[]) => void;
  /** Закрыли, ничего не приняв (или бросили остаток очереди). */
  onCancel: () => void;
};

export function MediaIntakeDialog({
  files,
  aspect,
  lockAspect = false,
  purpose,
  onDone,
  onCancel,
}: MediaIntakeDialogProps) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const uploadMedia = useUploadMedia();
  // Принятое копится здесь, а не отдаётся по одному: владелец слота на каждый вызов делает
  // `append`/`setValue`, и три отдельных вызова из одной вставки прошли бы тремя правками формы —
  // с тремя записями в историю и тремя перерисовками списка.
  const acceptedRef = useRef<common_MediaFull[]>([]);

  const open = files.length > 0;
  const current: File | undefined = files[index];
  const video = current ? isVideoFile(current) : false;

  // Адрес живёт ровно столько, сколько показывается файл. Освобождать его позже (в размонтировании
  // всей модалки) значило бы держать в памяти каждый кадр очереди из десяти роликов сразу.
  const src = useMemo(() => (current ? URL.createObjectURL(current) : ''), [current]);
  useEffect(() => {
    if (!src) return;
    return () => URL.revokeObjectURL(src);
  }, [src]);

  // Новая вставка приходит новым массивом — очередь начинается сначала. Без сброса вторая вставка
  // открылась бы на позиции, оставшейся от первой, и показала бы пустой экран.
  useEffect(() => {
    setIndex(0);
    acceptedRef.current = [];
  }, [files]);

  function finish() {
    const accepted = acceptedRef.current;
    acceptedRef.current = [];
    setIndex(0);
    if (accepted.length) onDone(accepted);
    else onCancel();
  }

  /** Следующий файл очереди; кончилась — отдать всё принятое владельцу. */
  function advance() {
    if (index + 1 < files.length) setIndex(index + 1);
    else finish();
  }

  async function accept(input: File | string) {
    setBusy(true);
    try {
      acceptedRef.current = [...acceptedRef.current, await uploadMedia.mutateAsync(input)];
      advance();
    } catch {
      // Сообщение уже показал useUploadMedia. Остаёмся на этом файле: перейти дальше значило бы
      // молча проглотить отказ — человек увидел бы «готово» на том, что не загрузилось.
    } finally {
      setBusy(false);
    }
  }

  // Закрытие крестиком/Esc не отменяет уже загруженное: файл лежит в библиотеке, и не положить его
  // в слот значило бы потерять то, за что уже заплачено загрузкой.
  function handleOpenChange(next: boolean) {
    if (next || busy) return;
    finish();
  }

  if (!open || !current) return null;

  const counter = files.length > 1 ? ` · ${index + 1} of ${files.length}` : '';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-[60] bg-overlay' />
        {/* Фокус УВОДИТСЯ СЮДА по умолчанию Radix. Задержать его снаружи (как просилось: вставка
            всё равно ловится на document) значило бы оставить окно без клавиатуры — родительский
            диалог выбора медиа держит свою ловушку фокуса, и до кнопок этой модалки Tab бы не
            дошёл. */}
        <DialogPrimitive.Content className='fixed left-1/2 top-1/2 z-[60] flex max-h-[90vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-textInactiveColor bg-bgColor p-2.5'>
          <div className='flex flex-shrink-0 items-center justify-between border-b border-textInactiveColor pb-2'>
            <DialogPrimitive.Title className='text-lg uppercase'>
              {video ? 'add video' : 'crop & add'}
              {purpose ? ` ${purpose}` : ''}
              {counter}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button className='cursor-pointer py-1' disabled={busy}>
                [x]
              </Button>
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Description className='sr-only'>
            {current.name || 'pasted media'}
          </DialogPrimitive.Description>

          <div className='mt-3 flex-1 min-h-0 overflow-y-auto'>
            {video ? (
              <div className='flex flex-col gap-4'>
                <video
                  src={src}
                  controls
                  playsInline
                  className='max-h-[55vh] w-full bg-textColor/5 object-contain'
                />
                <div className='flex flex-wrap items-center justify-between gap-2 border-t border-textInactiveColor pt-3'>
                  <Text variant='label' size='small'>
                    video is uploaded as-is — cropping is a re-encode the browser can't do
                  </Text>
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      variant='secondary'
                      size='lg'
                      className='cursor-pointer uppercase'
                      onClick={advance}
                      disabled={busy}
                    >
                      skip
                    </Button>
                    <Button
                      type='button'
                      variant='main'
                      size='lg'
                      className='cursor-pointer uppercase'
                      onClick={() => accept(current)}
                      disabled={busy}
                      loading={busy}
                    >
                      upload
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <MediaCropper
                key={src}
                hideHeader
                selectedFile={src}
                initialAspect={aspect}
                lockAspect={lockAspect}
                outputFormat={current.type || undefined}
                busy={busy}
                saveLabel='crop & add'
                originalLabel='add without crop'
                saveCroppedImage={(dataUrl) => void accept(dataUrl)}
                onUseOriginal={() => void accept(current)}
                onCancel={advance}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
