import { urlToDataUrl } from 'lib/features/getCropped';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  /** Vertical touch swipe (up or down) on an unzoomed stage. */
  onSwipeClose?: () => void;
}) {
  const { active, resetKey, hasMany, onSwipe, onSwipeClose } = params;
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
  const swipe = useRef<{ pointerId: number; startClientX: number; startClientY: number } | null>(
    null,
  );
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
      } else if (e.pointerType === 'touch' && (hasMany || onSwipeClose)) {
        swipe.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
        };
      }
    },
    [active, hasMany, onSwipeClose],
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
        const dy = e.clientY - swipe.current.startClientY;
        swipe.current = null;
        if (onSwipeClose && Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
          justSwiped.current = true;
          onSwipeClose();
        } else if (hasMany && Math.abs(dx) > SWIPE_THRESHOLD) {
          justSwiped.current = true;
          onSwipe(dx < 0 ? 1 : -1);
        }
      }
    },
    [hasMany, onSwipe, onSwipeClose],
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

// The admin's own palette (mockup viewer-unify, frame 4): red, ink, white, blue.
const ANNOTATE_COLORS: AnnotateColor[] = [
  { name: 'red', value: '#ff0000' },
  { name: 'black', value: '#000000' },
  { name: 'white', value: '#ffffff' },
  { name: 'blue', value: '#2323ff' },
];

/** Pen weights, in image-space px. `thin` marks a stitch line, `thick` circles a panel. */
export const ANNOTATE_WIDTHS = [
  { name: 'thin', value: 3 },
  { name: 'thick', value: 9 },
] as const;

interface Stroke {
  color: string;
  /** Captured per stroke, so changing the pen never rewrites ink already laid down. */
  width: number;
  points: Point[];
}

const paintSegment = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  strokeColor: string,
  strokeWidth: number,
) => {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
};

const paintDot = (
  ctx: CanvasRenderingContext2D,
  p: Point,
  strokeColor: string,
  strokeWidth: number,
) => {
  ctx.fillStyle = strokeColor;
  ctx.beginPath();
  ctx.arc(p.x, p.y, strokeWidth / 2, 0, Math.PI * 2);
  ctx.fill();
};

// One painter for both destinations — the live overlay and the exported file — so what gets saved
// is what was drawn, rather than a second implementation that can drift from it.
const paintStrokes = (ctx: CanvasRenderingContext2D, strokes: Stroke[]) => {
  for (const stroke of strokes) {
    const [first, ...rest] = stroke.points;
    if (!first) continue;
    const w = stroke.width || STROKE_WIDTH;
    if (rest.length === 0) {
      paintDot(ctx, first, stroke.color, w);
      continue;
    }
    let prev = first;
    for (const p of rest) {
      paintSegment(ctx, prev, p, stroke.color, w);
      prev = p;
    }
  }
};

/* ── КОРРЕКЦИЯ КАДРА: ЯРКОСТЬ, КОНТРАСТ, ТОЧКА ЧЁРНОГО ───────────────────────────────────────
 *
 * Владелец (круг 15, J-13): «в зум вью должна быть возомжность добавить яркость контрасность
 * поменять точку черного короче как эдит мод в айфоне похожий принцип».
 *
 * КОРРЕКЦИЯ — ВЗГЛЯД, ПОКА ОТКРЫТ ПРОСМОТРЩИК; картинкой она становится только по кнопке. Это то
 * же правило, по которому здесь живут зум и рисование: `resetKey` (смена кадра или закрытие)
 * снимает её начисто. Хранимой дельты на строке картинки НЕТ и в этот круг она не входит — это
 * был бы бэкендный контракт, который обязан честно применять КАЖДЫЙ рендерер (плитка, тамбнейл,
 * вход модели, экспорт), и всё это ради одного «revert», который полоса даёт и так: оригинал
 * остаётся на месте, а скорректированная копия — отдельная новая картинка.
 *
 * ОДИН ОРГАН НА ЭКРАН И НА ФАЙЛ. Не CSS-`filter` для экрана и канвас для файла: два рисовальщика
 * разошлись бы молча — Safari не знает `ctx.filter`, а `feComponentTransfer` и `contrast()`
 * считают по разным формулам, — и разница вылезла бы в тот день, когда кто-то сохранит файл и
 * сравнит его с тем, что видел. Поэтому пока коррекция не тождественна, поверх `<img>` встаёт
 * канвас ТОГО ЖЕ БОКСА, и в него пиксели идут через ту же `applyAdjustLut`, которой запекается
 * файл: разойтись им нечем.
 */

