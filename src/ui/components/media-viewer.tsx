import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeftIcon, ChevronRightIcon, Cross2Icon } from '@radix-ui/react-icons';
import type { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useImageAnnotate, useMediaStageGestures, ZoomDrawToolbar } from './media-viewer-zoom';

// One normalized shape the viewer understands. Every call site maps its own data
// (proto MediaFull, a bare url, a { thumbnail, fullSize } row) down to this.
export interface MediaViewerItem {
  /** Large source shown on the stage. */
  src: string;
  /** Small source for the filmstrip / grid (falls back to src). */
  thumbnail?: string;
  /** Inferred from the url when omitted. */
  type?: 'image' | 'video';
  /** Accessible label / caption. */
  alt?: string;
}

/** Map a proto `common_MediaFull` to a viewer item (full-size preferred, thumb for the strip). */
export function mediaFullToViewerItem(m: common_MediaFull): MediaViewerItem {
  const media = m.media;
  const src =
    media?.fullSize?.mediaUrl || media?.compressed?.mediaUrl || media?.thumbnail?.mediaUrl || '';
  const thumbnail = media?.thumbnail?.mediaUrl || media?.compressed?.mediaUrl || src;
  return { src, thumbnail, type: isVideo(src) ? 'video' : 'image', alt: media?.blurhash || '' };
}

export function mediaFullListToViewerItems(list: common_MediaFull[]): MediaViewerItem[] {
  return list.map(mediaFullToViewerItem).filter((i) => i.src);
}

export function resolveViewerType(item: MediaViewerItem): 'image' | 'video' {
  return item.type ?? (isVideo(item.src) ? 'video' : 'image');
}

/** Small controller so a gallery can open the viewer at a given index with one call. */
export function useMediaViewer() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const openAt = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
  }, []);
  return { open, index, openAt, onOpenChange: setOpen, onIndexChange: setIndex };
}

interface MediaViewerProps {
  items: MediaViewerItem[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

export function MediaViewer({ items, index, open, onOpenChange, onIndexChange }: MediaViewerProps) {
  const count = items.length;
  const hasMany = count > 1;
  // Clamp defensively — the list can shrink (a delete) while the viewer is open.
  const safeIndex = count ? Math.min(Math.max(index, 0), count - 1) : 0;
  const current = items[safeIndex];
  const activeType = current ? resolveViewerType(current) : undefined;
  const isImage = activeType === 'image';

  const go = useCallback(
    (dir: 1 | -1) => {
      if (!count) return;
      onIndexChange((safeIndex + dir + count) % count);
    },
    [count, safeIndex, onIndexChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasMany) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    },
    [hasMany, go],
  );

  // Reset zoom/pan/drawing whenever the viewer moves to a different item, or
  // closes — each image gets a fresh, session-only stage.
  const resetKey = `${open ? 1 : 0}:${safeIndex}:${current?.src ?? ''}`;
  const gestures = useMediaStageGestures({ active: isImage, resetKey, hasMany, onSwipe: go });
  const annotate = useImageAnnotate({ resetKey, baseSize: gestures.baseSize });

  // Close only when the click lands on the empty ground (not the media or a control),
  // and not as the tail of a swipe.
  const handleStageClick = (e: React.MouseEvent) => {
    if (gestures.consumeJustSwiped()) return;
    if (e.target === e.currentTarget) onOpenChange(false);
  };

  // Keep the active filmstrip thumb in view as the index moves.
  const activeThumbRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    activeThumbRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [safeIndex, open]);

  if (!current) return null;

  const type = activeType as 'image' | 'video';
  const label = `${safeIndex + 1} / ${count}`;

  // Neighbours to preload so arrow / swipe nav feels instant.
  const neighbours = hasMany
    ? [items[(safeIndex + 1) % count], items[(safeIndex - 1 + count) % count]].filter(
        (n) => n && resolveViewerType(n) === 'image',
      )
    : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='media-viewer-overlay fixed inset-0 z-[var(--z-modal)] bg-black/95' />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          aria-label='Media viewer'
          className='media-viewer-content fixed inset-0 z-[var(--z-modal)] flex flex-col text-bgColor focus:outline-none'
        >
          <Dialog.Title className='sr-only'>Media viewer</Dialog.Title>
          <Dialog.Description className='sr-only'>
            {hasMany ? `Viewing item ${label}. Use the arrow keys to navigate.` : 'Viewing media.'}
          </Dialog.Description>

          {/* Top chrome */}
          <div className='relative z-10 flex shrink-0 items-center justify-between gap-4 px-4 py-3'>
            <span className='text-textBaseSize uppercase tabular-nums'>
              {hasMany ? label : ' '}
            </span>
            <Dialog.Close
              aria-label='Close viewer'
              className='flex size-8 items-center justify-center border border-bgColor/40 transition-colors hover:bg-bgColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor'
            >
              <Cross2Icon className='size-4' />
            </Dialog.Close>
          </div>

