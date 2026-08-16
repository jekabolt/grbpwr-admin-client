import { CopyIcon, EnterFullScreenIcon, TrashIcon } from '@radix-ui/react-icons';
import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import Text from 'ui/components/text';
import { VideoSize } from '..';
import { mediaAspectRatio, ratioLabel } from '../utils/calculate-aspect';
import { useDeleteMedia } from '../utils/useMediaQuery';

/**
 * Пропорция ЯЧЕЙКИ сетки. Одна на все плитки: ряды выстраиваются, а форма самого снимка видна
 * полями вокруг него. Портрет 4:5 — самый частый формат в этой библиотеке, поэтому полей у
 * большинства кадров нет вовсе.
 */
const CELL_RATIO = 4 / 5;

/** Что рамка слота сделает с этим кадром. Считается вызывающим, плитка только показывает. */
export type SlotFit = {
  /** Соотношение совпало (или это видео, которое не кадрируют) — встанет как есть. */
  ok: boolean;
  /** Доля площади, которую срежет рамка: 0.11 значит одиннадцать процентов. */
  loss?: number;
  /** Требуемое соотношение, числом. Рисуется рамкой поверх кадра. */
  target?: number;
};

interface MediaItemProps {
  media: common_MediaFull;
  isSelected: boolean;
  disabled?: boolean;
  videoSizes: Record<number, VideoSize>;
  onToggle: () => void;
  onVideoLoad: (mediaId: number, event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onView?: (media: common_MediaFull) => void | Promise<void>;
  selectionMode?: boolean;
  /** Заполняется только в диалоге выбора под слот с требованием к пропорции. */
  fit?: SlotFit;
}

/** Квадратная кнопка-действие поверх кадра. Появляется по наведению и по фокусу с клавиатуры. */
function TileAction({
  label,
  onClick,
  children,
  tone,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  tone?: 'danger';
}) {
  return (
    <button
      type='button'
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex size-6 items-center justify-center border-b border-l border-borderColor bg-bgColor text-textColor',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
        tone === 'danger' ? 'hover:bg-error hover:text-bgColor' : 'hover:bg-textColor hover:text-bgColor',
      )}
    >
      {children}
    </button>
  );
}