export interface AdjustParams {
  /** −100…+100. Сдвиг всей шкалы: `br = brightness/200`, то есть +100 это +127.5 к каналу. */
  brightness: number;
  /** −100…+100. Растяжение вокруг середины: `c = 1 + contrast/100`. */
  contrast: number;
  /**
   * 0…50 %. Точка чёрного — это `levels` ПО ВХОДУ: всё ниже неё становится чёрным, остальное
   * растягивается на полную шкалу. Именно это владелец и называет «поменять точку чёрного».
   */
  black: number;
}

export const ADJUST_ZERO: AdjustParams = { brightness: 0, contrast: 0, black: 0 };

export const adjustIsZero = (p: AdjustParams) =>
  p.brightness === 0 && p.contrast === 0 && p.black === 0;

/**
 * 256 значений на смену параметров — и ни одного деления на пиксель.
 *
 * `v' = clamp(((v/255 − b)/(1 − b) − 0.5)·c + 0.5 + br)`
 *
 * Порядок множителей не украшение: точка чёрного правит ВХОД (что считать нулём), контраст
 * крутит вокруг середины, яркость двигает результат. Переставь их — и «яркость» начнёт менять
 * силу контраста, то есть две ручки перестанут быть двумя ручками.
 */
export function buildAdjustLut(p: AdjustParams): Uint8ClampedArray {
  const b = clamp(p.black, 0, 50) / 100;
  const c = 1 + clamp(p.contrast, -100, 100) / 100;
  const br = clamp(p.brightness, -100, 100) / 200;
  const span = 1 - b || 1e-6;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) {
    lut[v] = Math.round((((v / 255 - b) / span - 0.5) * c + 0.5 + br) * 255);
  }
  return lut;
}

/** Прогон готовой таблицы по пикселям. Альфа не трогается: к этому моменту она уже сплющена. */
export function applyAdjustLut(image: ImageData, lut: Uint8ClampedArray): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]!]!;
    d[i + 1] = lut[d[i + 1]!]!;
    d[i + 2] = lut[d[i + 2]!]!;
  }
}

/** Что просмотрщик передаёт запекальщику: сами ручки и уже разжатая подложка, если она есть. */
export interface AdjustHandoff {
  params: AdjustParams;
  /** Натуральная копия снимка, уже привезённая через прокси. `null` — привезти самому. */
  source: HTMLImageElement | null;
}

/**
 * ЕДИНСТВЕННЫЙ ЗАПЕКАЛЬЩИК: и «скачать», и «завести новой картинкой» проходят здесь.
 *
 * Источник берётся заново через CORS-прокси (или готовым от коррекции, которая уже его привезла),
 * а не с `<img>` на экране: снимок медиа-сервера, нарисованный на канвасе, ОТРАВЛЯЕТ его, и
 * `toBlob`/`getImageData` после этого бросают. Ровно поэтому у коррекции и у файла ОДНА подложка —
 * та, что читается.
 *
 * Порядок слоёв: белая земля (просмотрщик ставит прозрачные PNG на белое — файл обязан совпасть с
 * тем, что было на экране) → снимок → коррекция → чернила. Чернила ПОСЛЕ коррекции, потому что
 * они не часть снимка: подкрутка яркости не имеет права перекрашивать пометку.
 */
async function bakePicture(opts: {
  src: string;
  strokes: Stroke[];
  baseSize: Size;
  adjust: AdjustParams;
  source?: HTMLImageElement | null;
}): Promise<HTMLCanvasElement | null> {
  const { src, strokes, baseSize, adjust } = opts;
  let img = opts.source ?? null;
  if (!img) {
    const dataUrl = await urlToDataUrl(src);
    const el = new Image();
    el.src = dataUrl;
    await el.decode();
    img = el;
  }

  const w = img.naturalWidth || baseSize.w;
  const h = img.naturalHeight || baseSize.h;
  if (!w || !h) return null;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  if (!adjustIsZero(adjust)) {
    const image = ctx.getImageData(0, 0, w, h);
    applyAdjustLut(image, buildAdjustLut(adjust));
    ctx.putImageData(image, 0, 0);
  }

  if (strokes.length) {
    // Штрихи хранятся в координатах ПОКАЗАННОГО кадра, поэтому масштабируются до натуральных:
    // экспорт — полное разрешение, а не снимок экрана.
    ctx.save();
    ctx.scale(w / (baseSize.w || w), h / (baseSize.h || h));
    paintStrokes(ctx, strokes);
    ctx.restore();
  }
  return out;
}

