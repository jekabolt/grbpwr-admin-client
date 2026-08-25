import * as DialogPrimitive from '@radix-ui/react-dialog';
import { common_MediaFull } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { formatBytes, usePendingFiles, type PreviewItem } from '../utils/usePendingFiles';
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
// ── ЧТО ЗДЕСЬ ПОМЕНЯЛОСЬ И ПОЧЕМУ ───────────────────────────────────────────────────────────
//
// Был КОНВЕЙЕР ПО ОДНОМУ ФАЙЛУ: очередь листалась по индексу, каждый кадр грузился прямо в
// модалке, и всё это время окно держало экран — закрыть его во время отправки было нельзя. Второй
// ⌘V в такое окно не проходил вовсе: приёмник гасился, пока модалка открыта.
//
// Стало НАКОПИТЕЛЕМ: сетка миниатюр, кадрирование рядом с ней, одна кнопка на всю пачку. Копить
// можно и за один жест, и за несколько — вторая вставка ДОБАВЛЯЕТ кадр, а не замещает первый.
// После нажатия «upload all» окно сворачивается в пилюлю внизу экрана, и страница снова живая:
// пачка уходит фоном, а форму под ней можно продолжать заполнять.
//
// ОЧЕРЕДЬЮ ВЛАДЕЕТ `usePendingFiles` — тот же движок, что и у полосы загрузки в библиотеке.
// Писать вторую машинерию отправки значило бы завести второе место, где отказ на одном файле
// роняет пачку, а пределы бакета проверяются после отправки, а не до.
//
// ПОЧЕМУ НЕ СВОРАЧИВАЕТСЯ В САМ НИЖНИЙ ЛОТОК БИБЛИОТЕКИ. Лоток внешне делает то же самое, но
// доставляет файлы В БИБЛИОТЕКУ, а приёмка слота обязана донести `common_MediaFull[]` до колбэка
// ЖИВОЙ ФОРМЫ; такого канала у лотка нет. Вдобавок лоток прибит к `--z-dock` (осознанно НИЖЕ
// модалок), а приёмка законно открывается ПОВЕРХ чужого диалога — свернувшись «туда», очередь
// ушла бы под оверлей ровно в тот момент, когда её надо видеть. Поэтому пилюля своя, но того же
// языка и на том же месте, что и свёрнутая полоса загрузки файлов.
//
// ВИДЕО НЕ КАДРИРУЕТСЯ. Кроп видео — это перекодирование, которого в браузере здесь нет и не
// планировалось. Ролик уезжает как есть.

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
  /**
   * Очередь изменилась изнутри: убрали строку, доставили пачку, остались отказы. Проп
   * НЕОБЯЗАТЕЛЬНЫЙ — без него окно ведёт себя как прежде, только очередь родителя не худеет.
   */
  onQueueChange?: (files: File[]) => void;
};

function statusPill(item: PreviewItem) {
  switch (item.status) {
    case 'blocked':
      return <Pill tone='warn'>× too big</Pill>;
    case 'error':
      return <Pill tone='warn'>× failed</Pill>;
    case 'sending':
      return (
        <Pill tone='attention' className='motion-safe:animate-pulse'>
          ↑ uploading
        </Pill>
      );
    case 'queued':
      return <Pill tone='attention'>queued</Pill>;
    case 'done':
      return <Pill tone='ok'>✓ done</Pill>;
    default:
      return null;
  }
}

/** Кадрировать можно только картинку и только пока она не уехала — как в полосе библиотеки. */
const canCrop = (item: PreviewItem) =>
  item.type === 'image' &&
  (item.status === 'wait' || item.status === 'error' || item.status === 'blocked');

