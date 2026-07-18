import {
  Pencil1Icon,
  RotateCounterClockwiseIcon,
  TrashIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@radix-ui/react-icons';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState } from 'react';

// Real pan + zoom and a session-only draw overlay for the media viewer's image
// stage. Kept out of media-viewer.tsx to keep the gesture math (wheel-zoom
// toward the cursor, pinch, drag-pan, touch-swipe-to-navigate — all unified
// through Pointer Events so they don't double-fire) separate from the dialog
// chrome.

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const WHEEL_STEP = 1.18;
const BUTTON_STEP = 1.6;
const DOUBLE_CLICK_SCALE = 2.5;
const SWIPE_THRESHOLD = 48;
const STROKE_WIDTH = 4;

interface Point {
  x: number;
  y: number;
}
interface Size {
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function clampPan(x: number, y: number, scale: number, base: Size, viewport: Size): Point {
  const maxX = Math.max(0, (base.w * scale - viewport.w) / 2);
  const maxY = Math.max(0, (base.h * scale - viewport.h) / 2);
  return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
}

/**
 * Pan + zoom for the image stage, plus the touch-swipe-to-navigate gesture
 * (kept here so it shares one Pointer Event pipeline with pinch/pan instead
 * of fighting a second, Touch-Event-based implementation).
 *
 * `active` scopes wheel-zoom / drag-pan / pinch to images only; swipe-to-
 * navigate still works for video since it's type-agnostic, matching the
 * viewer's original behavior.
 */
export function useMediaStageGestures(params: {
  active: boolean;
  resetKey: unknown;
  hasMany: boolean;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const { active, resetKey, hasMany, onSwipe } = params;
  const [scale, setScaleState] = useState(1);
  const [pos, setPosState] = useState<Point>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const posRef = useRef<Point>({ x: 0, y: 0 });
  const [baseSize, setBaseSizeState] = useState<Size>({ w: 0, h: 0 });
  const baseSizeRef = useRef<Size>({ w: 0, h: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const imgResizeObserverRef = useRef<ResizeObserver | null>(null);

  const setScale = (s: number) => {
    scaleRef.current = s;
    setScaleState(s);
  };
  const setPos = (p: Point) => {
    posRef.current = p;
    setPosState(p);
  };

  // Fresh image (nav / reopen) → fresh zoom.
  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [resetKey]);

  // ResizeObserver reports the img's laid-out (content-box) size, which is
  // unaffected by the CSS transform we apply for zoom/pan — exactly the
  // "fit" size we need as the pan-clamp and draw-canvas basis.
  //
  // Wired up as a *callback ref* rather than a resetKey-keyed effect on
  // purpose: Radix's Dialog.Content is wrapped in Presence, which defers
  // actually mounting its children by one render pass — `open` flips true,
  // but Presence's own state machine only transitions unmounted -> mounted
  // inside a layout effect, so the <img> isn't in the DOM yet on the render
  // where `resetKey` first changes. An effect keyed on [active, resetKey]
  // fires too early (the ref is still null), bails out, and — since neither
  // dep changes again once the image actually mounts a render later — never
  // gets a second chance to run, so baseSize was stuck at {0,0} for the
  // whole session and the draw canvas never got a hit-testable size (see
  // report: this was the actual cause of "draw mode does nothing"). A
  // callback ref sidesteps the race: it fires exactly when the node attaches
  // or detaches, regardless of which render pass that happens on.
  const attachImg = useCallback(
    (el: HTMLImageElement | null) => {
      imgElRef.current = el;
      imgResizeObserverRef.current?.disconnect();
      imgResizeObserverRef.current = null;
      if (!active || !el) return;
      const ro = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        if (!box) return;
        const next = { w: box.width, h: box.height };
        baseSizeRef.current = next;
        setBaseSizeState(next);
      });
      ro.observe(el);
      imgResizeObserverRef.current = ro;
    },
    [active],
  );

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const vpEl = viewportRef.current;
    if (!vpEl) return;
    const vp = vpEl.getBoundingClientRect();
    const prevScale = scaleRef.current;
    const nextScale = clamp(prevScale * factor, MIN_SCALE, MAX_SCALE);
    if (nextScale === prevScale) return;
    const cx = clientX - vp.left - vp.width / 2;
    const cy = clientY - vp.top - vp.height / 2;
    const ratio = nextScale / prevScale;
    const prevPos = posRef.current;
    const clamped = clampPan(
      cx - (cx - prevPos.x) * ratio,
      cy - (cy - prevPos.y) * ratio,
      nextScale,
      baseSizeRef.current,
      { w: vp.width, h: vp.height },
    );
    setScale(nextScale);
    setPos(clamped);
  }, []);

  const zoomCenter = useCallback(
    (factor: number) => {
      const vp = viewportRef.current?.getBoundingClientRect();
      if (!vp) return;
      zoomAt(vp.left + vp.width / 2, vp.top + vp.height / 2, factor);
    },
    [zoomAt],
  );

  const zoomIn = useCallback(() => zoomCenter(BUTTON_STEP), [zoomCenter]);
  const zoomOut = useCallback(() => zoomCenter(1 / BUTTON_STEP), [zoomCenter]);
  const reset = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  const onImageDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!active) return;
      e.stopPropagation();
      if (scaleRef.current > 1) reset();
      else zoomAt(e.clientX, e.clientY, DOUBLE_CLICK_SCALE);
    },
    [active, reset, zoomAt],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!active || e.deltaY === 0) return;
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    },
    [active, zoomAt],
  );

  // Gesture tracking for pan / pinch / swipe-nav, unified through Pointer
  // Events so a single touch interaction can't double-fire across two event
  // systems (the historical bug with mixing Touch + Pointer handlers).
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinch = useRef<{ prevDist: number } | null>(null);
  const drag = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const swipe = useRef<{ pointerId: number; startClientX: number } | null>(null);
  const justSwiped = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (active && pointers.current.size === 2) {
        drag.current = null;
        swipe.current = null;
        const [a, b] = Array.from(pointers.current.values());
        if (a && b) pinch.current = { prevDist: Math.hypot(a.x - b.x, a.y - b.y) };
        return;
      }
      if (pointers.current.size !== 1) return;

      // Pan only ever starts from a press directly on the <img> — never the
      // bare background, the toolbar, arrows, or the draw canvas (which owns
      // its own gesture when draw mode is on).
      const targetIsImage = e.target === imgElRef.current;
      if (active && scaleRef.current > 1 && targetIsImage) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drag.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPosX: posRef.current.x,
          startPosY: posRef.current.y,
        };
      } else if (e.pointerType === 'touch' && hasMany) {
        swipe.current = { pointerId: e.pointerId, startClientX: e.clientX };
      }
    },
    [active, hasMany],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = Array.from(pointers.current.values());
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current.prevDist > 0) {
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.current.prevDist);
        }
        pinch.current.prevDist = dist;
        return;
      }

      if (drag.current?.pointerId === e.pointerId) {
        const vp = viewportRef.current?.getBoundingClientRect();
        if (!vp) return;
        const dx = e.clientX - drag.current.startClientX;
        const dy = e.clientY - drag.current.startClientY;
        setPos(
          clampPan(
            drag.current.startPosX + dx,
            drag.current.startPosY + dy,
            scaleRef.current,
            baseSizeRef.current,
            { w: vp.width, h: vp.height },
          ),
        );
      }
    },
    [zoomAt],
  );

  const endGesture = useCallback(
    (e: React.PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      if (drag.current?.pointerId === e.pointerId) drag.current = null;
      if (swipe.current?.pointerId === e.pointerId) {
        const dx = e.clientX - swipe.current.startClientX;
        swipe.current = null;
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
          justSwiped.current = true;
          onSwipe(dx < 0 ? 1 : -1);
        }
      }
    },
    [onSwipe],
  );

  // The stage's onClick (close-on-background-click) calls this so the click
  // synthesized at the end of a swipe doesn't also close the viewer.
  const consumeJustSwiped = useCallback(() => {
    const v = justSwiped.current;
    justSwiped.current = false;
    return v;
  }, []);

  const isZoomed = scale > 1;

  return {
    scale,
    isZoomed,
    canZoomIn: scale < MAX_SCALE,
    canZoomOut: scale > MIN_SCALE,
    zoomIn,
    zoomOut,
    reset,
    baseSize,
    viewportRef,
    imgRef: attachImg,
    stageStyle: { transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})` },
    viewportHandlers: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
    },
    onImageDoubleClick,
    consumeJustSwiped,
  };
}

export interface AnnotateColor {
  name: string;
  value: string;
}

const ANNOTATE_COLORS: AnnotateColor[] = [
  { name: 'red', value: '#ff3b30' },
  { name: 'yellow', value: '#ffcc00' },
  { name: 'green', value: '#34c759' },
  { name: 'white', value: '#ffffff' },
];

interface Stroke {
  color: string;
  points: Point[];
}

/**
 * Session-only freehand annotation over the image. Nothing here is
 * persisted anywhere — strokes live in a ref and are dropped whenever
 * `resetKey` changes (navigate / close), by design (see report: no backend
 * field exists yet to save markup against a media item).
 */
export function useImageAnnotate(params: { resetKey: unknown; baseSize: Size }) {
  const { resetKey, baseSize } = params;
  const [drawMode, setDrawMode] = useState(false);
  const [color, setColor] = useState(ANNOTATE_COLORS[0]?.value ?? '#ff3b30');
  const [hasStrokes, setHasStrokes] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);

  useEffect(() => {
    strokesRef.current = [];
    currentRef.current = null;
    setHasStrokes(false);
    setDrawMode(false);
  }, [resetKey]);

  const paintSegment = (
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    strokeColor: string,
  ) => {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const paintDot = (ctx: CanvasRenderingContext2D, p: Point, strokeColor: string) => {
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      const [first, ...rest] = stroke.points;
      if (!first) continue;
      if (rest.length === 0) {
        paintDot(ctx, first, stroke.color);
        continue;
      }
      let prev = first;
      for (const p of rest) {
        paintSegment(ctx, prev, p, stroke.color);
        prev = p;
      }
    }
  }, []);

  // Match the canvas's pixel buffer to the image's displayed size (DPR-scaled
  // for crisp strokes) and replay existing ink whenever that size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!drawMode || !canvas || baseSize.w === 0 || baseSize.h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = baseSize.w * dpr;
    canvas.height = baseSize.h * dpr;
    canvas.getContext('2d')?.scale(dpr, dpr);
    redraw();
  }, [drawMode, baseSize.w, baseSize.h, redraw]);

  const toCanvasPoint = (e: { clientX: number; clientY: number }): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas || baseSize.w === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((e.clientX - rect.left) * baseSize.w) / rect.width,
      y: ((e.clientY - rect.top) * baseSize.h) / rect.height,
    };
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawMode) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = toCanvasPoint(e);
      if (!pt) return;
      canvasRef.current?.setPointerCapture(e.pointerId);
      currentRef.current = { color, points: [pt] };
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) paintDot(ctx, pt, color);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawMode, color, baseSize.w, baseSize.h],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawMode || !currentRef.current) return;
      e.preventDefault();
      const pt = toCanvasPoint(e);
      if (!pt) return;
      const pts = currentRef.current.points;
      const last = pts[pts.length - 1];
      pts.push(pt);
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && last) paintSegment(ctx, last, pt, currentRef.current.color);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawMode, baseSize.w, baseSize.h],
  );

  const finishStroke = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentRef.current) return;
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    strokesRef.current.push(currentRef.current);
    currentRef.current = null;
    setHasStrokes(true);
  }, []);

  const undo = useCallback(() => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setHasStrokes(strokesRef.current.length > 0);
    redraw();
  }, [redraw]);

  const clear = useCallback(() => {
    strokesRef.current = [];
    setHasStrokes(false);
    redraw();
  }, [redraw]);

  const toggleDrawMode = useCallback(() => setDrawMode((v) => !v), []);

  return {
    drawMode,
    toggleDrawMode,
    color,
    setColor,
    colors: ANNOTATE_COLORS,
    hasStrokes,
    undo,
    clear,
    canvasRef,
    canvasHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishStroke,
      onPointerCancel: finishStroke,
    },
  };
}

function ToolbarIconButton({
  onClick,
  disabled,
  active,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center border transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor',
        'disabled:cursor-not-allowed disabled:opacity-30',
        active
          ? 'border-bgColor bg-bgColor text-textColor'
          : 'border-bgColor/40 bg-black/40 text-bgColor backdrop-blur-sm hover:bg-bgColor hover:text-textColor',
      )}
    >
      {children}
    </button>
  );
}

interface ZoomDrawToolbarProps {
  scale: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  isZoomed: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  drawMode: boolean;
  onToggleDraw: () => void;
  color: string;
  onColorChange: (c: string) => void;
  colors: AnnotateColor[];
  hasStrokes: boolean;
  onUndo: () => void;
  onClear: () => void;
}

/** Floating bottom-center toolbar: zoom controls always shown, draw controls
 * (colors / undo / clear) appear once draw mode is toggled on. */
export function ZoomDrawToolbar({
  scale,
  canZoomIn,
  canZoomOut,
  isZoomed,
  onZoomIn,
  onZoomOut,
  onReset,
  drawMode,
  onToggleDraw,
  color,
  onColorChange,
  colors,
  hasStrokes,
  onUndo,
  onClear,
}: ZoomDrawToolbarProps) {
  return (
    <div
      role='toolbar'
      aria-label='Image zoom and drawing controls'
      // Stop clicks/gestures on the toolbar itself from reaching the stage's
      // close-on-background-click and pan/swipe handling.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className='absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 px-2'
    >
      <div className='flex items-center gap-1 border border-bgColor/40 bg-black/40 p-1 backdrop-blur-sm'>
        <ToolbarIconButton label='Zoom out' onClick={onZoomOut} disabled={!canZoomOut}>
          <ZoomOutIcon className='size-4' />
        </ToolbarIconButton>
        <button
          type='button'
          aria-label='Reset zoom'
          title='Reset zoom'
          onClick={onReset}
          disabled={!isZoomed}
          className='min-w-14 px-1 text-center text-textBaseSize uppercase tabular-nums text-bgColor disabled:cursor-not-allowed disabled:opacity-60'
        >
          {Math.round(scale * 100)}%
        </button>
        <ToolbarIconButton label='Zoom in' onClick={onZoomIn} disabled={!canZoomIn}>
          <ZoomInIcon className='size-4' />
        </ToolbarIconButton>
      </div>

      <div className='flex items-center gap-1 border border-bgColor/40 bg-black/40 p-1 backdrop-blur-sm'>
        <ToolbarIconButton
          label={drawMode ? 'Exit draw mode' : 'Draw on image'}
          active={drawMode}
          onClick={onToggleDraw}
        >
          <Pencil1Icon className='size-4' />
        </ToolbarIconButton>

        {drawMode && (
          <>
            <div role='radiogroup' aria-label='Pen color' className='mx-1 flex items-center gap-1'>
              {colors.map((c) => (
                <button
                  key={c.value}
                  type='button'
                  role='radio'
                  aria-checked={color === c.value}
                  aria-label={`${c.name} pen`}
                  title={c.name}
                  onClick={() => onColorChange(c.value)}
                  style={{ backgroundColor: c.value }}
                  className={cn(
                    'size-5 shrink-0 rounded-full border-2 transition-transform',
                    color === c.value ? 'scale-110 border-bgColor' : 'border-transparent',
                  )}
                />
              ))}
            </div>
            <ToolbarIconButton label='Undo last stroke' onClick={onUndo} disabled={!hasStrokes}>
              <RotateCounterClockwiseIcon className='size-4' />
            </ToolbarIconButton>
            <ToolbarIconButton label='Clear drawing' onClick={onClear} disabled={!hasStrokes}>
              <TrashIcon className='size-4' />
            </ToolbarIconButton>
          </>
        )}
      </div>
    </div>
  );
}
