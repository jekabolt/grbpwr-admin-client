'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { cn } from 'lib/utility';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import Text from './text';

// A reusable image-annotation surface: numbered callout PINS placed on an image at normalised
// (0..1) coordinates, each backed by a small STICKY NOTE holding its editable text.
//
// One component drives three admin surfaces (tech-card moodboard tiles + technical sketch,
// fitting photos) so the interaction grammar is identical everywhere:
//   • pins + notes are anchored to the image, so they track the same wheel/drag/pinch zoom;
//   • hovering OR keyboard-focusing a pin pops its note (a portalled Popover — never clipped by
//     the frame, with a tail that points back at the pin);
//   • in VIEW / ZOOM mode every note is shown at once, rendered inline so it rides the transform;
//   • the note body is caller-supplied (`renderNote`) so each surface keeps its own RHF fields.
//
// Monochrome by design: this admin is a black-on-white console, so a "sticky note" here is a
// hard-bordered card with a 1px tail, not a skeuomorphic pastel square. State is carried by
// shape + fill (a hollow pin = no text yet), never by colour alone.

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const WHEEL_STEP = 1.18;
const CLICK_MOVE_THRESHOLD = 6; // px of travel below which a press is a click, not a drag/pan
const NOTE_GAP = 18; // px between a pin and its inline note (screen-constant)

export type AnnotatedCallout = {
  /** Stable identity (use the RHF field-array `id`). */
  key: string;
  /** Number shown on the pin + note. */
  number: number;
  /** Normalised marker position, 0..1. */
  xNorm: number;
  yNorm: number;
  /** Whether the note already has text (drives the hollow "needs a note" pin). */
  hasText: boolean;
};

// ---------------------------------------------------------------------------
// Pin — the numbered marker. forwardRef + prop-spread so it can be a Popover.Anchor.
// ---------------------------------------------------------------------------

const pinSizes = {
  sm: 'size-[18px] text-[10px]',
  md: 'size-6 text-[11px]',
} as const;