function Tile({
  item,
  thumbSrc,
  cropping,
  onCropOpen,
  onDrop,
}: {
  item: PreviewItem;
  thumbSrc: string;
  cropping: boolean;
  onCropOpen: () => void;
  onDrop: () => void;
}) {
  const pill = statusPill(item);
  return (
    <div className='min-w-0'>
      <div
        className={cn(
          'group relative size-24 overflow-hidden border bg-bgColor',
          cropping ? 'border-textColor' : 'border-borderColor',
        )}
      >
        <Media src={thumbSrc} alt={item.name} type={item.type} aspectRatio='auto' fit='cover' />

        {pill && <div className='absolute inset-x-0 bottom-0 flex justify-center pb-0.5'>{pill}</div>}

        {/* КНОПКИ ПОЯВЛЯЮТСЯ ПО НАВЕДЕНИЮ — но не ТОЛЬКО по нему. Чисто-ховерная кнопка
            недостижима с клавиатуры и на тачпаде без мыши: там наведения не бывает вовсе.
            Поэтому те же кнопки проявляются и по фокусу внутри плитки, и на устройствах без
            наведения — это добавка к просьбе, а не замена. */}
        <div
          className={cn(
            'absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition-opacity',
            'group-hover:opacity-100 group-focus-within:opacity-100',
            '[@media(hover:none)]:opacity-100',
          )}
        >
          {canCrop(item) && (
            <Button
              size='xs'
              variant={cropping ? 'simple' : 'secondary'}
              className='border border-textColor'
              aria-pressed={cropping}
              title='crop this frame'
              onClick={onCropOpen}
            >
              crop
            </Button>
          )}
          <Button
            size='xs'
            variant='secondary'
            className='border border-textColor'
            aria-label={`remove ${item.name} from the queue`}
            title={
              item.status === 'sending' ? 'already uploading, no way to cancel' : 'remove'
            }
            disabled={item.status === 'sending'}
            onClick={onDrop}
          >
            ×
          </Button>
        </div>
      </div>

      <Text size='micro' variant='label' component='p' className='mt-0.5 w-24 truncate leading-tight'>
        {item.croppedUrl ? 'cropped · ' : ''}
        {formatBytes(item.size)}
      </Text>
      {item.status === 'blocked' && !!item.blockers?.length && (
        <Text size='micro' component='p' className='w-24 leading-tight text-error'>
          {item.blockers.join(' · ')}
        </Text>
      )}
      {item.status === 'error' && (
        <Text size='micro' component='p' className='w-24 leading-tight text-error'>
          {item.error}
        </Text>
      )}
    </div>
  );
}

