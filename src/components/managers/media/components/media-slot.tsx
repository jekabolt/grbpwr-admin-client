import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import MediaComponent from 'ui/components/media';
import { PLACEHOLDER_SURFACE, Placeholder, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { readSlotAspect } from '../utils/calculate-aspect';
import { useMediaIntake } from '../utils/useMediaIntake';
import { MediaSelector } from './media-selector';

// СЛОТ МЕДИА — ОДИН МОДУЛЬ НА ВСЕ ТОЧКИ ЗАГРУЗКИ.
//
// Раньше загрузка выглядела КНОПКОЙ: «select media», «+ attach media», «add sketch». Кнопка ничего
// не говорит о том, что окажется на её месте, и в ряду полей читается как ещё один контрол — а
// заполняет она РАМКУ КАДРА. Теперь пустое место и есть средство его заполнить: полосатый
// плейсхолдер тех же пропорций, что и будущая картинка, с рамкой пунктиром.
//
// ТРИ ЖЕСТА, ОДИН РЕЗУЛЬТАТ. Клик открывает библиотеку, ⌘V берёт из буфера, файл можно бросить
// сверху. Вставка и бросок идут через приёмную модалку (`useMediaIntake`): превью → кроп →
// подтверждение, и в слот приходит то же `common_MediaFull`, что и из библиотеки. Поэтому у
// владельца слота ОДИН обработчик, а не три.
//
// РАМКА ДЕРЖИТ ПРОПОРЦИИ СЛОТА, а не картинки. Плейсхолдер, заполненный кадр и подсветка броска —
// это один и тот же прямоугольник; иначе список полей прыгал бы на каждую загрузку.

export type MediaSlotProps = {
  /** Адрес того, что уже лежит в слоте. Пусто — плейсхолдер. */
  mediaUrl?: string;
  alt?: string;
  /** Пропорции, которые предлагает пикер и с которыми открывается кроп. */
  aspectRatio?: string[];
  /** CSS-пропорции рамки. По умолчанию — первое конкретное из `aspectRatio`, иначе 4/5. */
  frameAspect?: string;
  /** Фиксированная высота рамки (полоса кадров); ширина берётся от пропорций. */
  heightPx?: number;
  /** Подпись на плейсхолдере. */
  label?: string;
  /**
   * Что дописать к строке жестов — обычно требуемые пропорции. `null` — убрать вторую строку
   * целиком (слот стоит в ряду, где на неё нет места).
   */
  hint?: string | null;
  /** Куда это ляжет: заголовок пикера и приёмной модалки. */
  purpose?: string;
  /** Пикер отдаёт несколько за раз (галерея), а не один кадр. */
  allowMultiple?: boolean;
  /**
   * Сколько файлов взять из одной вставки или броска. По умолчанию — все для галереи и ровно один
   * для слота на один кадр. Задаётся явно там, где мест осталось меньше, чем в буфере картинок.
   */
  limit?: number;
  /** Слот показывает и принимает видео. */
  showVideos?: boolean;
  /** Можно менять. Выключено — только показ. */
  editMode?: boolean;
  /** Малый размер: глиф и подсказка не помещаются, остаётся только подпись. */
  compact?: boolean;
  /**
   * Чем задаётся размер рамки вместо ширины по контейнеру — например `w-full sm:w-fit sm:h-44`
   * там, где кадр меряется РОСТОМ, а ширину берёт от пропорций.
   */
  sizeClassName?: string;
  className?: string;
  /** Клик по заполненному кадру. Без него кадр не кликается. */
  onOpenViewer?: () => void;
  onSelect: (media: common_MediaFull[]) => void;
  /** Есть — на заполненном кадре появляется «remove». */
  onClear?: () => void;
};

/** Глиф кадра. Полосатый прямоугольник без него читается как «тут что-то сломалось». */
function PhotoGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      aria-hidden='true'
      className={cn('h-5 w-5', className)}
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
    >
      <rect x='2.5' y='4.5' width='19' height='15' />
      <circle cx='8' cy='9.5' r='1.5' />
      <path d='M2.5 16.5 8.5 11l4.5 4 3-2.5 5.5 4.5' />
    </svg>
  );
}

