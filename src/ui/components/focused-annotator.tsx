import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMedia } from 'components/managers/media/utils/useMediaQuery';
import { useUploadMedia } from 'components/managers/media/utils/useUploadMedia';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AnnotatedImage, type AnnotatedCallout } from './annotated-image';
import { Button } from './button';
import { Chip, ChipRow } from './chip';
import { MediaViewer, mediaFullListToViewerItems, useMediaViewer } from './media-viewer';
import { Placeholder } from './placeholder';
import Text from './text';
import { Toolbar, ToolbarSpacer } from './toolbar';

// An annotate-in-place gallery. Two layouts over one set of bindings:
//
//   `focused`  ONE large image + a thumbnail carousel (the fitting photos).
//   `grid`     EVERY view visible at once, each with its own pins (the tech-card sketch and
//              moodboard). Comparing front to back is how a fitting conversation actually goes,
//              so nothing should have to be clicked to see both.
//
// It owns only the interaction grammar — the numbered callout PINS + hover/edit/✕ notes ride the
// shared AnnotatedImage, so the phantom-callout hardening there (a ✕ press or an out-of-bounds
// click never drops a pin) is inherited by every surface that reuses this component.
//
// Everything form- or domain-specific is injected: the resolved media (`views`), the callouts for
// an image (`calloutsFor` + the add/move/remove/render callbacks), how a picked image is committed
// (`onPickMedia`), and any per-image caption controls (`renderFocusedFooter`). That keeps the same
// gallery driving the tech-card moodboard + technical sketch AND the fitting photos, each binding
// its own React Hook Form fields, without this component knowing which form it sits in.

/** One resolved, URL-bearing image the gallery shows. `key` is a stable React identity. */
export type FocusedView = {
  key: string;
  mediaId: number;
  full: common_MediaFull;
};

/** How many library items the inline "recent" strip offers before you must browse the archive. */
const RECENT_COUNT = 5;

const mediaUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

const thumbUrl = (full?: common_MediaFull): string =>
  full?.media?.thumbnail?.mediaUrl || full?.media?.fullSize?.mediaUrl || '';

// Frame each image to the media's own aspect ratio so the picture fills it exactly (no crop,
// no letterbox) — which keeps every pin mapped 1:1 onto the image it was placed on. Fitting photos
// are unconstrained, so the fallback is only used when the media carries no dimensions. This is
// also why the grid does NOT force a uniform 3/4 tile: a forced ratio would crop the picture out
// from under its own pins.
function mediaAspect(full: common_MediaFull | undefined, fallback: string): string {
  const dim = full?.media?.fullSize ?? full?.media?.thumbnail;
  const w = dim?.width;
  const h = dim?.height;
  return w && h ? `${w}/${h}` : fallback;
}

const isMediaFile = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/');