          {/* Stage — click on the empty ground (not the media) closes. Images get
              real pan/zoom (wheel, drag, pinch) and an optional draw overlay;
              video is untouched. */}
          <div
            ref={gestures.viewportRef}
            className={cn(
              'relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16',
              isImage && 'touch-none',
            )}
            onClick={handleStageClick}
            {...gestures.viewportHandlers}
          >
            <div
              key={safeIndex}
              className='media-viewer-stage relative flex max-h-full max-w-full items-center justify-center'
              style={isImage ? gestures.stageStyle : undefined}
            >
              {type === 'video' ? (
                <video
                  src={current.src}
                  controls
                  autoPlay
                  playsInline
                  className='max-h-[calc(100vh-11rem)] max-w-full object-contain'
                />
              ) : (
                <>
                  <img
                    ref={gestures.imgRef}
                    src={current.src}
                    alt={current.alt || ''}
                    draggable={false}
                    onDoubleClick={gestures.onImageDoubleClick}
                    className={cn(
                      'max-h-[calc(100vh-11rem)] max-w-full select-none object-contain',
                      gestures.isZoomed && 'cursor-grab active:cursor-grabbing',
                      !gestures.isZoomed && !annotate.drawMode && 'cursor-zoom-in',
                    )}
                  />
                  {annotate.drawMode && (
                    <canvas
                      ref={annotate.canvasRef}
                      aria-label='Drawing surface'
                      style={{ width: gestures.baseSize.w, height: gestures.baseSize.h }}
                      className='absolute left-0 top-0 touch-none cursor-crosshair'
                      {...annotate.canvasHandlers}
                    />
                  )}
                </>
              )}
            </div>

            {hasMany && (
              <>
                <ArrowButton
                  side='left'
                  onClick={(e) => {
                    e.stopPropagation();
                    go(-1);
                  }}
                />
                <ArrowButton
                  side='right'
                  onClick={(e) => {
                    e.stopPropagation();
                    go(1);
                  }}
                />
              </>
            )}

            {isImage && (
              <ZoomDrawToolbar
                scale={gestures.scale}
                canZoomIn={gestures.canZoomIn}
                canZoomOut={gestures.canZoomOut}
                isZoomed={gestures.isZoomed}
                onZoomIn={gestures.zoomIn}
                onZoomOut={gestures.zoomOut}
                onReset={gestures.reset}
                drawMode={annotate.drawMode}
                onToggleDraw={annotate.toggleDrawMode}
                color={annotate.color}
                onColorChange={annotate.setColor}
                colors={annotate.colors}
                hasStrokes={annotate.hasStrokes}
                onUndo={annotate.undo}
                onClear={annotate.clear}
              />
            )}
          </div>

          {/* Filmstrip */}
          {hasMany && (
            <div className='flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 py-3'>
              {items.map((item, i) => {
                const active = i === safeIndex;
                const itemIsVideo = resolveViewerType(item) === 'video';
                return (
                  <button
                    key={i}
                    ref={active ? activeThumbRef : undefined}
                    type='button'
                    aria-label={`Go to item ${i + 1}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onIndexChange(i)}
                    className={cn(
                      'relative size-12 shrink-0 overflow-hidden border transition-opacity sm:size-14',
                      active
                        ? 'border-bgColor opacity-100'
                        : 'border-transparent opacity-50 hover:opacity-100',
                    )}
                  >
                    {itemIsVideo ? (
                      <video
                        src={item.thumbnail || item.src}
                        muted
                        className='size-full object-cover'
                      />
                    ) : (
                      <img
                        src={item.thumbnail || item.src}
                        alt=''
                        className='size-full object-cover'
                      />
                    )}
                    {itemIsVideo && (
                      <span className='absolute bottom-0.5 right-0.5 bg-black/70 px-0.5 text-[8px] uppercase leading-tight'>
                        vid
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Off-screen preload of the neighbouring images. */}
          {neighbours.map((n, i) => (
            <link key={i} rel='preload' as='image' href={n.src} />
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ArrowButton({
  side,
  onClick,
}: {
  side: 'left' | 'right';
  onClick: (e: React.MouseEvent) => void;
}) {
  const Icon = side === 'left' ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type='button'
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      onClick={onClick}
      className={cn(
        'absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center',
        'border border-bgColor/40 bg-black/40 text-bgColor backdrop-blur-sm transition-colors',
        'hover:bg-bgColor hover:text-textColor',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor',
        side === 'left' ? 'left-2 sm:left-4' : 'right-2 sm:right-4',
      )}
    >
      <Icon className='size-5' />
    </button>
  );
}