export function MediaItem({
  media,
  isSelected,
  disabled = false,
  videoSizes,
  onToggle,
  onVideoLoad,
  onView,
  selectionMode = false,
  fit,
}: MediaItemProps) {
  const mediaUrl = media.media?.thumbnail?.mediaUrl;
  const fullUrl = media.media?.fullSize?.mediaUrl || mediaUrl || '';
  const deleteMediaMutation = useDeleteMedia();
  const { showMessage } = useSnackBarStore();
  const [armed, setArmed] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  // Размеры для подписи берутся у ОРИГИНАЛА, а не у миниатюры: у безымянного соотношения
  // подписью становятся сами стороны, и «289×216» вместо «1447×1080» — это размеры превью,
  // которых у файла в бакете нет.
  const width =
    media.media?.fullSize?.width ||
    media.media?.thumbnail?.width ||
    videoSizes[media.id || 0]?.width;
  const height =
    media.media?.fullSize?.height ||
    media.media?.thumbnail?.height ||
    videoSizes[media.id || 0]?.height;
  const aspectRatio = mediaAspectRatio(media, videoSizes);
  const video = isVideo(mediaUrl);
  const selectable = !disabled;

  const handleVideoLoadEvent = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (media.id) onVideoLoad(media.id, event);
  };

  // Клик по кадру: в режиме выбора — выбрать, на странице библиотеки — открыть.
  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (selectionMode || !onView) {
      if (selectable) onToggle();
      return;
    }
    onView(media);
  };

  // Отклик — тот же, что у всех остальных копирований адреса в подсистеме. Кнопка здесь размером
  // с глиф, подписи в ней не поместится, а без ответа человек жмёт второй раз и не знает, сработало
  // ли: смена `title` видна только на наведении, то есть уже после того, как курсор ушёл.
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(fullUrl);
    showMessage('url copied', 'success');
  };

  // УДАЛЕНИЕ ГОВОРИТ, ЧТО ДЕЛАЕТ. Раньше та же кнопка `[x]` сначала взводилась в галочку, а
  // потом стирала файл — два одинаковых клика подряд, без единого слова о том, что происходит
  // и что это навсегда. Теперь взвод разворачивает подпись плитки в вопрос с двумя разными
  // кнопками.
  const handleDelete = () => {
    setFailure(undefined);
    deleteMediaMutation.mutate(media.id || 0, {
      onError: (error) => {
        // Отказ бакета ОСТАЁТСЯ НА ПЛИТКЕ. Тост гаснет через несколько секунд, и человек,
        // отвернувшийся к соседнему снимку, видит только то, что файл никуда не делся, без
        // причины. Чаще всего причина одна: медиа стоит на витрине и на него есть ссылка.
        const message = error instanceof Error ? error.message : 'the media could not be deleted';
        setFailure(message);
        showMessage(message, 'error');
      },
      onSettled: () => setArmed(false),
    });
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col border border-borderColor bg-bgColor',
        // Выбор виден ВЕСОМ, а не цветом (правило системы: цвет носит состояние здоровья, вес —
        // выделение). Обводка, а не второй пиксель рамки: `border-2` менял бы ширину плитки, а
        // высота кадра считается от неё, и ряды дёргались бы на каждом щелчке по чекбоксу.
        isSelected && 'outline outline-2 -outline-offset-2 outline-textColor',
      )}
    >
      {selectable && (
        <button
          type='button'
          aria-pressed={isSelected}
          aria-label={isSelected ? `deselect ${media.id}` : `select ${media.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            // z-20 здесь ЛОКАЛЬНЫЙ СТЕК ПЛИТКИ, а не слой страницы: он поднимает чекбокс над
            // кадром внутри одной карточки. Семантическая шкала (--z-*) описывает слои.
            'absolute left-1 top-1 z-20 flex size-3.5 items-center justify-center border transition-opacity',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            isSelected
              ? 'border-textColor bg-textColor text-bgColor opacity-100'
              : 'border-borderColor bg-bgColor opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          {isSelected && <span className='text-nano leading-none'>✓</span>}
        </button>
      )}

      <button
        type='button'
        onClick={handleClick}
        // ЕДИНАЯ РАМКА НА ВСЮ СЕТКУ, кадр внутри неё целиком. Плитка в собственных пропорциях
        // рвёт ряды (портрет вдвое выше панорамы), а `cover` показывает не тот кадр, который
        // человек ищет глазами. Серый мат по краям и есть сообщение о форме снимка.
        className='relative block w-full cursor-pointer bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
      >
        <Media
          src={mediaUrl || ''}
          type={video ? 'video' : 'image'}
          alt={mediaUrl || 'media not found'}
          // БЕЗ ШТАТНОГО ПРОИГРЫВАТЕЛЯ В СЕТКЕ. Полоса управления браузера — чужая по языку
          // хрома, к тому же клик по перемотке попадал мимо выбора и мимо открытия.
          controls={false}
          preload='metadata'
          muted
          aspectRatio='4/5'
          fit='contain'
          onLoadedMetadata={handleVideoLoadEvent}
        />
        {/* РАМКА СЛОТА ПОВЕРХ КАДРА. Диалог выбора знает требуемую пропорцию с самого начала;
            нарисованная на снимке, она отвечает на «что именно останется» до клика, а не после.
            Считается ОТ КАДРА, а не от ячейки: ячейка у всех одна (4:5), а снимок внутри неё
            вписан с полями, и рамка, посчитанная от ячейки, у панорамы легла бы мимо снимка. */}
        {fit?.target && !fit.ok && width && height && (
          <span aria-hidden className='pointer-events-none absolute inset-0 flex items-center justify-center'>
            <span
              className='relative'
              // Коробка самого кадра внутри ячейки: что упирается первым, ширина или высота.
              style={
                width / height >= CELL_RATIO
                  ? { width: '100%', aspectRatio: `${width}/${height}` }
                  : { height: '100%', aspectRatio: `${width}/${height}` }
              }
            >
              <span
                className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-bgColor outline outline-1 outline-textColor'
                style={
                  fit.target >= width / height
                    ? { width: '100%', aspectRatio: String(fit.target) }
                    : { height: '100%', aspectRatio: String(fit.target) }
                }
              />
            </span>
          </span>
        )}
        {video && (
          <Text
            size='nano'
            component='span'
            className='absolute bottom-1 right-1 bg-textColor px-1 uppercase text-bgColor'
          >
            video
          </Text>
        )}
      </button>

      {/* z-20 — тот же локальный стек плитки, что и у чекбокса: порядок внутри карточки. */}
      <div className='absolute right-0 top-0 z-20 flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'>
        <TileAction label='copy url' onClick={handleCopy}>
          <CopyIcon className='size-3' />
        </TileAction>
        {onView && !selectionMode && (
          <TileAction
            label='open'
            onClick={(e) => {
              e.stopPropagation();
              onView(media);
            }}
          >
            <EnterFullScreenIcon className='size-3' />
          </TileAction>
        )}
        <TileAction
          label='delete'
          tone='danger'
          onClick={(e) => {
            e.stopPropagation();
            setArmed((v) => !v);
          }}
        >
          <TrashIcon className='size-3' />
        </TileAction>
      </div>

      {armed ? (
        <div className='border-t border-textColor px-1.5 py-1'>
          <Text size='micro' variant='label' className='block'>
            delete {media.id} for good?
          </Text>
          <div className='mt-1 flex gap-1'>
            {/* Красная кнопка остаётся своей вёрсткой: у `Button` нет тона «опасно», а цвет
                текста из варианта перебивает добавленный класс — подпись пропала бы. Размеры и
                типографика взяты у `size='xs'` буква в букву. */}
            <button
              type='button'
              onClick={handleDelete}
              disabled={deleteMediaMutation.isPending}
              className='border border-error px-1.5 py-px text-micro uppercase leading-4 tracking-label text-error hover:bg-error hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:border-borderColor disabled:text-textInactiveColor'
            >
              {deleteMediaMutation.isPending ? 'deleting…' : 'delete'}
            </button>
            <Button type='button' size='xs' variant='secondary' onClick={() => setArmed(false)}>
              cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className='flex items-center gap-1.5 border-t border-hairline px-1.5 py-0.5'>
          <Text size='micro' component='span' className='tabular-nums'>
            {media.id}
          </Text>
          <span className='ml-auto flex items-center gap-1 text-labelColor'>
            {fit ? (
              <Text size='micro' variant={fit.ok ? 'label' : undefined} component='span'>
                {/* «срежет N%», а не «кроп N%»: то же слово, что и в галерее под кадром
                    («рамка срежет N%»), чтобы один снимок не описывался двумя способами по
                    дороге из библиотеки в форму. */}
                {fit.ok
                  ? video
                    ? 'video'
                    : 'fits'
                  : `crops ${Math.round((fit.loss ?? 0) * 100)}%`}
              </Text>
            ) : (
              <>
                <RatioGlyph ratio={aspectRatio} width={width} height={height} size={10} />
                <Text size='micro' variant='label' component='span'>
                  {ratioLabel(aspectRatio, width, height)}
                </Text>
              </>
            )}
          </span>
        </div>
      )}

      {failure && (
        <div className='border-t border-error px-1.5 py-1'>
          <Text size='micro' component='span' className='block text-error'>
            {failure}
          </Text>
          <Button
            type='button'
            size='xs'
            variant='secondary'
            className='mt-1'
            onClick={() => setFailure(undefined)}
          >
            got it
          </Button>
        </div>
      )}
    </div>
  );
}
