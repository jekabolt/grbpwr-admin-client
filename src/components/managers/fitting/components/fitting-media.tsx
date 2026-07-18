import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { ImageCallout, type AnnotatedCallout } from 'ui/components/annotated-image';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import { FittingFormData } from './schema';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const SLIDE_STEP = 176; // ~ one card + gap, keeps the ‹ › buttons in sync with card width

// Zoom/pan tuning for each slide's photo viewport — same "zoom toward the cursor" math as the
// media lightbox's useMediaStageGestures (src/ui/components/media-viewer-zoom.tsx), reimplemented
// here (rather than imported) since this carousel's frame is always exactly image-sized (no
// letterboxing/ResizeObserver needed) and each slide owns an independent zoom state.
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const WHEEL_STEP = 1.18;
const CLICK_MOVE_THRESHOLD = 6; // px of pointer travel below which a press counts as a click, not a pan/drag

type FormCallout = {
  number?: number;
  note?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};

// Fitting photos can be any aspect ratio — size each slide's frame from its own image
// dimensions instead of forcing every photo into one fixed ratio (which used to also force a
// crop-on-upload step). Falls back to a portrait default only if dimensions are unknown.
function mediaAspectRatio(media: common_MediaFull): string {
  const dim = media.media?.fullSize ?? media.media?.thumbnail;
  const w = dim?.width;
  const h = dim?.height;
  return w && h ? `${w}/${h}` : '3/4';
}

