import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { useMemo, useState, type ReactNode } from 'react';
import { AnnotatedImage, type AnnotatedCallout } from './annotated-image';
import { MediaViewer, mediaFullListToViewerItems, useMediaViewer } from './media-viewer';
import Text from './text';
import { ToggleSwitch } from './toggle-switch';

// A focused-gallery surface: ONE large image you annotate in place, a thumbnail carousel of every
// image below it, and a "zoom" control that opens the shared media lightbox (pan + freehand draw).
// It owns only the interaction grammar — the numbered callout PINS + hover/edit/✕ notes ride the
// shared AnnotatedImage, so the phantom-callout hardening there (a ✕ press or an out-of-bounds
// click never drops a pin) is inherited by every surface that reuses this component.
//
// Everything form- or domain-specific is injected: the resolved media (`views`), the callouts for
// an image (`calloutsFor` + the add/move/remove/render callbacks), how a picked image is committed
// (`onPickMedia`), and any per-image footer controls (`renderFocusedFooter`). That keeps the same
// gallery driving the tech-card moodboard + technical sketch AND the fitting photos, each binding
// its own React Hook Form fields, without this component knowing which form it sits in.

/** One resolved, URL-bearing image the gallery shows. `key` is a stable React identity. */
export type FocusedView = {
  key: string;
  mediaId: number;
  full: common_MediaFull;
};

const mediaUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

const thumbUrl = (full?: common_MediaFull): string =>
  full?.media?.thumbnail?.mediaUrl || full?.media?.fullSize?.mediaUrl || '';

// Frame the focused image to the media's own aspect ratio so the picture fills it exactly (no crop,
// no letterbox) — which keeps every pin mapped 1:1 onto the image it was placed on. Fitting photos
// are unconstrained, so the fallback is only used when the media carries no dimensions.
function mediaAspect(full: common_MediaFull | undefined, fallback: string): string {
  const dim = full?.media?.fullSize ?? full?.media?.thumbnail;
  const w = dim?.width;
  const h = dim?.height;
  return w && h ? `${w}/${h}` : fallback;
}

export type FocusedAnnotatorProps = {
  /** Resolved, URL-bearing images in display order. Position 0 is the preview when `previewFirst`. */
  views: FocusedView[];

  /** Callouts pinned to one image, already mapped to the annotated-image marker shape. */
  calloutsFor: (mediaId: number) => AnnotatedCallout[];
  onAddCallout: (mediaId: number, xNorm: number, yNorm: number) => void;
  onMoveCallout: (key: string, xNorm: number, yNorm: number) => void;
  onRemoveCallout: (key: string) => void;
  renderNote: (key: string, opts: { close: () => void }) => ReactNode;
  /** Optional header title inside a note (e.g. a part code, or a constant "fit note"). */
  noteTitle?: (key: string) => string | undefined;

  /** Commit newly-picked media (caller dedupes + appends) and return the ids actually added, so the
   *  first fresh image can be focused immediately. */
  onPickMedia: (items: common_MediaFull[]) => number[];
  /** Remove one image (caller drops it from its list and un-pins its callouts). */
  onRemoveMedia: (view: FocusedView) => void;

  /** MediaSelector trigger label + dialog purpose; `pickerAspectRatio` left undefined = any ratio. */
  addLabel: string;
  purpose: string;
  pickerAspectRatio?: string[];

  notesMode: 'hover' | 'auto';
  pinSize: 'sm' | 'md';
  emptyLabel: string;
  /** Aspect used only when the focused media has no known dimensions (e.g. '4/5', '3/4'). */
  fallbackAspect?: string;
  /** Show a "preview" badge on the first thumbnail (the surface's card preview). */
  previewFirst?: boolean;
  /** Accessible name for the focused image + lightbox (per image). */
  mediaLabel?: (view: FocusedView, positionInViews: number) => string;
  /** Optional controls under the focused image (kind select, "set as preview", …). */
  renderFocusedFooter?: (view: FocusedView) => ReactNode;
  /** Accessible label for the thumbnail carousel. */
  carouselLabel?: string;
};