/**
 * Коррекция на время сеанса: три ручки, одна таблица, один канвас поверх снимка.
 *
 * ПОДЛОЖКУ ПРИВОЗИТ СЮДА, А НЕ БЕРЁТ С ЭКРАНА. `<img>` со стороннего медиа-сервера читать нельзя
 * (отравленный канвас), поэтому при входе в режим снимок один раз едет через прокси. Пока он не
 * приехал, ручки заперты и об этом СКАЗАНО: ползунок, который двигается и ничего не делает, хуже
 * отсутствующего.
 */
export function useImageAdjust(params: {
  resetKey: unknown;
  baseSize: Size;
  src: string;
  enabled: boolean;
}) {
  const { resetKey, baseSize, src, enabled } = params;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<AdjustParams>(ADJUST_ZERO);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const loadedForRef = useRef('');

  // Свежий кадр (переход / переоткрытие) → чистая коррекция. Тот же `resetKey`, что у зума и
  // чернил: одно правило на все три сеансовые вещи, чтобы «сбрасывается ли это» было одним
  // вопросом, а не тремя.
  useEffect(() => {
    setOpen(false);
    setValues(ADJUST_ZERO);
    setStatus('idle');
    loadedForRef.current = '';
    sourceRef.current = null;
  }, [resetKey]);

  useEffect(() => {
    if (!open || !enabled || !src) return;
    if (sourceRef.current && loadedForRef.current === src) {
      setStatus('ready');
      return;
    }
    let alive = true;
    setStatus('loading');
    void (async () => {
      try {
        const dataUrl = await urlToDataUrl(src);
        const el = new Image();
        el.src = dataUrl;
        await el.decode();
        if (!alive) return;
        sourceRef.current = el;
        loadedForRef.current = src;
        setStatus('ready');
      } catch {
        if (alive) setStatus('failed');
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, enabled, src]);

  const lut = useMemo(
    () => buildAdjustLut(values),
    [values.brightness, values.contrast, values.black],
  );

  /** Канвас стоит ТОЛЬКО пока коррекция не тождественна: ноль на всех ручках = обычный `<img>`. */
  const on =
    open &&
    enabled &&
    status === 'ready' &&
    !adjustIsZero(values) &&
    baseSize.w > 0 &&
    baseSize.h > 0;

  // Отрисовка в rAF: ползунок сыплет событиями пачками, а перерисовка нужна одна на кадр.
  // Буфер — размер ПОКАЗАННОГО кадра (≤ ~1.5 Мп), а не натуральный: тянуть 24 Мп на каждое
  // движение ручки значило бы сделать плавную ручку рваной. Файл при этом уходит натуральным.
  useEffect(() => {
    if (!on) return;
    const canvas = canvasRef.current;
    const img = sourceRef.current;
    if (!canvas || !img) return;
    const id = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(baseSize.w * dpr));
      const h = Math.max(1, Math.round(baseSize.h * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      applyAdjustLut(image, lut);
      ctx.putImageData(image, 0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [on, lut, baseSize.w, baseSize.h]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const reset = useCallback(() => setValues(ADJUST_ZERO), []);

  return {
    /** Открыт ли ряд ручек. Не то же самое, что «коррекция стоит». */
    open,
    setOpen,
    toggle,
    values,
    setValues,
    reset,
    status,
    /** Коррекция реально нарисована — канвас на сцене. */
    on,
    /** Тождественна ли коррекция. НЕ то же, что `on`: ручки могут стоять, а подложка ещё ехать. */
    isZero: adjustIsZero(values),
    canvasRef,
    sourceRef,
  };
}

/**
 * Freehand annotation over the image. Strokes live in a ref and are dropped whenever `resetKey`
 * changes (navigate / close) — there is still no backend field to persist markup against a media
 * item, so the way out of the session is `saveImage`, which flattens the ink onto a copy of the
 * picture and downloads it.
 */
export function useImageAnnotate(params: { resetKey: unknown; baseSize: Size }) {
  const { resetKey, baseSize } = params;
  const [drawMode, setDrawMode] = useState(false);
  const [color, setColor] = useState(ANNOTATE_COLORS[0]?.value ?? '#ff3b30');
  const [width, setWidth] = useState<number>(ANNOTATE_WIDTHS[0].value);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);

  useEffect(() => {
    strokesRef.current = [];
    currentRef.current = null;
    setHasStrokes(false);
    setDrawMode(false);
  }, [resetKey]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintStrokes(ctx, strokesRef.current);
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
      currentRef.current = { color, width, points: [pt] };
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) paintDot(ctx, pt, color, width);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawMode, color, width, baseSize.w, baseSize.h],
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
      if (ctx && last) {
        paintSegment(ctx, last, pt, currentRef.current.color, currentRef.current.width);
      }
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

  /**
   * Сплющить чернила И КОРРЕКЦИЮ на копию снимка натурального размера.
   *
   * Обе двери наружу — «скачать» и «завести новой картинкой» — зовут ОДИН `bakePicture`. Второй
   * запекальщик рядом с первым разошёлся бы с ним на первой же правке, и разошёлся бы молча:
   * файл отличался бы от того, что человек видел, а сказать об этом было бы некому.
   *
   * Пустой акт (ни чернил, ни коррекции) возвращает `null`, а не пустой файл: скачать копию,
   * тождественную оригиналу, значит завести в бакете второй такой же.
   */
  const bake = useCallback(
    async (src: string, adjust?: AdjustHandoff) => {
      const params = adjust?.params ?? ADJUST_ZERO;
      if (!src || (!strokesRef.current.length && adjustIsZero(params))) return null;
      return bakePicture({
        src,
        strokes: strokesRef.current,
        baseSize: { w: baseSize.w, h: baseSize.h },
        adjust: params,
        source: adjust?.source ?? null,
      });
    },
    [baseSize.w, baseSize.h],
  );

  const saveImage = useCallback(
    async (src: string, filename?: string, adjust?: AdjustHandoff) => {
      setSaving(true);
      try {
        const out = await bake(src, adjust);
        if (!out) return;
        downloadHref(out.toDataURL('image/png'), filename || 'annotated.png');
      } finally {
        setSaving(false);
      }
    },
    [bake],
  );

  /** Тот же файл, но байтами для двери хозяина: полоса заведёт его новой картинкой. */
  const bakeDataUrl = useCallback(
    async (src: string, adjust?: AdjustHandoff) => {
      setSaving(true);
      try {
        const out = await bake(src, adjust);
        return out ? out.toDataURL('image/png') : null;
      } finally {
        setSaving(false);
      }
    },
    [bake],
  );

  return {
    drawMode,
    setDrawMode,
    toggleDrawMode,
    color,
    setColor,
    colors: ANNOTATE_COLORS,
    width,
    setWidth,
    widths: ANNOTATE_WIDTHS,
    hasStrokes,
    undo,
    clear,
    saving,
    saveImage,
    bakeDataUrl,
    canvasRef,
    canvasHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishStroke,
      onPointerCancel: finishStroke,
    },
  };
}

/** Hand a data/blob url to the browser as a file download. */
export function downloadHref(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * The untouched file, as a download. A bare `<a download>` on a foreign origin is ignored by the
 * browser (it navigates instead), so the bytes come through the same CORS proxy the baker uses.
 */
export async function downloadOriginal(src: string, filename: string) {
  const dataUrl = await urlToDataUrl(src);
  downloadHref(dataUrl, filename);
}

/**
 * ОДНА РУЧКА КОРРЕКЦИИ. ОРГАН — НАТИВНЫЙ `input[type=range]` ПОД `accent-color`, как полоса зума у
 * кадрирования: клавиатура (стрелки, Home/End), автоповтор, касание и перетаскивание уже написаны
 * в браузере, а свой ползунок — переизобретение стандартного органа, которое продукт запрещает
 * прямо. `accent-bgColor` не украшение: без него браузер красит ход системным синим, а синий в
 * этой системе значит «в полёте».
 */
export function AdjustRange({
  name,
  probe,
  value,
  min,
  max,
  valueText,
  disabled,
  big,
  onChange,
}: {
  name: string;
  probe: string;
  value: number;
  min: number;
  max: number;
  /** The signed value, also for the screen reader: «−30» and «30» are two different pictures. */
  valueText: string;
  disabled: boolean;
  /** Phone: one tall slider with a thumb-sized hit area. */
  big?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type='range'
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      aria-label={name}
      aria-valuetext={valueText}
      data-probe={`adjust-${probe}`}
      title={`${name} — double-click to reset`}
      onChange={(e) => onChange(Number(e.target.value))}
      onDoubleClick={() => onChange(0)}
      className={cn(
        'min-w-0 flex-1 cursor-pointer accent-bgColor',
        big ? 'h-11' : 'h-6',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor',
        'disabled:cursor-default disabled:opacity-40',
      )}
    />
  );
}