// Drag-and-drop plumbing for a single drop target. Kept local (rather than reusing the media
// manager's DragDropArea) because that one is bound to the manager's pending-files queue, while
// here a dropped file must go straight up through `onPickMedia`.
function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
  };
  return { dragging, handlers };
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

  /** `focused` = one big image + thumbs. `grid` = every view at once, each with its own pins. */
  layout?: 'focused' | 'grid';
  notesMode: 'hover' | 'auto';
  pinSize: 'sm' | 'md';
  emptyLabel: string;
  /** Aspect used only when a media has no known dimensions (e.g. '4/5', '3/4'). */
  fallbackAspect?: string;
  /** Show a "preview" badge on the first thumbnail (the surface's card preview). */
  previewFirst?: boolean;
  /** Accessible name for an image + lightbox (per image). */
  mediaLabel?: (view: FocusedView, positionInViews: number) => string;
  /** Caption controls under an image (kind select, "set as preview", …). In `grid` this renders
   *  under EVERY cell; in `focused` only under the focused image. */
  renderFocusedFooter?: (view: FocusedView, positionInViews: number) => ReactNode;
  /** Accessible label for the thumbnail carousel / the grid. */
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
  layout = 'focused',
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
  const [uploading, setUploading] = useState(false);
  const viewer = useMediaViewer();
  const uploadMedia = useUploadMedia();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGrid = layout === 'grid';
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

  // Drop / browse straight into the gallery: upload each file, then commit the resolved media the
  // same way a library pick would. Failures are already surfaced by the upload hook's snackbar, so
  // one bad file in a batch doesn't lose the rest.
  async function handleFiles(files: File[]) {
    const accepted = files.filter(isMediaFile);
    if (!accepted.length) return;
    setUploading(true);
    const added: common_MediaFull[] = [];
    for (const file of accepted) {
      try {
        added.push(await uploadMedia.mutateAsync(file));
      } catch {
        /* surfaced by useUploadMedia */
      }
    }
    setUploading(false);
    if (added.length) handlePick(added);
  }

  const openFilePicker = () => fileInputRef.current?.click();

  const modeToggles = (
    <ChipRow>
      {notesMode === 'auto' && (
        <Chip
          selected={showAllNotes}
          pressed={showAllNotes}
          onClick={() => setShowAllNotes((v) => !v)}
        >
          show all notes
        </Chip>
      )}
      <Chip selected={addMode} pressed={addMode} onClick={() => setAddMode((v) => !v)}>
        add callout
      </Chip>
    </ChipRow>
  );

  const hint = addMode
    ? 'click an image to drop a callout · drag a pin to move it'
    : 'hover a pin to read · click a pin to edit · use zoom to draw';

  return (
    <div className='space-y-2.5'>
      {/* One hidden input serves both the "+ add view" tile and the drop zone's click-to-upload. */}
      <input
        ref={fileInputRef}
        type='file'
        accept='image/*,video/*'
        multiple
        className='hidden'
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []));
          // Reset so picking the same file twice in a row still fires a change.
          e.target.value = '';
        }}
      />

      {hasMedia &&
        (isGrid ? (
          // The toggles are modes of the whole sheet now, not of one focused image — so they sit
          // in a bar above the grid and apply to every cell at once.
          <Toolbar>
            <Text size='micro' variant='label' component='span'>
              {hint}
            </Text>
            <ToolbarSpacer />
            {modeToggles}
          </Toolbar>
        ) : (
          <div className='flex flex-wrap items-center justify-between gap-2.5'>
            <Text size='micro' variant='label' component='span'>
              {hint}
            </Text>
            {modeToggles}
          </div>
        ))}

      {isGrid ? (
        <>
          <div
            aria-label={carouselLabel}
            className='grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] items-start gap-2'
          >
            {views.map((v, i) => {
              const url = mediaUrl(v.full);
              return (
                <div key={v.key} className='relative min-w-0 space-y-1'>
                  <AnnotatedImage
                    src={url}
                    alt={mediaLabel ? mediaLabel(v, i) : ''}
                    type={isVideo(url) ? 'video' : 'image'}
                    aspectRatio={mediaAspect(v.full, fallbackAspect)}
                    callouts={calloutsFor(v.mediaId)}
                    editable
                    addMode={addMode}
                    zoomable={false}
                    notesMode={notesMode}
                    showAllNotes={showAllNotes}
                    pinSize={pinSize}
                    // A 240px note over a 180px tile needs trimming; the lightbox keeps the full card.
                    noteClassName='w-44'
                    onAdd={(x, y) => onAddCallout(v.mediaId, x, y)}
                    onMove={onMoveCallout}
                    onRemove={onRemoveCallout}
                    noteTitle={noteTitle}
                    renderNote={renderNote}
                    cornerSlot={
                      <div className='flex items-center gap-1'>
                        <FrameButton
                          ariaLabel={`zoom · pan · draw — image ${i + 1}`}
                          onPress={() => viewer.openAt(i)}
                        >
                          zoom
                        </FrameButton>
                        <FrameButton
                          ariaLabel={`remove image ${i + 1}`}
                          onPress={() => handleRemoveMedia(v)}
                        >
                          ✕
                        </FrameButton>
                      </div>
                    }
                  />
                  {/* Position marker — pieces / operations / the "pinned to" select all address
                      images by this number. */}
                  <span className='pointer-events-none absolute left-0 top-0 z-[4] bg-textColor px-1 py-px text-nano leading-none tabular-nums text-bgColor'>
                    {i + 1}
                  </span>
                  {renderFocusedFooter?.(v, i)}
                </div>
              );
            })}

            {/* "+ add view" — a dashed slot in the grid itself, so adding an image is one click
                from where the gap is, with no modal in the way. */}
            <AddTile
              aspect={fallbackAspect}
              busy={uploading}
              onFiles={handleFiles}
              onClick={openFilePicker}
            />
          </div>

          {!hasMedia && (
            <Text size='micro' variant='label'>
              {emptyLabel}
            </Text>
          )}

          <AddImageStrip
            addLabel={addLabel}
            purpose={purpose}
            pickerAspectRatio={pickerAspectRatio}
            busy={uploading}
            onFiles={handleFiles}
            onClickUpload={openFilePicker}
            onPick={handlePick}
          />
        </>
      ) : !hasMedia ? (
        <Text size='micro' variant='label'>
          {emptyLabel}
        </Text>
      ) : (
        <div className='space-y-2.5'>
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
                  <FrameButton
                    ariaLabel='zoom · pan · draw'
                    onPress={() => viewer.openAt(focusedViewerIndex)}
                  >
                    zoom
                  </FrameButton>
                }
              />

              {renderFocusedFooter?.(focused, focusedPosition)}
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
                        ? 'border-textColor outline outline-1 outline-offset-1 outline-textColor'
                        : 'border-borderColor opacity-70 hover:opacity-100',
                    )}
                  >
                    {video ? (
                      <video src={url} muted className='size-full object-cover' />
                    ) : (
                      <img src={url} alt='' draggable={false} className='size-full object-cover' />
                    )}
                  </button>
                  <span className='pointer-events-none absolute left-0 top-0 bg-textColor px-1 py-px text-nano leading-none tabular-nums text-bgColor'>
                    {i + 1}
                  </span>
                  {isPreview && (
                    <span className='pointer-events-none absolute inset-x-0 bottom-0 bg-textColor px-1 py-px text-center text-nano uppercase leading-none tracking-label text-bgColor'>
                      preview
                    </span>
                  )}
                  <button
                    type='button'
                    aria-label={`remove image ${i + 1}`}
                    onClick={() => handleRemoveMedia(v)}
                    className='absolute right-0 top-0 cursor-pointer border border-borderColor bg-bgColor px-1 py-px text-nano leading-none hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <MediaSelector
            label={addLabel}
            purpose={purpose}
            aspectRatio={pickerAspectRatio}
            allowMultiple
            showVideos
            saveSelectedMedia={handlePick}
            trigger={
              <Button type='button' variant='main' size='sm'>
                {addLabel}
              </Button>
            }
          />
        </div>
      )}

      {/* Shared lightbox — pan + freehand draw (session-only markup). */}
      <MediaViewer items={viewerItems} {...viewer} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// A control floating on an image frame (zoom, remove). It has to swallow its own pointer