export function MediaSlot({
  mediaUrl,
  alt = 'media',
  aspectRatio = ['Custom'],
  frameAspect,
  heightPx,
  label = '+ add media',
  hint,
  purpose,
  allowMultiple = false,
  limit,
  showVideos = true,
  editMode = true,
  compact = false,
  sizeClassName,
  className,
  onOpenViewer,
  onSelect,
  onClear,
}: MediaSlotProps) {
  const slot = readSlotAspect(aspectRatio);
  const frame =
    frameAspect ??
    (aspectRatio.find((r) => r.toLowerCase() !== 'custom')?.replace(':', '/') || '4/5');
  const mediaIsVideo = isVideo(mediaUrl);

  const intake = useMediaIntake({
    enabled: editMode,
    accept: showVideos ? 'media' : 'image',
    // Слот на одну картинку берёт из буфера РОВНО ОДНУ: остальные всё равно некуда положить, а
    // проведённые через кроп они осели бы в библиотеке файлами, которых никто не просил.
    limit: limit ?? (allowMultiple ? undefined : 1),
    aspect: slot.primary,
    lockAspect: slot.constrained,
    purpose,
    onMedia: onSelect,
  });

  const frameStyle: React.CSSProperties =
    heightPx != null ? { aspectRatio: frame, height: heightPx } : { aspectRatio: frame };
  const sizeClass = sizeClassName ?? (heightPx != null ? 'w-auto' : 'w-full');

  // Подсказка о жестах пишется один раз здесь: каждый вызывающий, сочиняя её сам, писал бы про ⌘V
  // по-своему — или забывал, и жест оставался бы невидимым.
  const gestures = editMode ? '⌘V · drag a file · click to browse' : null;
  // Подпись слота и жесты стоят ОДНОЙ строкой: «4:5 · ⌘V · drop…». Двумя они превращают рамку
  // высотой в шесть строк текста, а слоты бывают ростом в 96 пикселей.
  const secondLine = hint === null ? null : [hint, gestures].filter(Boolean).join(' · ') || null;

  // ТОЛЬКО ПРО БРОСОК. Открытая приёмная модалка — это не «загружаю»: человек ещё смотрит на
  // превью и выбирает рамку кропа, и слово «adding…» под ней обещает то, чего не произошло.
  // Ход загрузки показывает сама модалка, на своей кнопке.
  const status = intake.dragging ? (showVideos ? 'drop to add' : 'drop the image') : null;

  // ------------------------------------------------------------------ пусто
  if (!mediaUrl) {
    if (!editMode) {
      return (
        <Placeholder
          label='empty'
          style={frameStyle}
          className={cn(sizeClass, 'border-dashed', className)}
        />
      );
    }
    // ПОЛОСАТАЯ ПОВЕРХНОСТЬ РИСУЕТСЯ НА САМОЙ КНОПКЕ, а не внутри неё. Размер слота живёт ровно на
    // одном элементе: кнопка-обёртка шириной по содержимому вокруг ребёнка шириной в сто процентов
    // считает ширину по кругу — а именно так задан слот, который меряется ростом (`sm:h-44`).
    return (
      <>
        <MediaSelector
          label={label}
          purpose={purpose}
          aspectRatio={aspectRatio}
          allowMultiple={allowMultiple}
          showVideos={showVideos}
          saveSelectedMedia={onSelect}
          trigger={
            <button
              {...intake.regionHandlers}
              type='button'
              aria-label={label}
              style={{ ...PLACEHOLDER_SURFACE, ...frameStyle }}
              className={cn(
                placeholderClass({ dashed: true }),
                // ПОДПИСЬ СЛОТА — ЧИТАЕМЫЙ ТЕКСТ, а не инертная заглушка: `Placeholder` красит
                // содержимое в #ccc, годный для рамок и выключенных состояний, но на полосатом
                // фоне дающий полтора к одному. Здесь это ЕДИНСТВЕННОЕ, что объясняет жест.
                'cursor-pointer flex-col gap-1 px-2 text-center text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                // Строка жестов и глиф прячутся по ШИРИНЕ САМОГО СЛОТА, а не по вкусу вызывающего:
                // в рамке 96 пикселей та же подсказка ложится в четыре строки и превращает слот в
                // кашу, а список мест, где слот узкий, никто не будет поддерживать вручную.
                '@container',
                intake.dragging && 'border-textColor text-textColor',
                sizeClass,
                className,
              )}
            >
              {!compact && <PhotoGlyph className='hidden @[6rem]:block' />}
              <span className='leading-tight'>{status ?? label}</span>
              {!compact && !status && secondLine && (
                <span className='hidden text-nano normal-case leading-tight tracking-normal @[11rem]:block'>
                  {secondLine}
                </span>
              )}
            </button>
          }
        />
        {intake.dialog}
      </>
    );
  }

  // --------------------------------------------------------------- заполнено
  return (
    <div
      {...intake.regionHandlers}
      className={cn(
        'relative overflow-hidden border',
        intake.dragging ? 'border-textColor' : 'border-textInactiveColor',
        sizeClass,
        className,
      )}
      style={frameStyle}
    >
      <MediaComponent
        src={mediaUrl}
        alt={alt}
        aspectRatio='auto'
        type={mediaIsVideo ? 'video' : 'image'}
        // Ролик ВПИСЫВАЕТСЯ, картинка ЗАПОЛНЯЕТ: у видео нет обещанных слотом пропорций, и
        // обрезка по рамке съела бы кадр, ради которого его и положили.
        fit={mediaIsVideo ? 'contain' : 'cover'}
      />

      {onOpenViewer && (
        <button
          type='button'
          aria-label={`view ${alt}`}
          onClick={onOpenViewer}
          className='absolute inset-0 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
        />
      )}

      {mediaIsVideo && (
        <span className='pointer-events-none absolute left-1 top-1 z-10 bg-textColor px-1.5 py-0.5'>
          <Text className='!text-bgColor' size='small' variant='uppercase'>
            video
          </Text>
        </span>
      )}

      {/* Бросок и вставка работают и по занятому слоту — это «заменить». Пока идёт то или другое,
          рамку надо ЗАКРАСИТЬ: иначе жест над готовым кадром выглядит как ничего не происходящее. */}
      {status && (
        <div className='pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-bgColor/85'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            {status}
          </Text>
        </div>
      )}

      {editMode && (
        <div className='absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-1 border-t border-textInactiveColor bg-bgColor/90 px-1.5 py-1'>
          <MediaSelector
            label='change'
            purpose={purpose}
            aspectRatio={aspectRatio}
            allowMultiple={allowMultiple}
            showVideos={showVideos}
            saveSelectedMedia={onSelect}
            triggerClassName='px-2 py-0.5 text-small cursor-pointer'
          />
          {onClear && (
            <Button
              type='button'
              variant='secondary'
              onClick={onClear}
              className='px-2 py-0.5 text-small cursor-pointer'
            >
              remove
            </Button>
          )}
        </div>
      )}

      {intake.dialog}
    </div>
  );
}