type CalloutPinProps = {
  number: number;
  hasText: boolean;
  active?: boolean;
  size?: keyof typeof pinSizes;
  draggable?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const CalloutPin = forwardRef<HTMLButtonElement, CalloutPinProps>(function CalloutPin(
  { number, hasText, active, size = 'md', draggable, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type='button'
      className={cn(
        'flex items-center justify-center rounded-full border-2 font-medium leading-none tabular-nums transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        pinSizes[size],
        hasText
          ? 'border-bgColor bg-textColor text-bgColor'
          : 'border-textColor bg-bgColor text-textColor',
        active && 'outline outline-2 outline-offset-2 outline-textColor',
        draggable ? 'cursor-move' : 'cursor-pointer',
        className,
      )}
      {...props}
    >
      {number}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Note shell — the card visual. Body (`children`) is caller-supplied so each surface keeps
// its own RHF-bound fields; this only owns the frame, the number, and the remove control.
// ---------------------------------------------------------------------------

function StickyNote({
  number,
  title,
  editable,
  onRemove,
  className,
  children,
}: {
  number: number;
  title?: string;
  editable?: boolean;
  onRemove?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      // The note is an interactive child of the image surface (inline it lives inside the
      // transformed stage; as a hover Popover it is portalled but STILL bubbles through the React
      // tree). Swallow its pointer gestures so a press on the note body or the ✕ remove control can
      // never reach the Stage's background add-callout / pan handler — the root of the phantom
      // callout that used to appear when closing a note.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className={cn(
        'w-64 max-w-[min(16rem,72vw)] border border-textColor bg-bgColor text-left',
        'shadow-[0_2px_10px_rgba(0,0,0,0.12)]',
        className,
      )}
    >
      <div className='flex items-center justify-between gap-2 border-b border-textInactiveColor px-2 py-1'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <span className='flex size-4 shrink-0 items-center justify-center bg-textColor text-[10px] leading-none tabular-nums text-bgColor'>
            {number}
          </span>
          <Text variant='label' size='small' className='truncate uppercase'>
            {title || 'note'}
          </Text>
        </span>
        {editable && onRemove && (
          <button
            type='button'
            onClick={onRemove}
            aria-label={`remove callout ${number}`}
            className='shrink-0 px-1 leading-none text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
          >
            [x]
          </button>
        )}
      </div>
      <div className='p-2'>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageCallout — one pin plus its note. Compact mode shows the note in a portalled Popover on
// hover/focus (never clipped); show-all mode renders it inline so it tracks pan/zoom. Exported
// so a surface with its OWN zoom/pan (the fitting carousel) can reuse the exact pin + note
// grammar without adopting AnnotatedImage's frame — the caller owns drag state and passes
// `scale` + `showAll`.
// ---------------------------------------------------------------------------

export type ImageCalloutProps = {
  data: AnnotatedCallout;
  title?: string;
  /** Current stage scale, so the pin + note stay screen-constant under zoom. */
  scale: number;
  /** Show the note inline (view/zoom mode) instead of a hover Popover. */
  showAll: boolean;
  editable: boolean;
  pinSize?: keyof typeof pinSizes;
  /** Override the note width (e.g. a narrower card for the small fitting frames). */
  noteClassName?: string;
  dragging?: boolean;
  dragPos?: { x: number; y: number } | null;
  onPinPointerDown?: (e: ReactPointerEvent) => void;
  onRemove?: () => void;
  renderNote: (opts: { close: () => void }) => ReactNode;
};

export function ImageCallout({
  data,
  title,
  scale,
  showAll,
  editable,
  pinSize = 'md',
  noteClassName,
  dragging = false,
  dragPos = null,
  onPinPointerDown,
  onRemove,
  renderNote,
}: ImageCalloutProps) {
  const [open, setOpen] = useState(false);
  const pinnedRef = useRef(false); // clicked-open: survives pointer-leave
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const x = dragging && dragPos ? dragPos.x : data.xNorm;
  const y = dragging && dragPos ? dragPos.y : data.yNorm;
  const inv = 1 / (scale || 1);

  const clearClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const openNow = useCallback(() => {
    clearClose();
    setOpen(true);
  }, [clearClose]);
  const closeSoon = useCallback(() => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      if (!pinnedRef.current) setOpen(false);
    }, 140);
  }, [clearClose]);
  useEffect(() => () => clearClose(), [clearClose]);

  const close = useCallback(() => {
    pinnedRef.current = false;
    setOpen(false);
  }, []);

  // Inline note (show-all): opens toward image centre so it stays on-frame; a 1px tail links
  // it back to the pin. Everything lives inside the inverse-scaled box, so px are screen px.
  const onRight = x <= 0.5;
  const inlineNoteStyle: React.CSSProperties = onRight
    ? { left: 0, top: 0, transform: `translate(${NOTE_GAP}px, -50%)` }
    : { left: 0, top: 0, transform: `translate(calc(-100% - ${NOTE_GAP}px), -50%)` };
  const tailStyle: React.CSSProperties = onRight
    ? { left: 0, top: 0, width: NOTE_GAP, transform: 'translateY(-0.5px)' }
    : { left: -NOTE_GAP, top: 0, width: NOTE_GAP, transform: 'translateY(-0.5px)' };

  return (
    <div
      className='pointer-events-none absolute'
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, zIndex: open ? 3 : 2 }}
    >
      <div style={{ transform: `scale(${inv})`, transformOrigin: '0 0' }}>
        {/* show-all tail + inline note */}
        {showAll && (
          <>
            <span
              aria-hidden
              className='pointer-events-none absolute block h-px bg-textColor'
              style={tailStyle}
            />
            <div className='pointer-events-auto absolute' style={inlineNoteStyle}>
              <StickyNote
                number={data.number}
                title={title}
                editable={editable}
                onRemove={onRemove}
                className={noteClassName}
              >
                {renderNote({ close })}
              </StickyNote>
            </div>
          </>
        )}

        {/* pin, centred on the anchor */}
        <Popover.Root open={!showAll && open} onOpenChange={(o) => (o ? openNow() : close())}>
          <Popover.Anchor asChild>
            <div className='pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2'>
              <CalloutPin
                ref={pinRef}
                number={data.number}
                hasText={data.hasText}
                active={showAll || open}
                size={pinSize}
                draggable={editable}
                aria-label={`callout ${data.number}${data.hasText ? '' : ' (no note yet)'}`}
                aria-expanded={showAll ? undefined : open}
                onPointerDown={editable ? onPinPointerDown : undefined}
                onPointerEnter={showAll ? undefined : openNow}
                onPointerLeave={showAll ? undefined : closeSoon}
                onFocus={showAll ? undefined : openNow}
                onBlur={showAll ? undefined : closeSoon}
                onClick={(e) => {
                  e.stopPropagation();
                  if (showAll) return;
                  // Click / Enter / Space pins the note open and moves focus into it to edit.
                  // (Hover- and focus-open only "peek": autofocus is suppressed below so tabbing
                  // past a pin never yanks the caret into a note.)
                  pinnedRef.current = true;
                  setOpen(true);
                  requestAnimationFrame(() => contentRef.current?.focus());
                }}
              />
            </div>
          </Popover.Anchor>
          {!showAll && (
            <Popover.Portal>
              <Popover.Content
                ref={contentRef}
                side='top'
                align='center'
                sideOffset={8}
                collisionPadding={10}
                className='z-[var(--z-popover)] focus:outline-none'
                // Never auto-focus on open — opening is driven by hover/focus "peek"; the pin's
                // onClick focuses the content explicitly when the user actually wants to edit.
                onOpenAutoFocus={(e) => e.preventDefault()}
                onPointerEnter={clearClose}
                onPointerLeave={closeSoon}
                onEscapeKeyDown={() => {
                  close();
                  pinRef.current?.focus();
                }}
              >
                <StickyNote
                  number={data.number}
                  title={title}
                  editable={editable}
                  onRemove={onRemove}
                  className={noteClassName}
                >
                  {renderNote({ close })}
                </StickyNote>
                <Popover.Arrow className='fill-bgColor' width={12} height={6} />
              </Popover.Content>
            </Popover.Portal>
          )}
        </Popover.Root>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnnotatedImage — image + optional zoom/pan + pins + notes + click-to-add.
// ---------------------------------------------------------------------------

export type AnnotatedImageProps = {
  src: string;
  alt: string;
  type?: 'image' | 'video';
  /** Frame aspect ratio (e.g. '3/4'); the media fills it so pins map 1:1 to the picture. */
  aspectRatio?: string;
  /** Sizing utilities for the frame (width/height). */
  className?: string;
  callouts: AnnotatedCallout[];
  /** Editable note body for one callout (RHF fields live in the caller). */
  renderNote: (key: string, opts: { close: () => void }) => ReactNode;
  /** Optional header title inside a note (e.g. a part code). */
  noteTitle?: (key: string) => string | undefined;
  /** Pins draggable, notes editable, remove shown. */
  editable?: boolean;
  /** Clicking empty canvas drops a new pin there. */
  addMode?: boolean;
  onAdd?: (xNorm: number, yNorm: number) => void;
  onMove?: (key: string, xNorm: number, yNorm: number) => void;
  onRemove?: (key: string) => void;
  /** Wheel/drag/pinch zoom inside the frame. */
  zoomable?: boolean;
  /** 'hover' = notes only on hover/focus; 'auto' = every note inline once zoomed or forced. */
  notesMode?: 'hover' | 'auto';
  /** Force show-all inline notes (a "view" toggle); also implied by zooming in 'auto' mode. */
  showAllNotes?: boolean;
  pinSize?: keyof typeof pinSizes;
  /** Overlaid on the frame's top-right (e.g. a remove-photo control). */
  cornerSlot?: ReactNode;
};

// ---------------------------------------------------------------------------
// Stage — the interactive image surface: the picture, its pins + notes, click-to-add, and (only
// when `zoom`) wheel/drag/pinch zoom + pan. AnnotatedImage renders it twice: inline as a PASSIVE
// tile (zoom OFF — the page scrolls normally over it and a plain view-mode click opens the
// enlarged view) and inside the enlarged dialog (zoom ON — every pan/zoom gesture lives here, so
// the inline grid can never hijack the wheel).
// ---------------------------------------------------------------------------

type StageProps = {
  src: string;
  alt: string;
  type: 'image' | 'video';
  aspectRatio: string;
  /** Sizing utilities for the frame (the inline tile fills its cell; the enlarged frame is
   *  capped to the viewport via `frameStyle`). */
  frameClassName?: string;
  frameStyle?: React.CSSProperties;
  callouts: AnnotatedCallout[];
  renderNote: (key: string, opts: { close: () => void }) => ReactNode;
  noteTitle?: (key: string) => string | undefined;
  editable: boolean;
  addMode: boolean;
  onAdd?: (xNorm: number, yNorm: number) => void;
  onMove?: (key: string, xNorm: number, yNorm: number) => void;
  onRemove?: (key: string) => void;
  /** Wheel/drag/pinch zoom + pan active — the enlarged view only. */
  zoom: boolean;
  /** Render every note inline instead of a hover Popover. */
  showAll: boolean;
  pinSize: keyof typeof pinSizes;
  cornerSlot?: ReactNode;
  /** A plain (non-drag) click on empty canvas in VIEW mode. The inline tile passes this to open
   *  the enlarged view; the enlarged view leaves it undefined so a plain click there does
   *  nothing (pan/zoom is the only background gesture). */
  onBackgroundView?: () => void;
};

function Stage({
  src,
  alt,
  type,
  aspectRatio,
  frameClassName,
  frameStyle,
  callouts,
  renderNote,
  noteTitle,
  editable,
  addMode,
  onAdd,
  onMove,
  onRemove,
  zoom,
  showAll,
  pinSize,
  cornerSlot,
  onBackgroundView,
}: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Zoom/pan: refs hold live values for event handlers, mirrored to state to drive renders. With
  // `zoom` off these never change (scale 1, no pan) — the tile is a flat, passive picture.
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

  // Pin drag (reposition). `moved` guards against a plain click dirtying the form.
  const dragRef = useRef<{ key: string; moved: boolean } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const [dragState, setDragState] = useState<{ key: string; x: number; y: number } | null>(null);

  const isZoomed = zoom && scale > 1;

  // Screen point -> RAW normalised position, undoing the current pan/zoom. NOT clamped, so a caller
  // can tell an in-image press (0..1 on both axes) from one that landed outside the picture.
  const rawCoords = useCallback((clientX: number, clientY: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const s = scaleRef.current;
    const p = posRef.current;
    return {
      x: 0.5 + (cx - p.x) / s / rect.width,
      y: 0.5 + (cy - p.y) / s / rect.height,
    };
  }, []);

  // Clamped variant for pin drag (dragging a pin off-frame parks it on the nearest edge).
  const coords = useCallback(
    (clientX: number, clientY: number) => {
      const r = rawCoords(clientX, clientY);
      return r ? { x: clamp01(r.x), y: clamp01(r.y) } : { x: 0, y: 0 };
    },
    [rawCoords],
  );

  const clampPan = (px: number, py: number, s: number, w: number, h: number) => {
    const maxX = Math.max(0, (w * s - w) / 2);
    const maxY = Math.max(0, (h * s - h) / 2);
    return { x: clamp(px, -maxX, maxX), y: clamp(py, -maxY, maxY) };
  };

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
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  // Wheel-zoom needs a non-passive listener so preventDefault stops the page scrolling. Attached
  // ONLY in the enlarged view (`zoom`): inline tiles must never capture the wheel, so scrolling
  // the page over a grid of sketches scrolls the page instead of zooming a thumbnail.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !zoom) return;
    function onWheel(e: WheelEvent) {
      if (e.deltaY === 0) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, zoomAt]);

  // Pin drag uses window listeners so a fast drag that leaves the frame still tracks. Each Stage
  // guards on its own `dragRef`, so the inline + enlarged instances never process each other's
  // drag.
  useEffect(() => {
    function move(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const p = coords(e.clientX, e.clientY);
      dragPosRef.current = p;
      if (!d.moved) d.moved = true;
      setDragState({ key: d.key, ...p });
    }
    function up() {
      const d = dragRef.current;
      const p = dragPosRef.current;
      if (d && d.moved && p) onMove?.(d.key, p.x, p.y);
      dragRef.current = null;
      dragPosRef.current = null;
      setDragState(null);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [coords, onMove]);

  function startPinDrag(key: string, e: ReactPointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    dragRef.current = { key, moved: false };
    const p = coords(e.clientX, e.clientY);
    dragPosRef.current = p;
    setDragState({ key, ...p });
  }

  // Background gesture. A press that barely moves is a click: in add-mode it drops a pin, in
  // view-mode it opens the enlarged view (inline) or does nothing (already enlarged). With `zoom`
  // on, a moved single pointer pans and two pointers pinch-zoom; with it off the press is only
  // ever a click, so touch scrolling over the tile is left to the browser.
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

  function handlePointerDown(e: ReactPointerEvent) {
    if (zoom) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zoom && pointersRef.current.size === 2) {
      panRef.current = null;
      const [a, b] = Array.from(pointersRef.current.values());
      if (a && b) pinchRef.current = { prevDist: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (pointersRef.current.size !== 1) return;
    panRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPosX: posRef.current.x,
      startPosY: posRef.current.y,
      moved: false,
    };
  }

  function handlePointerMove(e: ReactPointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zoom && pointersRef.current.size === 2 && pinchRef.current) {
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
      if (zoom && scaleRef.current > 1) setIsPanning(true);
    }
    if (p.moved && zoom && scaleRef.current > 1) {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos(
        clampPan(p.startPosX + dx, p.startPosY + dy, scaleRef.current, rect.width, rect.height),
      );
    }
  }

  function resetPointer(e: ReactPointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (panRef.current?.pointerId === e.pointerId) {
      panRef.current = null;
      setIsPanning(false);
    }
  }

  function handlePointerUp(e: ReactPointerEvent) {
    const p = panRef.current;
    const isPress = p?.pointerId === e.pointerId;
    resetPointer(e);
    if (!isPress || !p || p.moved) return;
    if (addMode && onAdd) {
      // Only a deliberate press that lands INSIDE the picture drops a callout. An out-of-bounds
      // release (a click on the ground around the frame, or one that slipped past a control) is
      // rejected outright rather than clamped to an edge — no more phantom pins at 0/1.
      const raw = rawCoords(e.clientX, e.clientY);
      const EPS = 0.001;
      if (!raw || raw.x < -EPS || raw.x > 1 + EPS || raw.y < -EPS || raw.y > 1 + EPS) return;
      onAdd(clamp01(raw.x), clamp01(raw.y));
    } else if (onBackgroundView) {
      onBackgroundView();
    }
  }

  const cursorClass = addMode
    ? 'cursor-crosshair'
    : isZoomed
      ? isPanning
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : onBackgroundView
        ? 'cursor-zoom-in'
        : 'cursor-default';

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative select-none overflow-hidden border border-textInactiveColor',
        zoom && 'touch-none',
        frameClassName,
        cursorClass,
      )}
      style={{ aspectRatio, ...frameStyle }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={resetPointer}
    >
      <div
        className='absolute inset-0'
        style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})` }}
      >
        {type === 'video' ? (
          <video
            src={src}
            className='absolute inset-0 h-full w-full object-cover'
            muted
            loop
            playsInline
          />
        ) : (
          <img
            src={src}
            alt={alt}
            className='absolute inset-0 h-full w-full object-cover'
            draggable={false}
          />
        )}

        {callouts.map((c) => {
          if (Number.isNaN(c.xNorm) || Number.isNaN(c.yNorm)) return null;
          return (
            <ImageCallout
              key={c.key}
              data={c}
              title={noteTitle?.(c.key)}
              scale={scale}
              showAll={showAll}
              editable={editable}
              pinSize={pinSize}
              dragging={dragState?.key === c.key}
              dragPos={dragState}
              onPinPointerDown={(e) => startPinDrag(c.key, e)}
              onRemove={() => onRemove?.(c.key)}
              renderNote={(opts) => renderNote(c.key, opts)}
            />
          );
        })}
      </div>

      {zoom && isZoomed && (
        <button
          type='button'
          aria-label='reset zoom'
          title='reset zoom'
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            resetZoom();
          }}
          className='absolute bottom-1 left-1 z-[4] cursor-pointer border border-textInactiveColor bg-bgColor px-1 text-textBaseSize leading-none tabular-nums hover:bg-textColor hover:text-bgColor'
        >
          {Math.round(scale * 100)}%
        </button>
      )}

      {cornerSlot && <div className='absolute right-1 top-1 z-[4]'>{cornerSlot}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnnotatedImage — a passive inline tile (pins + hover notes; in add-mode a click drops a pin at
// the normalised click position) that opens a dedicated enlarged/zoom dialog on a plain view-mode
// click. All wheel/pinch/drag zoom + pan lives inside that dialog, never on the inline grid — so
// scrolling the page over a tile scrolls the page.
// ---------------------------------------------------------------------------

export function AnnotatedImage({
  src,
  alt,
  type = 'image',
  aspectRatio = '4/5',
  className,
  callouts,
  renderNote,
  noteTitle,
  editable = false,
  addMode = false,
  onAdd,
  onMove,
  onRemove,
  zoomable = false,
  notesMode = 'hover',
  showAllNotes = false,
  pinSize = 'md',
  cornerSlot,
}: AnnotatedImageProps) {
  const [enlarged, setEnlarged] = useState(false);

  // Inline tiles never zoom, so nothing implies "show all" there but the explicit toggle. The
  // enlarged view is the read-everything surface: it lays every note out at once (and they track
  // its zoom), keeping the "hover peek / zoom shows all" grammar.
  const inlineShowAll = notesMode === 'auto' && showAllNotes;

  // A plain view-mode click opens the enlarged/zoom view; in add-mode the same click drops a pin,
  // so the two never fight. Only meaningful when the surface is zoomable.
  const openEnlarged = zoomable && !addMode ? () => setEnlarged(true) : undefined;

  // The enlarged frame keeps the media's own aspect ratio while fitting inside the viewport:
  // width is the smaller of the available width and (available height × ratio), so height can
  // never overflow and the picture is never distorted.
  const arNum = (() => {
    const [a, b] = aspectRatio.split('/').map(Number);
    return a && b ? a / b : 0.8;
  })();

  const shared = {
    src,
    alt,
    type,
    aspectRatio,
    callouts,
    renderNote,
    noteTitle,
    editable,
    addMode,
    onAdd,
    onMove,
    onRemove,
    pinSize,
  } as const;

  return (
    <div className={cn('relative select-none', className)}>
      <Stage
        {...shared}
        zoom={false}
        showAll={inlineShowAll}
        frameClassName='w-full'
        cornerSlot={cornerSlot}
        onBackgroundView={openEnlarged}
      />

      {zoomable && (
        <Dialog.Root open={enlarged} onOpenChange={setEnlarged}>
          <Dialog.Portal>
            <Dialog.Overlay className='media-viewer-overlay fixed inset-0 z-[var(--z-modal)] bg-overlay' />
            <Dialog.Content
              aria-label={`${alt} — enlarged`}
              className='media-viewer-content fixed inset-0 z-[var(--z-modal)] flex flex-col bg-bgColor text-textColor focus:outline-none'
            >
              <Dialog.Title className='sr-only'>{alt}</Dialog.Title>
              <Dialog.Description className='sr-only'>
                Enlarged view. Scroll or pinch to zoom, drag to pan; hover a pin to read its note.
              </Dialog.Description>

              <div className='flex shrink-0 items-center justify-between gap-4 border-b border-textInactiveColor px-3 py-2'>
                <Text variant='label' size='small' className='truncate uppercase'>
                  {alt}
                </Text>
                <Dialog.Close
                  aria-label='close enlarged view'
                  className='shrink-0 cursor-pointer border border-textInactiveColor px-2 py-0.5 text-textBaseSize uppercase leading-none hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  close [x]
                </Dialog.Close>
              </div>

              {/* Clicking the empty ground around the picture closes; clicks land on this box
                  itself only when they miss the framed image. */}
              <div
                className='flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4'
                onClick={(e) => {
                  if (e.target === e.currentTarget) setEnlarged(false);
                }}
              >
                <Stage
                  {...shared}
                  zoom
                  showAll
                  frameClassName='max-w-full'
                  frameStyle={{ width: `min(95%, calc((100dvh - 6rem) * ${arNum}))` }}
                />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