// The fitting's photos, shown as a horizontal carousel (task 5). Fit-note callouts are pinned
// directly on their photo — always-visible numbered markers, full note text on hover/focus —
// so a reviewer reads "what's wrong" in place instead of cross-referencing a separate list.
// A single "add callout" toggle (off by default) switches the whole carousel between VIEW mode
// (wheel-zoom toward the cursor, drag-to-pan, pinch on touch — plain clicks do nothing) and
// CALLOUT mode (clicking places a pin); this replaces the old always-on click-to-pin behavior,
// which made it impossible to zoom in on a photo without dropping a pin.
// The resolved-media map (saved fitting.media + freshly-picked) is owned by the parent
// FittingForm and shared with FittingCallouts' notes list, so a just-picked photo can be
// annotated without a save/reload.
export function FittingMedia({
  mediaById,
  onPicked,
}: {
  mediaById: Map<number, common_MediaFull>;
  onPicked: (items: common_MediaFull[]) => void;
}) {
  const { control, setValue } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: 'mediaIds' });
  const { fields, append, remove } = useFieldArray({ control, name: 'callouts' });
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const [calloutMode, setCalloutMode] = useState(false);

  const mediaIds = field.value ?? [];
  const mediaLinks = mediaIds
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) =>
    scrollerRef.current?.scrollBy({ left: dir * SLIDE_STEP, behavior: 'smooth' });

  function handleAdd(picked: common_MediaFull[]) {
    if (!picked.length) return;
    const unique = picked.filter((m) => !(field.value ?? []).includes(m.id || 0));
    if (!unique.length) return;
    onPicked(unique);
    const ids = unique.map((m) => m.id).filter((id): id is number => id != null);
    field.onChange([...(field.value ?? []), ...ids]);
  }

  function handleDelete(id: number) {
    field.onChange((field.value ?? []).filter((v) => v !== id));
  }

  // When a photo is removed from the fitting, un-pin any fit note that was on it — keep the
  // note text but drop the now-dead pin + coords so it isn't saved pointing at a media no
  // longer attached (which could never be shown/repositioned again).
  const prevMediaIdsRef = useRef<number[]>(mediaIds);
  useEffect(() => {
    const prev = prevMediaIdsRef.current;
    prevMediaIdsRef.current = mediaIds;
    const removed = prev.filter((id) => !mediaIds.includes(id));
    if (!removed.length) return;
    callouts.forEach((c, i) => {
      if (c.mediaId && removed.includes(c.mediaId)) {
        setValue(`callouts.${i}.mediaId`, 0, { shouldDirty: true });
        setValue(`callouts.${i}.posX`, '', { shouldDirty: true });
        setValue(`callouts.${i}.posY`, '', { shouldDirty: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaIds]);

  function addPinTo(mediaId: number, x: number, y: number) {
    append({
      number: fields.length + 1,
      note: '',
      mediaId,
      posX: x.toFixed(3),
      posY: y.toFixed(3),
    });
  }

  // Stable reference: it's a dependency of PhotoSlide's window pointermove/pointerup
  // listeners, so a fresh function on every keystroke elsewhere in this long form would
  // otherwise tear down and re-attach those listeners on every unrelated re-render.
  const movePin = useCallback(
    (index: number, x: number, y: number) => {
      setValue(`callouts.${index}.posX`, x.toFixed(3), { shouldDirty: true });
      setValue(`callouts.${index}.posY`, y.toFixed(3), { shouldDirty: true });
    },
    [setValue],
  );

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='inactive' size='small'>
          {mediaLinks.length === 0
            ? 'add a photo to start pinning fit notes'
            : calloutMode
              ? `${mediaLinks.length} photo${mediaLinks.length === 1 ? '' : 's'} · click a photo to place a callout`
              : `${mediaLinks.length} photo${mediaLinks.length === 1 ? '' : 's'} · scroll to zoom, drag to pan`}
        </Text>
        <div className='flex shrink-0 items-center gap-3'>
          {mediaLinks.length > 0 && (
            <ToggleSwitch
              checked={calloutMode}
              onCheckedChange={setCalloutMode}
              label='add callout'
            />
          )}
          {mediaLinks.length > 1 && (
            <div className='flex gap-1'>
              <button
                type='button'
                aria-label='scroll photos left'
                onClick={() => scrollBy(-1)}
                className='flex size-6 items-center justify-center border border-textInactiveColor hover:bg-highlightColor/5'
              >
                <ChevronLeftIcon />
              </button>
              <button
                type='button'
                aria-label='scroll photos right'
                onClick={() => scrollBy(1)}
                className='flex size-6 items-center justify-center border border-textInactiveColor hover:bg-highlightColor/5'
              >
                <ChevronRightIcon />
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className='flex snap-x snap-mandatory items-start gap-3 overflow-x-auto scroll-smooth pb-2'
      >
        {mediaLinks.map((m) => {
          const id = m.id || 0;
          const pins = callouts
            .map((c, index) => ({ ...c, index }))
            .filter((c) => c.mediaId === id);
          return (
            <PhotoSlide
              key={id}
              media={m}
              pins={pins}
              calloutMode={calloutMode}
              onAddPin={(x, y) => addPinTo(id, x, y)}
              onMovePin={movePin}
              onRemovePin={(index) => remove(index)}
              onDelete={() => handleDelete(id)}
            />
          );
        })}

        <div
          className='relative flex w-40 shrink-0 snap-start flex-col items-center justify-center gap-2 border border-dashed border-textInactiveColor sm:w-48'
          style={{ aspectRatio: '3/4' }}
        >
          <MediaSelector
            label='+ add photo'
            purpose='fitting photos'
            allowMultiple
            showVideos
            saveSelectedMedia={handleAdd}
            triggerClassName='px-3 py-1.5 cursor-pointer'
          />
          <Text variant='inactive' size='small'>
            any ratio · pick several at once
          </Text>
        </div>
      </div>
    </div>
  );
}

// One photo's slide: the image, its delete control, zoom/pan, and its own pin markers/drag
// handling. Coordinates are scoped to this slide's own bounding box, so multiple photos in the
// carousel never fight over a single "active image" the way the old tab-switcher did, and each
// slide keeps its own independent zoom level.
//
// Pins are rendered *inside* the same transformed "stage" element as the <img> (both children
// of one div that gets `translate + scale`), so their `left/top: N%` positioning tracks the
// image automatically under zoom/pan via plain CSS — no per-pin screen-position math needed.
// The only math required is the inverse: turning a click/drag's screen point back into the
// image's normalized 0..1 space, which `coords()` below does by undoing the current pan/zoom.
function PhotoSlide({
  media,
  pins,
  calloutMode,
  onAddPin,
  onMovePin,
  onRemovePin,
  onDelete,
}: {
  media: common_MediaFull;
  pins: Array<FormCallout & { index: number }>;
  calloutMode: boolean;
  onAddPin: (x: number, y: number) => void;
  onMovePin: (index: number, x: number, y: number) => void;
  onRemovePin: (index: number) => void;
  onDelete: () => void;
}) {
  const url = media.media?.thumbnail?.mediaUrl || media.media?.fullSize?.mediaUrl || '';
  const wrapRef = useRef<HTMLDivElement>(null);

  // Zoom/pan state: refs hold the live values so event handlers/effects never read a stale
  // closure; mirrored into state to drive re-renders of the transform + controls.
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const [scale, setScaleState] = useState(1);
  const [pos, setPosState] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const setScale = (s: number) => {
    scaleRef.current = s;
    setScaleState(s);
  };
  const setPos = (p: { x: number; y: number }) => {
    posRef.current = p;
    setPosState(p);
  };

  const dragIdxRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false); // guards a plain click (open note) from committing a move
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ idx: number; x: number; y: number } | null>(null);

  // Screen point -> normalized 0..1 image coords, undoing the current pan/zoom transform so
  // new/dragged pins land at the right spot on the underlying photo no matter how far it's
  // zoomed or panned.
  function coords(clientX: number, clientY: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const s = scaleRef.current;
    const p = posRef.current;
    return {
      x: clamp01(0.5 + (cx - p.x) / s / rect.width),
      y: clamp01(0.5 + (cy - p.y) / s / rect.height),
    };
  }

  function clampPan(x: number, y: number, s: number, w: number, h: number) {
    const maxX = Math.max(0, (w * s - w) / 2);
    const maxY = Math.max(0, (h * s - h) / 2);
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }

  // Zoom while keeping the point under (clientX, clientY) fixed on screen.
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const prevScale = scaleRef.current;
    const nextScale = clamp(prevScale * factor, MIN_SCALE, MAX_SCALE);
    if (nextScale === prevScale) return;
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const ratio = nextScale / prevScale;
    const prevPos = posRef.current;
    const next = clampPan(
      cx - (cx - prevPos.x) * ratio,
      cy - (cy - prevPos.y) * ratio,
      nextScale,
      rect.width,
      rect.height,
    );
    setScale(nextScale);
    setPos(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  // Wheel-zoom needs a real (non-passive) DOM listener: React's synthetic onWheel is attached
  // passively, so calling preventDefault() there can't stop the page from also scrolling while
  // the cursor is over a photo.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.deltaY === 0) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Existing-pin drag: window-level listeners (not React handlers) so a fast drag that leaves
  // this small card's bounds still tracks correctly. Unchanged apart from `coords()` now being
  // zoom-aware.
  useEffect(() => {
    function move(e: PointerEvent) {
      if (dragIdxRef.current == null) return;
      const p = coords(e.clientX, e.clientY);
      dragPosRef.current = p;
      dragMovedRef.current = true;
      setDragPos({ idx: dragIdxRef.current, ...p });
    }
    function up() {
      const idx = dragIdxRef.current;
      const p = dragPosRef.current;
      // Only commit when the pin actually moved — a plain click just opens its note and must
      // not mark the form dirty with an identical position.
      if (idx != null && p && dragMovedRef.current) onMovePin(idx, p.x, p.y);
      dragIdxRef.current = null;
      dragMovedRef.current = false;
      dragPosRef.current = null;
      setDragPos(null);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMovePin]);

  // Background gesture on the viewport: one pointer, zoomed in, drags to pan. A press that
  // barely moves is a "click" — in callout mode that places a new pin; in view mode it's a
  // no-op (so zoom/pan is the only thing a plain click can do there). Two pointers pinch-zoom.
  // A pin's own onPointerDown (below) stops propagation, so none of this fires for pin drags.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ prevDist: number } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
    moved: boolean;
  } | null>(null);

  function handleWrapPointerDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      panRef.current = null; // a 2nd finger landed mid-pan: hand off to pinch
      const [a, b] = Array.from(pointersRef.current.values());
      if (a && b) pinchRef.current = { prevDist: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (pointersRef.current.size !== 1) return; // a 3rd+ finger: ignore

    panRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPosX: posRef.current.x,
      startPosY: posRef.current.y,
      moved: false,
    };
  }

  function handleWrapPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchRef.current.prevDist > 0) {
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinchRef.current.prevDist);
      }
      pinchRef.current.prevDist = dist;
      return;
    }

    const p = panRef.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const dx = e.clientX - p.startClientX;
    const dy = e.clientY - p.startClientY;
    if (!p.moved && Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) {
      p.moved = true;
      setIsPanning(true);
    }
    if (p.moved && scaleRef.current > 1) {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos(
        clampPan(p.startPosX + dx, p.startPosY + dy, scaleRef.current, rect.width, rect.height),
      );
    }
  }

  function resetWrapPointer(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (panRef.current?.pointerId === e.pointerId) {
      panRef.current = null;
      setIsPanning(false);
    }
  }

  function handleWrapPointerUp(e: React.PointerEvent) {
    const p = panRef.current;
    const isPanPointer = p?.pointerId === e.pointerId;
    resetWrapPointer(e);
    if (isPanPointer && p && !p.moved && calloutMode) {
      const { x, y } = coords(e.clientX, e.clientY);
      onAddPin(x, y);
    }
  }

  function handleWrapPointerCancel(e: React.PointerEvent) {
    resetWrapPointer(e);
  }

  const isZoomed = scale > 1;
  const cursorClass = calloutMode
    ? 'cursor-crosshair'
    : isZoomed
      ? isPanning
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : 'cursor-zoom-in';

  return (
    <div className='relative shrink-0 snap-start'>
      <div
        ref={wrapRef}
        className='relative w-40 touch-none overflow-hidden border border-textInactiveColor sm:w-48'
        style={{ aspectRatio: mediaAspectRatio(media) }}
        onPointerDown={handleWrapPointerDown}
        onPointerMove={handleWrapPointerMove}
        onPointerUp={handleWrapPointerUp}
        onPointerCancel={handleWrapPointerCancel}
      >
        <div
          className={cn('absolute inset-0', cursorClass)}
          style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})` }}
        >
          <img
            src={url}
            alt=''
            className='absolute inset-0 h-full w-full select-none object-cover'
            draggable={false}
          />
          {pins.map((c) => {
            const dragging = dragPos?.idx === c.index;
            const x = dragging ? dragPos!.x : parseFloat(c.posX ?? '');
            const y = dragging ? dragPos!.y : parseFloat(c.posY ?? '');
            if (Number.isNaN(x) || Number.isNaN(y)) return null;
            const data: AnnotatedCallout = {
              key: String(c.index),
              number: c.number ?? c.index + 1,
              xNorm: x,
              yNorm: y,
              hasText: !!c.note?.trim(),
            };
            return (
              <ImageCallout
                key={c.index}
                data={data}
                title='fit note'
                scale={scale}
                showAll={isZoomed}
                editable
                pinSize='sm'
                noteClassName='w-52'
                dragging={dragging}
                dragPos={dragging ? { x, y } : null}
                onPinPointerDown={(e) => {
                  e.stopPropagation();
                  dragIdxRef.current = c.index;
                  dragMovedRef.current = false;
                  const p = coords(e.clientX, e.clientY);
                  dragPosRef.current = p;
                  setDragPos({ idx: c.index, ...p });
                }}
                onRemove={() => onRemovePin(c.index)}
                renderNote={({ close }) => <FitNoteBody index={c.index} onDone={close} />}
              />
            );
          })}
        </div>

        {isZoomed && (
          <button
            type='button'
            aria-label='reset zoom'
            title='reset zoom'
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              resetZoom();
            }}
            className='absolute bottom-1 left-1 z-20 cursor-pointer border border-textInactiveColor bg-bgColor px-1 text-textBaseSize leading-none tabular-nums hover:bg-textColor hover:text-bgColor'
          >
            {Math.round(scale * 100)}%
          </button>
        )}
      </div>
      <button
        type='button'
        aria-label='remove photo'
        onClick={onDelete}
        className='absolute right-1 top-1 z-20 cursor-pointer border border-textInactiveColor bg-bgColor px-1 leading-none hover:bg-textColor hover:text-bgColor'
      >
        [x]
      </button>
    </div>
  );
}

// The editable body of one fit-note sticky note (the text behind a pin). Bound straight to the
// shared `callouts` field array, so edits here and in the FittingCallouts list stay in sync.
function FitNoteBody({ index, onDone }: { index: number; onDone: () => void }) {
  const { control } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: `callouts.${index}.note` });
  return (
    <textarea
      {...field}
      value={field.value ?? ''}
      rows={3}
      maxLength={2000}
      placeholder='что не так с посадкой…'
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
          onDone();
        }
      }}
      className='w-full resize-none border border-textInactiveColor bg-bgColor p-1.5 text-textBaseSize text-textColor placeholder:text-textInactiveColor focus:border-textColor focus:outline-none'
    />
  );
}