// gestures, or the press underneath reaches the Stage's add-callout / pan handler.
// ---------------------------------------------------------------------------

function FrameButton({
  ariaLabel,
  onPress,
  children,
}: {
  ariaLabel: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type='button'
      variant='secondary'
      size='xs'
      aria-label={ariaLabel}
      className='cursor-pointer bg-bgColor'
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onPress();
      }}
    >
      {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// The "+ add view" grid cell — a dashed slot that is both a click-to-upload target and a drop
// target, so the empty spot in the grid is itself the control that fills it.
// ---------------------------------------------------------------------------

function AddTile({
  aspect,
  busy,
  onFiles,
  onClick,
}: {
  aspect: string;
  busy: boolean;
  onFiles: (files: File[]) => void;
  onClick: () => void;
}) {
  const { dragging, handlers } = useFileDrop(onFiles);
  return (
    <button
      type='button'
      onClick={onClick}
      {...handlers}
      aria-label='add view'
      className='block w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
    >
      <Placeholder
        dashed
        label={busy ? 'uploading…' : dragging ? 'drop to add' : '+ add view'}
        // The ratio lives on the placeholder itself, so it never depends on a percentage
        // height resolving against the button.
        style={{ aspectRatio: aspect }}
        className={cn('w-full', dragging && 'border-textColor text-textColor')}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// The add-image strip — drop zone + the most recent library items inline, with the full library
// dialog demoted to "browse all…". No overlay in the common case: the sheet you are adding to
// stays on screen while you add to it.
// ---------------------------------------------------------------------------

function AddImageStrip({
  addLabel,
  purpose,
  pickerAspectRatio,
  busy,
  onFiles,
  onClickUpload,
  onPick,
}: {
  addLabel: string;
  purpose: string;
  pickerAspectRatio?: string[];
  busy: boolean;
  onFiles: (files: File[]) => void;
  onClickUpload: () => void;
  onPick: (items: common_MediaFull[]) => void;
}) {
  const { data: recent } = useMedia(RECENT_COUNT, 0);
  const { dragging, handlers } = useFileDrop(onFiles);

  return (
    <div className='border border-borderColor bg-bgColor p-2.5'>
      <div className='mb-1.5 flex flex-wrap items-center gap-2'>
        <Text
          size='micro'
          variant='uppercase'
          tracking='group'
          component='span'
          className='font-bold'
        >
          add image
        </Text>
        <ToolbarSpacer />
        <Text size='micro' variant='label' component='span'>
          recent
        </Text>
        <MediaSelector
          label={addLabel}
          purpose={purpose}
          aspectRatio={pickerAspectRatio}
          allowMultiple
          showVideos
          saveSelectedMedia={onPick}
          trigger={
            <Button type='button' variant='secondary' size='sm'>
              browse all…
            </Button>
          }
        />
      </div>

      <div className='flex items-stretch gap-1.5'>
        <button
          type='button'
          onClick={onClickUpload}
          {...handlers}
          className='flex min-h-[52px] flex-1 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        >
          <Placeholder
            dashed
            label={
              busy
                ? 'uploading…'
                : dragging
                  ? 'drop to upload'
                  : 'drop files here or click to upload'
            }
            className={cn('w-full px-2 text-center', dragging && 'border-textColor text-textColor')}
          />
        </button>

        {(recent ?? [])
          .filter((m) => m.id != null)
          .map((m) => {
            const url = thumbUrl(m);
            const video = isVideo(mediaUrl(m)) || isVideo(url);
            return (
              <button
                key={m.id}
                type='button'
                aria-label='add this recent image'
                onClick={() => onPick([m])}
                className='size-[52px] shrink-0 cursor-pointer overflow-hidden border border-borderColor hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                {video ? (
                  <video src={url} muted className='size-full object-cover' />
                ) : (
                  <img src={url} alt='' draggable={false} className='size-full object-cover' />
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