export function MediaIntakeDialog({
  files,
  aspect,
  lockAspect = false,
  purpose,
  onDone,
  onCancel,
  onQueueChange,
}: MediaIntakeDialogProps) {
  const engine = usePendingFiles();
  const { previews, pendingFiles, croppedUrls } = engine;
  const [collapsed, setCollapsed] = useState(false);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  /** Файлы, уже отданные движку. Диф по личности объекта: одинаковые скриншоты — разные File. */
  const seenRef = useRef<Set<File>>(new Set());
  /** Отправку начинали. Без флага доставка сработала бы на пустой пачке ещё до нажатия. */
  const startedRef = useRef(false);

  const open = files.length > 0;

  // СВЕРКА, А НЕ СБРОС. Раньше на смену массива очередь начиналась сначала — со второй вставкой
  // это стирало бы кропы первой. Отдаётся движку только то, чего он ещё не видел.
  useEffect(() => {
    const fresh = files.filter((f) => !seenRef.current.has(f));
    if (fresh.length) {
      fresh.forEach((f) => seenRef.current.add(f));
      engine.addFiles(fresh);
    }
    // Родитель очистил очередь (отмена, доставка) — движок обязан опустеть вместе с ней.
    if (!files.length) {
      seenRef.current = new Set();
      startedRef.current = false;
      setCollapsed(false);
      setCroppingId(null);
      if (engine.previews.length) {
        engine.removeFile(engine.previews.map((_, i) => i));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const tally = useMemo(() => {
    const count = (status: PreviewItem['status']) =>
      previews.filter((item) => item.status === status).length;
    const blocked = count('blocked');
    return {
      all: previews.length,
      wait: count('wait'),
      queued: count('queued'),
      sending: count('sending'),
      done: count('done'),
      error: count('error'),
      blocked,
      /** Сколько вообще может уехать: то, что не пролезет, из знаменателя выкинуто. */
      can: previews.length - blocked,
    };
  }, [previews]);

  const live = tally.queued + tally.sending > 0;

  // РАСЧЁТ С ВЛАДЕЛЬЦЕМ — ОДНИМ ВЫЗОВОМ НА ПАЧКУ. Владелец слота на каждый вызов делает
  // `append`/`setValue`, и три отдельных вызова из одной вставки прошли бы тремя правками формы —
  // с тремя записями в историю и тремя перерисовками списка.
  useEffect(() => {
    if (!startedRef.current || live) return;
    const done = previews
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.status === 'done');
    if (!done.length) return;

    const media = done
      .map(({ item }) => item.media)
      .filter((m): m is common_MediaFull => !!m);
    const doneFiles = new Set(done.map(({ index }) => pendingFiles[index]));

    engine.removeFile(done.map(({ index }) => index));
    if (media.length) onDone(media);
    // Остаток — только отказы и то, что не пролезло: их человек ещё может починить кропом или
    // повтором. Пустой остаток закрывает окно сам.
    onQueueChange?.(files.filter((f) => !doneFiles.has(f)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previews, live]);

  // Строку, которую кадрировали, могли убрать из очереди — панель кропа тогда показывает чужой кадр.
  const cropIndex = croppingId ? previews.findIndex((item) => item.id === croppingId) : -1;
  const cropping = cropIndex >= 0 ? previews[cropIndex] : undefined;
  useEffect(() => {
    if (croppingId && cropIndex < 0) setCroppingId(null);
  }, [croppingId, cropIndex]);

  // ОДИНОЧНЫЙ КАДР В СЛОТ С ЖЁСТКОЙ ПРОПОРЦИЕЙ ОТКРЫВАЕТ КРОП СРАЗУ: там кадрирование не
  // «возможность», а условие — слот другого соотношения не покажет.
  useEffect(() => {
    if (!lockAspect || croppingId || previews.length !== 1) return;
    const only = previews[0];
    if (canCrop(only)) setCroppingId(only.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockAspect, previews.length]);

  function dropAt(index: number) {
    const file = pendingFiles[index];
    engine.removeFile(index);
    onQueueChange?.(files.filter((f) => f !== file));
  }

  function startUpload() {
    startedRef.current = true;
    setCroppingId(null);
    setCollapsed(true);
    engine.handleUploadAll();
  }

  // ЗАКРЫТИЕ ВО ВРЕМЯ ОТПРАВКИ СВОРАЧИВАЕТ, А НЕ ОТМЕНЯЕТ. Отменить отправку этому API нечем:
  // файл уже в пути, и «отмена» означала бы только потерю адреса того, что всё равно ляжет в
  // библиотеку. Раньше от этого спасал запрет закрывать окно — то есть страница стояла.
  function handleOpenChange(next: boolean) {
    if (next) return;
    if (live) {
      setCollapsed(true);
      return;
    }
    onCancel();
  }

  if (!open) return null;

  // ── СВЁРНУТО ──────────────────────────────────────────────────────────────────────────────
  //
  // Дерево Radix здесь НЕ рендерится вовсе: модальный диалог держит ловушку фокуса и `inert` на
  // остальной странице, и «свернуть», оставив его смонтированным, означало бы ровно ту же
  // запертую страницу, от которой мы уходим.
  if (collapsed) {
    // ПИЛЮЛЯ ГОВОРИТ СЛОВОМ, А НЕ ЦВЕТОМ: свёрнутая очередь читается боковым зрением, и «что-то
    // идёт» без числа не отличимо от «что-то сломалось».
    const label = live
      ? `uploading ${tally.done} of ${tally.can}${purpose ? ` · ${purpose}` : ''}`
      : tally.error
        ? `${tally.error} failed — show the upload (${tally.all})`
        : tally.blocked
          ? `${tally.blocked} too big — show the upload (${tally.all})`
          : `show the upload (${tally.all})`;
    return createPortal(
      // ТАМ ЖЕ, ГДЕ СВЁРНУТАЯ ПОЛОСА ЗАГРУЗКИ ФАЙЛОВ, и той же кнопкой: для человека это один и
      // тот же орган, и разное место читалось бы как второй, соперничающий.
      //
      // Слой — `--z-toast`, а не `--z-dock`: приёмка законно живёт ПОВЕРХ чужого диалога, и на
      // доковом слое пилюля ушла бы под его оверлей. Отступ снизу поднимает её НАД файловым
      // доком, если тот сейчас на экране.
      <div
        className='fixed left-1/2 z-[var(--z-toast)] -translate-x-1/2'
        style={{ bottom: 'calc(var(--dock-bottom-h, 0px) + 10px)' }}
      >
        <Button size='sm' variant='main' onClick={() => setCollapsed(false)}>
          {label}
        </Button>
      </div>,
      document.body,
    );
  }

  // ── РАЗВЁРНУТО ────────────────────────────────────────────────────────────────────────────

  const grid = (
    <div className='flex flex-wrap gap-2.5' role='list' aria-label='files waiting to be uploaded'>
      {previews.map((item, index) => (
        <div role='listitem' key={item.id}>
          <Tile
            item={item}
            thumbSrc={croppedUrls[index] || item.url}
            cropping={croppingId === item.id}
            onCropOpen={() => setCroppingId((prev) => (prev === item.id ? null : item.id))}
            onDrop={() => dropAt(index)}
          />
        </div>
      ))}
    </div>
  );

  const single = previews.length === 1;
  /** Что вообще может уехать по нажатию: нетронутые строки и отказавшие. Не пролезшие — нет. */
  const sendable = tally.wait + tally.error;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-[60] bg-overlay' />
        {/* Фокус УВОДИТСЯ СЮДА по умолчанию Radix. Задержать его снаружи (как просилось: вставка
            всё равно ловится на document) значило бы оставить окно без клавиатуры — родительский
            диалог выбора медиа держит свою ловушку фокуса, и до кнопок этой модалки Tab бы не
            дошёл. */}
        <DialogPrimitive.Content
          className='fixed left-1/2 top-1/2 z-[60] flex max-h-[90vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-textInactiveColor bg-bgColor p-2.5'
          // ПРОМАХ МИМО ОКНА НЕ ВЫБРАСЫВАЕТ НАБРАННОЕ. Пока очередь жила один жест, случайный
          // клик по подложке стоил одного кадра; теперь в ней копится восемь из четырёх вставок,
          // и отдавать их клику мимо — слишком дорого. Уйти по-прежнему можно тремя явными
          // способами: [x], Esc, «cancel».
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className='flex flex-shrink-0 items-center justify-between border-b border-textInactiveColor pb-2'>
            <DialogPrimitive.Title className='text-lg uppercase'>
              add {purpose || 'media'}
              {previews.length > 1 ? ` · ${previews.length} frames` : ''}
            </DialogPrimitive.Title>
            <Button className='cursor-pointer py-1' onClick={() => handleOpenChange(false)}>
              [x]
            </Button>
          </div>

          <DialogPrimitive.Description asChild>
            <Text size='micro' variant='label' component='p' className='mt-1 flex-shrink-0'>
              paste more with ⌘V — they pile up here · hover a frame to crop or drop it · “upload
              all” sends them the way you see them
            </Text>
          </DialogPrimitive.Description>

          <div className='mt-2.5 flex-1 min-h-0 overflow-y-auto'>
            {cropping ? (
              // КАДРИРОВАНИЕ НЕ ПРЯЧЕТ ОСТАЛЬНЫЕ КАДРЫ: кроп встаёт слева, сетка остаётся справа.
              <div className='grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]'>
                <div className='min-w-0 lg:border-r lg:border-hairline lg:pr-2.5'>
                  <MediaCropper
                    key={cropping.id}
                    hideHeader
                    selectedFile={cropping.url}
                    initialAspect={aspect}
                    lockAspect={lockAspect}
                    outputFormat={cropping.mime || undefined}
                    saveLabel='apply crop'
                    originalLabel='keep the original'
                    saveCroppedImage={(url: string) => {
                      engine.setCroppedUrl(cropIndex, url);
                      setCroppingId(null);
                    }}
                    onUseOriginal={() => setCroppingId(null)}
                    onCancel={() => setCroppingId(null)}
                  />
                </div>
                <div className='min-w-0'>{grid}</div>
              </div>
            ) : (
              grid
            )}
          </div>

          <div className='mt-2 flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-hairline pt-2'>
            <Text size='micro' variant='label' component='p'>
              {tally.blocked > 0
                ? `${tally.blocked} will not fit the bucket and stay behind`
                : 'sent one by one — this bucket reports no progress along the way'}
            </Text>
            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Button size='lg' variant='simpleReverse' className='uppercase' onClick={onCancel}>
                cancel
              </Button>
              {/* ОДНА КНОПКА НА ОТПРАВКУ И НА ПОВТОР, потому что это одно действие: движок берёт
                  и нетронутые строки, и отказавшие. Две кнопки означали бы, что при одном отказе
                  свежевставленный кадр отправить нечем — «повтор» его не видит, а «отправить»
                  на экране нет. Слово меняется только когда отправлять больше нечего, кроме
                  отказавших: тогда это ровно повтор, и называть его иначе было бы враньём. */}
              <Button
                size='lg'
                variant='main'
                className='uppercase'
                disabled={!sendable}
                onClick={startUpload}
              >
                {tally.error > 0 && !tally.wait
                  ? `retry failed (${tally.error})`
                  : single
                    ? 'upload'
                    : `upload all (${sendable})`}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
