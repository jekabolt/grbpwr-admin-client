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

import {
  CalloutPin,
  ImageCallout,
  pinSizes,
  type AnnotatedCallout,
  type PinSize,
} from './annotation/marker-note';
import {
  AnnotationDefs,
  CalloutShape,
  PlacingShape,
  type ShapePoint,
} from './annotation/shapes';
import Text from './text';

// Пин и записка живут в `annotation/marker-note`: тем же стикером пользуется карусель примерки,
// у которой своя поверхность. Реэкспорт — чтобы её импорты не переписывать вслед за переездом.
export { CalloutPin, ImageCallout, type AnnotatedCallout, type PinSize };
export type { ImageCalloutProps } from './annotation/marker-note';

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
  /** Narrow the note card (a 240px panel over a 180px grid tile needs trimming). */
  noteClassName?: string;
  /** Overlaid on the frame's top-right (e.g. a remove-photo control). */
  cornerSlot?: ReactNode;
  /** Sizing for the inline frame. Default is width-driven ('w-full', height from aspectRatio);
   *  pass 'w-auto' + a fixed height in frameStyle to make it height-driven with natural width
   *  (a filmstrip row of equal-height, variable-width images). */
  frameClassName?: string;
  frameStyle?: React.CSSProperties;
  /** Незавершённая постановка фигуры на ЭТОЙ картинке (вид + уже кликнутые якоря). */
  pendingKind?: string | null;
  pendingPoints?: ShapePoint[];
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
  noteClassName?: string;
  cornerSlot?: ReactNode;
  /** A plain (non-drag) click on empty canvas in VIEW mode. The inline tile passes this to open
   *  the enlarged view; the enlarged view leaves it undefined so a plain click there does
   *  nothing (pan/zoom is the only background gesture). */
  onBackgroundView?: () => void;
  /** Незавершённая постановка фигуры на ЭТОЙ картинке: вид и уже кликнутые якоря. */
  pendingKind?: string | null;
  pendingPoints?: ShapePoint[];
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
  noteClassName,
  cornerSlot,
  onBackgroundView,
  pendingKind,
  pendingPoints,
}: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Размер кадра в пикселях — фигуры считаются в них, а хранятся в долях. Без замера пришлось бы
  // рисовать в процентах, и окружность на альбомном снимке стала бы эллипсом.
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // ИЗОЛЯЦИЯ: наведение на пин гасит ЧУЖИЕ фигуры. На эскизе их бывает десяток, они пересекаются,
  // и прочесть одну мерку, не убрав соседние, невозможно. Гасятся именно фигуры, а не пины: пин
  // несёт номер, по которому на выноску ссылаются, и прятать номера значило бы прятать адреса.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

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
  const dragRef = useRef<{ key: string; moved: boolean; startX: number; startY: number } | null>(null);
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
      // ПОРОГ, А НЕ ПЕРВОЕ ЖЕ ДВИЖЕНИЕ. Без него клик по пину чуть мимо центра засчитывался
      // перетаскиванием, и пин прыгал под курсор — то есть попытка ПРОЧЕСТЬ записку двигала
      // указание. Тот же порог, что у панорамы этого файла, и тот же, что у плашки холста выносок.
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= CLICK_MOVE_THRESHOLD) return;
        d.moved = true;
      }
      dragPosRef.current = p;
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
    dragRef.current = { key, moved: false, startX: e.clientX, startY: e.clientY };
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
        'relative select-none border border-borderColor',
        // Clipping is only needed while the stage can pan/zoom (the enlarged view). Inline the
        // media is object-cover and never overflows, so leaving overflow visible lets a show-all
        // note card spill past a narrow grid tile instead of being sliced in half by the frame.
        zoom && 'touch-none overflow-hidden',
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
            // Та же причина, что у холста выносок: вкладки смонтированы все сразу, и без `lazy`
            // открытие карточки ради шапки тянет весь мудборд и все эскизы в полный размер.
            loading='lazy'
          />
        )}

        {/* СЛОЙ ГЕОМЕТРИИ — под пинами и записками, внутри трансформа: мерка обязана ехать вместе
            с картинкой при зуме и панораме, иначе она указывала бы мимо ровно тогда, когда её и
            приблизили, чтобы рассмотреть. viewBox в пикселях кадра, а не в процентах: в процентах
            засечки на альбомном снимке стали бы косыми. */}
        {frame.w > 0 && (
          <svg
            className='pointer-events-none absolute inset-0 h-full w-full'
            viewBox={`0 0 ${frame.w} ${frame.h}`}
            preserveAspectRatio='none'
            aria-hidden
          >
            <defs>
              <AnnotationDefs />
            </defs>
            {callouts.map((c) => {
              const pts = c.points ?? [];
              if (pts.length === 0) return null;
              if (hoveredKey !== null && hoveredKey !== c.key) return null;
              const at = (p: ShapePoint) => ({ x: p.x * frame.w, y: p.y * frame.h });
              // Подпись фигуры — САМ нумерованный маркер: лидер тянется от него, и когда маркер
              // перетаскивают, линия едет следом сама, без второй хранимой координаты.
              const label = at(
                dragState?.key === c.key
                  ? { x: dragState.x, y: dragState.y }
                  : { x: c.xNorm, y: c.yNorm },
              );
              return (
                <CalloutShape
                  key={c.key}
                  kind={c.kind ?? 'pin'}
                  pts={pts.map(at)}
                  label={label}
                  color={c.color || undefined}
                />
              );
            })}
            {pendingKind && (pendingPoints?.length ?? 0) > 0 && (
              <PlacingShape
                kind={pendingKind}
                pts={(pendingPoints ?? []).map((p) => ({ x: p.x * frame.w, y: p.y * frame.h }))}
              />
            )}
          </svg>
        )}

        {callouts.map((c) => {
          if (Number.isNaN(c.xNorm) || Number.isNaN(c.yNorm)) return null;
          return (
            <ImageCallout
              key={c.key}
              data={c}
              onHoverChange={(on) => setHoveredKey(on ? c.key : null)}
              title={noteTitle?.(c.key)}
              scale={scale}
              showAll={showAll}
              editable={editable}
              pinSize={pinSize}
              noteClassName={noteClassName}
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
          className='absolute bottom-1 left-1 z-[4] cursor-pointer border border-borderColor bg-bgColor px-1.5 py-px text-micro leading-none tabular-nums hover:bg-textColor hover:text-bgColor'
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
  noteClassName,
  cornerSlot,
  frameClassName = 'w-full',
  frameStyle,
  pendingKind,
  pendingPoints,
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
    noteClassName,
    pendingKind,
    pendingPoints,
  } as const;

  return (
    <div className={cn('relative select-none', className)}>
      <Stage
        {...shared}
        zoom={false}
        showAll={inlineShowAll}
        frameClassName={frameClassName}
        frameStyle={frameStyle}
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

              <div className='flex shrink-0 items-center justify-between gap-4 border-b border-borderColor bg-bgSecondary px-2.5 py-1.5'>
                <Text
                  size='micro'
                  variant='uppercase'
                  tracking='group'
                  component='span'
                  className='truncate font-bold'
                >
                  {alt}
                </Text>
                <Dialog.Close
                  aria-label='close enlarged view'
                  className='shrink-0 cursor-pointer border border-borderColor bg-bgColor px-2.5 py-1 text-micro uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  close ✕
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
                  // The enlarged view has room for the full-width note card — a narrowing meant
                  // for a grid tile must not leak into it.
                  noteClassName={undefined}
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
