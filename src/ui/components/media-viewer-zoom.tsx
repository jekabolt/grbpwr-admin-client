import {
  DownloadIcon,
  Half2Icon,
  Pencil1Icon,
  RotateCounterClockwiseIcon,
  TrashIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@radix-ui/react-icons';
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

/** Pen weights, in image-space px. `fine` is for marking a stitch line, `bold` for circling a panel. */
export const ANNOTATE_WIDTHS = [
  { name: 'fine', value: 2 },
  { name: 'medium', value: 4 },
  { name: 'bold', value: 9 },
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
    open && enabled && status === 'ready' && !adjustIsZero(values) && baseSize.w > 0 && baseSize.h > 0;

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
  const [width, setWidth] = useState<number>(ANNOTATE_WIDTHS[1].value);
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
        const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
        if (!blob) return;
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = filename || 'annotated.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
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

function ToolbarIconButton({
  onClick,
  disabled,
  active,
  label,
  probe,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
  /** Якорь для проб. Роль органа читается по нему, а не по подписи, которая меняется с состоянием. */
  probe?: string;
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
      {...(probe ? { 'data-probe': probe } : {})}
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

/**
 * Словесная кнопка тёмного хрома. Та же кожа, что у глифовой: одна грамматика на весь тулбар,
 * иначе «reset» и «undo» читались бы как органы разных приложений.
 *
 * ВЫКЛЮЧЕННАЯ — НЕ СЕРАЯ ПЛИТА, А КОНТУР (система, «Buttons/Disabled»): гасятся линия и подпись,
 * заливка не появляется.
 */
function ToolbarTextButton({
  onClick,
  disabled,
  label,
  probe,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  probe?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...(probe ? { 'data-probe': probe } : {})}
      className={cn(
        'shrink-0 border px-2 py-1 text-micro uppercase leading-4 tracking-label transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor',
        'border-bgColor/40 text-bgColor hover:bg-bgColor hover:text-textColor',
        'disabled:cursor-not-allowed disabled:border-bgColor/20 disabled:text-bgColor/30 disabled:hover:bg-transparent disabled:hover:text-bgColor/30',
      )}
    >
      {children}
    </button>
  );
}

/**
 * ОДНА РУЧКА КОРРЕКЦИИ: имя, ползунок, число.
 *
 * ОРГАН — НАТИВНЫЙ `input[type=range]` ПОД `accent-color`, как полоса зума у кадрирования
 * (`crop-range`) и рейка кисти: клавиатура (стрелки, Home/End), автоповтор, касание и
 * перетаскивание уже написаны в браузере, а свой ползунок — это переизобретение стандартного
 * органа, которое продукт запрещает прямо, и вдобавок потеря всего перечисленного.
 *
 * `accent-bgColor` НЕ УКРАШЕНИЕ: без него браузер красит ход системным синим — цветом, который в
 * этой системе обязан значить «в полёте» и не значит здесь ничего.
 *
 * Число слева от края фиксированной ширины и `tabular-nums`: иначе ряд дёргался бы на каждой
 * смене разряда, пока ручку ведут.
 */
function AdjustSlider({
  name,
  probe,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
}: {
  name: string;
  probe: string;
  value: number;
  min: number;
  max: number;
  unit: '' | '%';
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const shown =
    unit === '%' ? `${value}%` : value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
  return (
    <label className='flex shrink-0 items-center gap-1.5'>
      <span className='text-micro uppercase tracking-label text-bgColor/70'>{name}</span>
      <input
        type='range'
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={name}
        // Читалке объявляется ЗНАЧЕНИЕ СО ЗНАКОМ, а не голое число хода: «минус тридцать» и
        // «тридцать» — это две разные картинки, и различать их обязан и голос.
        aria-valuetext={shown}
        data-probe={`adjust-${probe}`}
        title={`${name} — double-click to reset`}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        className={cn(
          'h-[14px] w-24 min-w-0 cursor-pointer accent-bgColor',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor',
          'disabled:cursor-default disabled:opacity-40',
        )}
      />
      <span className='w-8 shrink-0 text-right text-micro tabular-nums'>{shown}</span>
    </label>
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
  width: number;
  onWidthChange: (w: number) => void;
  widths: readonly { name: string; value: number }[];
  hasStrokes: boolean;
  onUndo: () => void;
  onClear: () => void;
  /** Flatten the ink onto the picture and download it. Omitted where there is nothing to save to. */
  onSave?: () => void;
  saving?: boolean;
  /* ── Коррекция кадра (J-13). Ряд ручек живёт ЗДЕСЬ, потому что он такой же сеансовый орган
        поверх снимка, как перо: одно место — один закон сброса. ── */
  adjustOpen: boolean;
  onToggleAdjust: () => void;
  adjust: AdjustParams;
  onAdjustChange: (next: AdjustParams) => void;
  onAdjustReset: () => void;
  /** Пока подложка не привезена, ручки заперты — и сказано, почему. */
  adjustStatus: 'idle' | 'loading' | 'ready' | 'failed';
  /**
   * Завести результат НОВОЙ КАРТИНКОЙ у хозяина просмотрщика. Absent — хозяина нет (библиотека),
   * и единственная дверь наружу это «скачать», как было до J-13.
   */
  onSaveAsPicture?: () => void;
}

/** Floating bottom-center toolbar: zoom controls always shown, draw controls
 * (pen weight / colors / undo / clear) appear once draw mode is toggled on, and the three
 * correction knobs appear on their own row once `adjust` is toggled on. */
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
  width,
  onWidthChange,
  widths,
  hasStrokes,
  onUndo,
  onClear,
  onSave,
  saving,
  adjustOpen,
  onToggleAdjust,
  adjust,
  onAdjustChange,
  onAdjustReset,
  adjustStatus,
  onSaveAsPicture,
}: ZoomDrawToolbarProps) {
  const knobsLive = adjustStatus === 'ready';
  /** Нечего запекать: ни чернил, ни коррекции. Обе двери наружу тогда заперты, и это честно. */
  const nothingToBake = !hasStrokes && adjustIsZero(adjust);
  return (
    <div
      role='toolbar'
      aria-label='Image zoom, adjust and drawing controls'
      // Stop clicks/gestures on the toolbar itself from reaching the stage's
      // close-on-background-click and pan/swipe handling.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      /* ЦЕНТРИРОВАНИЕ ПОЛЯМИ, А НЕ СДВИГОМ. `left-1/2 + -translate-x-1/2` центрирует картинкой, но
         ШИРИНУ при этом считает от левого края до правого края сцены — то есть ровно половину, — и
         ряд ручек ломался на две строки посреди пустого экрана. `left-3 right-3` + `w-fit` даёт
         тот же центр и всю ширину. */
      className='absolute bottom-3 left-3 right-3 z-10 mx-auto flex w-fit flex-col items-center gap-1.5'
    >
      {/* РЯД РУЧЕК СТОИТ НАД РЯДОМ КНОПОК, А НЕ ПОД НИМ. Кнопки — постоянный орган, и они обязаны
          оставаться на одном расстоянии от низа сцены: ряд, вставший снизу, толкал бы их вверх на
          каждое открытие, и человек попадал бы мимо той кнопки, в которую целился. */}
      {adjustOpen && (
        <div
          data-probe='adjust-row'
          className='flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 border border-bgColor/40 bg-black/40 px-2 py-1 backdrop-blur-sm'
        >
          <AdjustSlider
            name='brightness'
            probe='brightness'
            value={adjust.brightness}
            min={-100}
            max={100}
            unit=''
            disabled={!knobsLive}
            onChange={(v) => onAdjustChange({ ...adjust, brightness: v })}
          />
          <AdjustSlider
            name='contrast'
            probe='contrast'
            value={adjust.contrast}
            min={-100}
            max={100}
            unit=''
            disabled={!knobsLive}
            onChange={(v) => onAdjustChange({ ...adjust, contrast: v })}
          />
          <AdjustSlider
            name='black point'
            probe='black'
            value={adjust.black}
            min={0}
            max={50}
            unit='%'
            disabled={!knobsLive}
            onChange={(v) => onAdjustChange({ ...adjust, black: v })}
          />
          {/* Внутренняя линейка ряда — `/20`, как между строками панели сведений; внешний контур
              коробки — `/40`. Две ступени, не одна. */}
          <span aria-hidden className='h-4 w-px shrink-0 bg-bgColor/20' />
          {!knobsLive && (
            <span className='shrink-0 text-micro text-bgColor/70'>
              {adjustStatus === 'failed' ? 'pixels unreadable' : 'reading pixels…'}
            </span>
          )}
          <ToolbarTextButton
            label='Reset adjustments'
            probe='adjust-reset'
            onClick={onAdjustReset}
            disabled={adjustIsZero(adjust)}
          >
            reset
          </ToolbarTextButton>
          {onSaveAsPicture && (
            <ToolbarTextButton
              label='Save as a new picture'
              probe='save-as-picture'
              onClick={onSaveAsPicture}
              disabled={nothingToBake || !!saving}
            >
              save as a new picture
            </ToolbarTextButton>
          )}
        </div>
      )}

      <div className='flex max-w-full flex-wrap items-center justify-center gap-1.5'>
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
        {/* ЧИП КОРРЕКЦИИ — В ТОЙ ЖЕ КОРОБКЕ, ЧТО КАРАНДАШ, И ПЕРЕД НИМ. Это два режима одного
            занятия «поправить снимок», и разводить их по разным группам значило бы сказать, что они
            из разных семейств. ПЕРЕД, а не после: когда перо раскрыто, его собственные органы
            (вес, цвет, откат, очистка) идут следом за ним сплошняком — чип, поставленный в хвост,
            оказался бы за корзиной и читался бы как ещё один инструмент рисования.
            Глиф — половина круга, обычный знак контраста. */}
        <ToolbarIconButton
          label={adjustOpen ? 'Close adjust' : 'Adjust brightness, contrast and black point'}
          probe='adjust-chip'
          active={adjustOpen}
          onClick={onToggleAdjust}
        >
          <Half2Icon className='size-4' />
        </ToolbarIconButton>
        <ToolbarIconButton
          label={drawMode ? 'Exit draw mode' : 'Draw on image'}
          active={drawMode}
          onClick={onToggleDraw}
        >
          <Pencil1Icon className='size-4' />
        </ToolbarIconButton>

        {drawMode && (
          <>
            {/* Pen weight, shown as the dot it draws — a "2 / 4 / 9" label would make you
                translate a number into a line thickness on every pick. */}
            <div role='radiogroup' aria-label='Pen weight' className='ml-1 flex items-center gap-1'>
              {widths.map((w) => (
                <button
                  key={w.value}
                  type='button'
                  role='radio'
                  aria-checked={width === w.value}
                  aria-label={`${w.name} pen`}
                  title={`${w.name} pen`}
                  onClick={() => onWidthChange(w.value)}
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center border transition-colors',
                    width === w.value
                      ? 'border-bgColor bg-bgColor'
                      : 'border-transparent hover:border-bgColor/40',
                  )}
                >
                  <span
                    aria-hidden
                    // Sized off the real pen width, clamped so `bold` still fits the 24px cell.
                    style={{
                      width: Math.min(w.value + 1, 12),
                      height: Math.min(w.value + 1, 12),
                      backgroundColor: width === w.value ? '#000' : color,
                    }}
                    className='block rounded-full'
                  />
                </button>
              ))}
            </div>

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

      {/* ДВЕРИ НАРУЖУ — СВОЯ ГРУППА, А НЕ ХВОСТ ГРУППЫ ПЕРА.
          Раньше «скачать» жила ВНУТРИ пера и показывалась только в режиме рисования — то есть
          человек, который ничего не рисовал, а только поправил яркость, не мог вынести результат
          вовсе, пока не возьмёт карандаш. Дверей две («скачать себе» и «завести картинкой»), они
          одни и те же для чернил и для коррекции, и поэтому стоят снаружи обоих режимов. */}
      {(drawMode || adjustOpen) && onSave && (
        <div className='flex items-center gap-1 border border-bgColor/40 bg-black/40 p-1 backdrop-blur-sm'>
          <ToolbarIconButton
            label={saving ? 'Saving…' : 'Download this picture with the changes'}
            probe='save-download'
            onClick={onSave}
            disabled={nothingToBake || !!saving}
          >
            <DownloadIcon className='size-4' />
          </ToolbarIconButton>
        </div>
      )}
      </div>
    </div>
  );
}