export function FocusedAnnotator({
  views,
  calloutsFor,
  onAddCallout,
  onMoveCallout,
  onRemoveCallout,
  renderNote,
  noteTitle,
  onPickMedia,
  onRemoveMedia,
  addLabel,
  purpose,
  pickerAspectRatio,
  notesMode,
  pinSize,
  emptyLabel,
  fallbackAspect = '4/5',
  previewFirst = false,
  mediaLabel,
  renderFocusedFooter,
  carouselLabel,
}: FocusedAnnotatorProps) {
  const [addMode, setAddMode] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const viewer = useMediaViewer();

  const hasMedia = views.length > 0;
  const focused = views.find((v) => v.mediaId === focusedId) ?? views[0];
  const focusedPosition = focused ? views.findIndex((v) => v.mediaId === focused.mediaId) : -1;
  const focusedUrl = mediaUrl(focused?.full);
  const focusedAlt = focused && mediaLabel ? mediaLabel(focused, focusedPosition) : '';

  const viewerItems = useMemo(
    () => mediaFullListToViewerItems(views.map((v) => v.full)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [views.map((v) => v.mediaId).join(','), focusedUrl],
  );
  const focusedViewerIndex = Math.max(0, focusedPosition);

  // Commit the pick through the caller, then focus the first freshly-added image so it is
  // immediately annotatable.
  function handlePick(items: common_MediaFull[]) {
    const added = onPickMedia(items);
    if (added.length && added[0] != null) setFocusedId(added[0]);
  }

  // Removing the focused image falls focus back to the new first image.
  function handleRemoveMedia(view: FocusedView) {
    if (view.mediaId === focusedId) setFocusedId(null);
    onRemoveMedia(view);
  }

  return (
    <div className='space-y-3'>
      {hasMedia && (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Text variant='label' size='small'>
            {addMode
              ? 'click the image to drop a callout · drag a pin to move it'
              : 'hover a pin to read · click a pin to edit · use zoom to draw'}
          </Text>
          <div className='flex shrink-0 items-center gap-4'>
            {notesMode === 'auto' && (
              <ToggleSwitch
                checked={showAllNotes}
                onCheckedChange={setShowAllNotes}
                label='show all notes'
              />
            )}
            <ToggleSwitch checked={addMode} onCheckedChange={setAddMode} label='add callout' />
          </div>
        </div>
      )}

      {!hasMedia ? (
        <Text variant='label' size='small'>
          {emptyLabel}
        </Text>
      ) : (
        <div className='space-y-3'>
          {/* Focused image — annotate in place; the zoom control opens the lightbox for pan + draw */}
          {focused && (
            <div className='mx-auto w-full max-w-[26rem] space-y-2'>
              <AnnotatedImage
                src={focusedUrl}
                alt={focusedAlt}
                type={isVideo(focusedUrl) ? 'video' : 'image'}
                aspectRatio={mediaAspect(focused.full, fallbackAspect)}
                callouts={calloutsFor(focused.mediaId)}
                editable
                addMode={addMode}
                zoomable={false}
                notesMode={notesMode}
                showAllNotes={showAllNotes}
                pinSize={pinSize}
                onAdd={(x, y) => onAddCallout(focused.mediaId, x, y)}
                onMove={onMoveCallout}
                onRemove={onRemoveCallout}
                noteTitle={noteTitle}
                renderNote={renderNote}
                cornerSlot={
                  <button
                    type='button'
                    aria-label='zoom · pan · draw'
                    // Stop the press from reaching the Stage's add-callout / pan gesture.
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      viewer.openAt(focusedViewerIndex);
                    }}
                    className='cursor-pointer border border-textInactiveColor bg-bgColor px-2 py-0.5 text-textBaseSize uppercase leading-none hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
                  >
                    zoom
                  </button>
                }
              />

              {renderFocusedFooter?.(focused)}
            </div>
          )}

          {/* Thumbnail carousel — every image; click to focus. The first is the preview. */}
          <div
            aria-label={carouselLabel}
            className='flex snap-x items-start gap-2 overflow-x-auto pb-2'
          >
            {views.map((v, i) => {
              const active = focused?.mediaId === v.mediaId;
              const isPreview = previewFirst && i === 0;
              const url = thumbUrl(v.full);
              const video = isVideo(mediaUrl(v.full)) || isVideo(url);
              return (
                <div key={v.key} className='relative shrink-0 snap-start'>
                  <button
                    type='button'
                    aria-current={active ? 'true' : undefined}
                    aria-label={`focus image ${i + 1}`}
                    onClick={() => setFocusedId(v.mediaId)}
                    className={cn(
                      'block size-16 overflow-hidden border transition-opacity sm:size-20',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                      active
                        ? 'border-textColor outline outline-2 outline-offset-1 outline-textColor'
                        : 'border-textInactiveColor opacity-70 hover:opacity-100',
                    )}
                  >
                    {video ? (
                      <video src={url} muted className='size-full object-cover' />
                    ) : (
                      <img src={url} alt='' draggable={false} className='size-full object-cover' />
                    )}
                  </button>
                  <span className='pointer-events-none absolute left-0 top-0 bg-textColor px-1 leading-none'>
                    <Text className='!text-bgColor tabular-nums' size='small'>
                      {i + 1}
                    </Text>
                  </span>
                  {isPreview && (
                    <span className='pointer-events-none absolute inset-x-0 bottom-0 bg-textColor text-center leading-none'>
                      <Text className='!text-bgColor uppercase' size='small'>
                        preview
                      </Text>
                    </span>
                  )}
                  <button
                    type='button'
                    aria-label={`remove image ${i + 1}`}
                    onClick={() => handleRemoveMedia(v)}
                    className='absolute right-0 top-0 cursor-pointer border border-textInactiveColor bg-bgColor px-1 leading-none hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
                  >
                    [x]
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <MediaSelector
        label={addLabel}
        purpose={purpose}
        aspectRatio={pickerAspectRatio}
        allowMultiple
        showVideos
        saveSelectedMedia={handlePick}
        triggerClassName='uppercase px-3 py-1.5 cursor-pointer'
      />

      {/* Shared lightbox — pan + freehand draw (session-only markup). */}
      <MediaViewer items={viewerItems} {...viewer} />
    </div>
  );
}
