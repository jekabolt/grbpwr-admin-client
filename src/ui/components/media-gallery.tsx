import { cn } from 'lib/utility';
import { MediaViewer, MediaViewerItem, resolveViewerType, useMediaViewer } from './media-viewer';

interface MediaGalleryProps {
  items: MediaViewerItem[];
  /** Extra classes on the wrapping flex row. */
  className?: string;
  /** Per-tile classes — size lives here (default h-20 w-20). */
  tileClassName?: string;
  /** How thumbnails fill their tile. */
  fit?: 'cover' | 'contain';
  /** Rendered when there are no items (nothing by default). */
  emptyLabel?: React.ReactNode;
  /**
   * Открывает ВЛАДЕЛЕЦ — галерея тогда своей смотрелки не заводит и остаётся рядом плиток.
   *
   * Нужно там, где открыть кадр просят не только плитки: у задачи это ещё и ссылка посреди
   * описания. Со своей смотрелкой внутри галерея была бы второй дверью в ту же комнату, и
   * заменять просмотрщик пришлось бы в двух местах сразу.
   */
  onOpen?: (index: number) => void;
  /**
   * Отметка в подвале плитки — то, что о кадре знает ВЛАДЕЛЕЦ, а не галерея (у задачи это число
   * указаний на снимке). Полоса прижата к нижней кромке и залита белым: плитка здесь квадрат
   * фиксированного размера, и настоящий подвал под ней сдвинул бы ряд.
   */
  badge?: (index: number) => React.ReactNode;
}

// Read-only, clickable thumbnail row. Any tile opens the shared MediaViewer at its
// index so the same browse/prev/next experience shows up everywhere media is listed.
export function MediaGallery({
  items,
  className,
  tileClassName,
  fit = 'cover',
  emptyLabel,
  onOpen,
  badge,
}: MediaGalleryProps) {
  const viewer = useMediaViewer();
  const open = onOpen ?? viewer.openAt;

  if (items.length === 0) {
    return emptyLabel ? <>{emptyLabel}</> : null;
  }

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {items.map((item, i) => {
          const isVid = resolveViewerType(item) === 'video';
          const thumb = item.thumbnail || item.src;
          return (
            <button
              key={i}
              type='button'
              aria-label={`View item ${i + 1} of ${items.length}`}
              onClick={() => open(i)}
              className={cn(
                'group relative block h-20 w-20 shrink-0 cursor-zoom-in overflow-hidden border border-textInactiveColor transition-colors hover:border-textInactiveColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                tileClassName,
              )}
            >
              {isVid ? (
                <video
                  src={thumb}
                  muted
                  playsInline
                  className={cn(
                    'h-full w-full',
                    fit === 'contain' ? 'object-contain' : 'object-cover',
                  )}
                />
              ) : (
                <img
                  src={thumb}
                  alt={item.alt || ''}
                  className={cn(
                    'h-full w-full transition-opacity group-hover:opacity-90',
                    fit === 'contain' ? 'object-contain' : 'object-cover',
                  )}
                />
              )}
              {isVid && (
                <span className='absolute bottom-0.5 right-0.5 bg-black/70 px-1 text-nano uppercase leading-tight text-white'>
                  video
                </span>
              )}
              {badge?.(i) && (
                <span className='absolute inset-x-0 bottom-0 border-t border-hairline bg-bgColor px-1 text-left leading-tight'>
                  {badge(i)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!onOpen && <MediaViewer items={items} {...viewer} />}
    </>
  );
}
