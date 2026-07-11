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
}

// Read-only, clickable thumbnail row. Any tile opens the shared MediaViewer at its
// index so the same browse/prev/next experience shows up everywhere media is listed.
export function MediaGallery({
  items,
  className,
  tileClassName,
  fit = 'cover',
  emptyLabel,
}: MediaGalleryProps) {
  const viewer = useMediaViewer();

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
              onClick={() => viewer.openAt(i)}
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
                <span className='absolute bottom-0.5 right-0.5 bg-black/70 px-1 text-[9px] uppercase leading-tight text-white'>
                  video
                </span>
              )}
            </button>
          );
        })}
      </div>

      <MediaViewer items={items} {...viewer} />
    </>
  );
}
