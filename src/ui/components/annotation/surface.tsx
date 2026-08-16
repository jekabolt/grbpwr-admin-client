'use client';

import { cn } from 'lib/utility';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { ImageCallout, pinSizes, type PinSize } from './marker-note';
import { simplifyPath, simplifyToLimit, type ShapePoint } from './geometry';
import { kindDef, labelKindForPoints } from './kinds';
import { AnnotationDefs, CalloutShape, PlacingShape } from './shapes';

// ПОВЕРХНОСТЬ УКАЗАНИЙ — картинка и всё, что на ней нарисовано и правится.
//
// ОДИН ПРИМИТИВ НА ЧЕТЫРЕ ЭКРАНА. До этого их было два: холст выносок (снимок шага сборки) и
// аннотируемая картинка (эскиз, мудборд, примерка). Обе рисовали одни и те же фигуры, обе считали
// доли кадра, обе изолировали по наведению — и обе делали это своим кодом. Расхождение было не
// теоретическим: у эскиза не было ни правки якорей, ни зума с постановкой, у снимка шага — ни
// панорамы, ни щипка, и каждая починка приезжала ровно на одну поверхность из двух.
//
// РАЗЛИЧАЕТСЯ ТОЛЬКО СЛОЙ ПОДПИСИ, и это ОСЬ (`labelMode`), а не две реализации:
//   • `plate`  — снимок шага: текст живёт В выноске и стоит на снимке рядом со стрелкой. Швея
//                читает лист у машинки, и прыжок глазами в легенду умножается на десяток фото.
//   • `marker` — эскиз и мудборд: на картинке нумерованный маркер, текст в форме и в таблице.
//                Номер это АДРЕС: на него ссылаются деталь кроя, операция и дефект.
// Свести к одному нельзя, не сломав либо печать тех-пака, либо адресацию по номерам.
//
// КООРДИНАТЫ — ДОЛИ КАДРА (0..1). Снимок показывают в разных размерах, печатают и кладут в архив,
// и единственное, что переживает все три, — доля. Пиксели считаются на лету из замера, поэтому
// окружности остаются окружностями при любых пропорциях картинки.
//
// ЧТО МАСШТАБИРУЕТСЯ ПРИ ЗУМЕ, А ЧТО НЕТ: фигуры едут вместе со снимком (они на нём нарисованы),
// подписи, маркеры и ручки — нет (они стекло поверх). Иначе указание, приближённое чтобы
// рассмотреть, показывало бы мимо, а ручка размером в пол-экрана перекрывала бы саму фигуру.
//
// ЗАМОРОЗКА — ПРОПОМ, А НЕ `<fieldset disabled>`. Замерено в Chromium: под задизейбленным
// предком у `<button>` не стреляют `click` и `focus`, но СТРЕЛЯЮТ `pointerdown`, `pointerup`,
// `pointerenter`; порталы вообще вне fieldset. То есть fieldset глушит ЧТЕНИЕ (изоляцию, зум) и
// не глушит запись — ровно наоборот тому, что нужно.

export type { ShapePoint };

export type PenStyle = {
  color: string;
  dashed: boolean;
  filled: boolean;
};

/** Вью-модель одного указания. Владелец данных маппит сюда свою форму и обратно. */
export type SurfaceCallout = {
  /** Стабильная идентичность. НЕ индекс массива: индекс переживает удаление соседа плохо. */
  key: string;
  kind: string;
  /** Якоря фигуры, доли кадра. У пина пуст либо содержит саму точку — решает владелец. */
  points: ShapePoint[];
  /** Плашка (plate) или нумерованный маркер (marker), доли кадра. */
  label: ShapePoint;
  number?: number;
  /** plate: текст на плашке. marker: не используется (текст живёт в записке владельца). */
  text?: string;
  /** marker: полый пин = записки ещё нет. */
  hasText?: boolean;
  color?: string;
  dashed?: boolean;
  filled?: boolean;
  /** plate: детали кроя, о которых указание. */
  pieceLineKeys?: string[];
};

export type AnnotationSurfaceProps = {
  src: string;
  alt?: string;
  media?: 'image' | 'video';
  /** Пропорции кадра для сеточной плитки (`4/5`). */
  aspectRatio?: string;
  /** Фиксированная высота кадра: полоса кадров выстраивается в ровный ряд. */
  heightPx?: number;
  /** Потолок высоты изображения классом — печать. */
  maxHeightClass?: string;
  frameClassName?: string;
  frameStyle?: React.CSSProperties;
  className?: string;

  callouts: SurfaceCallout[];
  labelMode: 'plate' | 'marker';

  // ЗАПИСЬ — ГРАНУЛЯРНЫМИ КОЛБЭКАМИ, а не «отдай весь массив». У эскиза массив живёт в RHF под
  // двумя useFieldArray, и валовая запись повторила бы гонку, из-за которой пин появлялся на
  // картинке, но не в списке. Отсутствие onAdd/onEdit* = поверхность только читается.
  onAdd?: (kind: string, points: ShapePoint[], pen: PenStyle) => void;
  onEditPoints?: (key: string, points: ShapePoint[]) => void;
  onMoveLabel?: (key: string, at: ShapePoint) => void;
  onRemove?: (key: string) => void;
  onSelect?: (key: string | null) => void;

  frozen?: boolean;

  /** Инструмент задаётся СНАРУЖИ (панель одна на полосу/лист), точки копятся ВНУТРИ. */
  tool?: string | null;
  /** Одноразовый вид поставлен — панель снимает выбор. */
  onToolDone?: () => void;

  /** plate: редактор выбранного указания. Рисуется под кадром. */
  renderEditor?: (key: string, opts: { close: () => void }) => ReactNode;
  /** plate: имя детали по ключу — для плашки и легенды. */
  pieceLabel?: (lineKey: string) => string | undefined;

  /** marker: тело записки. */
  renderNote?: (key: string, opts: { close: () => void }) => ReactNode;
  noteTitle?: (key: string) => string | undefined;
  showAllNotes?: boolean;
  pinSize?: PinSize;
  noteClassName?: string;

  /** Колесо/щипок/панорама. Живёт только в увеличенном виде: инлайн колесо скроллит страницу. */
  zoom?: boolean;
  /** Слой указаний целиком не рисуется — смотреть сам снимок. */
  hideCallouts?: boolean;
  /**
   * Белая подложка под линиями. Включена на ФОТО (снимок узла, мудборд, примерка): чернильная
   * линия на пёстром снимке тонет. На штриховом эскизе выключена — подложка перекрыла бы чертёж.
   */
  halo?: boolean;
  cornerSlot?: ReactNode;
  /** Плоский клик по пустому кадру в режиме чтения (инлайн-плитка открывает увеличенный вид). */
  onBackgroundView?: () => void;
  /** Предел числа указаний на кадре — зеркало серверного. */
  maxCallouts?: number;
  /** Сколько якорей набрано в незавершённом жесте — подсказку рисует ПАНЕЛЬ, а она снаружи. */
  onPlacedCountChange?: (n: number) => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const WHEEL_STEP = 1.18;
/** Порог, разводящий клик и перетаскивание. ЭКРАННЫЕ пиксели — доля кадра зависела бы от ширины. */
const CLICK_MOVE_THRESHOLD = 6;
/** Радиус захвата замыкания зоны и попадания по штриху, экранные пиксели. */
const SNAP_RADIUS = 12;
const HIT_WIDTH = 12;
/** Прореживание следа: расстояние в экранных пикселях, ниже которого точку не видно. */
const INK_EPSILON = 1.5;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * ПАМЯТЬ ПЕРА — модульная, одна на приложение. У человека одна рука: выбрав красный пунктир, он
 * рисует им дальше, а не переназначает цвет каждой новой фигуре. Держать память на поверхности
 * значило бы, что в полосе из десяти кадров цвет сбрасывается при переходе к соседнему снимку.
 */
const pen: PenStyle = { color: '', dashed: false, filled: false };
export function rememberPen(next: Partial<PenStyle>) {
  Object.assign(pen, next);
}

/**
 * РЕЕСТР ЖИВЫХ ПОВЕРХНОСТЕЙ — «правка ровно одна на экране».
 *
 * Поверхностей на экране до десяти (полоса кадров) плюс одиннадцатая в зуме. Локальные выбор и
 * незавершённые точки превращаются при этом в три дефекта: Delete срабатывает у ОБОИХ слушателей
 * window и уносит две выноски с разных снимков; наполовину набранная мерка на A достраивается
 * кликом по A уже после того, как начали новую на B; выбор в зуме и снаружи расходятся.
 *
 * Лечится одним правилом: поверхность, начавшая правку, гасит правку у всех остальных.
 */
type SurfaceClaim = { clear: () => void };
const liveSurfaces = new Set<SurfaceClaim>();
function claimEditing(me: SurfaceClaim) {
  for (const other of liveSurfaces) if (other !== me) other.clear();
}

type Drag =
  | { what: 'label'; key: string; offX: number; offY: number; at: ShapePoint; moved: boolean }
  | { what: 'handle'; key: string; index: number; at: ShapePoint; moved: boolean }
  | { what: 'shape'; key: string; from: ShapePoint; base: ShapePoint[]; moved: boolean };

export function AnnotationSurface({
  src,
  alt,
  media = 'image',
  aspectRatio,
  heightPx,
  maxHeightClass,
  frameClassName,
  frameStyle,
  className,
  callouts,
  labelMode,
  onAdd,
  onEditPoints,
  onMoveLabel,
  onRemove,
  onSelect,
  frozen = false,
  tool = null,
  onToolDone,
  renderEditor,
  pieceLabel,
  renderNote,
  noteTitle,
  showAllNotes = false,
  pinSize = 'md',
  noteClassName,
  zoom = false,
  hideCallouts = false,
  halo = false,
  cornerSlot,
  onBackgroundView,
  maxCallouts,
  onPlacedCountChange,
}: AnnotationSurfaceProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Наведение и выбор — РАЗНЫЕ состояния: наведение изолирует (мышь), выбор открывает правку и
  // переживает уход курсора, иначе редактор закрывался бы от каждого движения.
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** Вооружённая ручка: Delete тогда уносит ТОЧКУ, а не всю фигуру. */
  const [armed, setArmed] = useState<{ key: string; index: number } | null>(null);

  // Незавершённая постановка. ВИД приходит снаружи (панель одна на полосу/лист), точки копятся
  // здесь: они принадлежат ЭТОМУ снимку, и общий счётчик достраивал бы мерку, начатую на первом
  // кадре, вторым кликом по третьему.
  const [points, setPoints] = useState<ShapePoint[]>([]);
  const [cursor, setCursor] = useState<ShapePoint | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDragBoth = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  }, []);
  /** Клик после перетаскивания — эхо, и открывать редактор он не должен. */
  const justDragged = useRef(false);
  /** Смещение перетаскиваемой фигуры целиком — читается и отрисовкой, и записью на отпускании. */
  const lastShapeDelta = useRef({ x: 0, y: 0 });

  // Зум и панорама. Живые значения в ref'ах (их читают слушатели), зеркало в состоянии — рендер.
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const [scale, setScaleState] = useState(1);
  const [pos, setPosState] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const setScale = (s: number) => {
    scaleRef.current = s;
    setScaleState(s);
  };
  const setPos = (p: { x: number; y: number }) => {
    posRef.current = p;
    setPosState(p);
  };

  const editable = !frozen && !!(onAdd || onEditPoints || onMoveLabel || onRemove);
  const def = kindDef(tool);
  const placing = editable && !!tool;
  const full = maxCallouts != null && callouts.length >= maxCallouts;

  // ЗАПИСЬ ИДЁТ ЧЕРЕЗ liveRef, А НЕ ЧЕРЕЗ ЗАМЫКАНИЕ. Слушатели на window переживают рендер, а
  // право писать и КУДА писать обязаны читаться на момент записи: карточку могли выпустить, пока
  // палец на плашке, а колбэк владельца несёт индекс кадра, который стрелка «раньше» уже сдвинула.
  const live = useRef({ editable, onEditPoints, onMoveLabel, onRemove, callouts });
  live.current = { editable, onEditPoints, onMoveLabel, onRemove, callouts };

  const byKey = useMemo(() => new Map(callouts.map((c) => [c.key, c])), [callouts]);

  // Заявка на правку: идентичность стабильна на всю жизнь поверхности, функции читают свежие
  // сеттеры — реестр хранит ОДИН объект и не пересобирается на каждый рендер.
  const claimRef = useRef<SurfaceClaim>({ clear: () => {} });
  claimRef.current.clear = () => {
    setSelected(null);
    setArmed(null);
    setPoints([]);
  };
  useEffect(() => {
    const me = claimRef.current;
    liveSurfaces.add(me);
    return () => {
      liveSurfaces.delete(me);
    };
  }, []);

  /**
   * ФОКУС РЕДАКТОРА СТРЕЛЯЕТ ТОЛЬКО ИЗ ЖЕСТА ВЫБОРА. Раньше он висел эффектом на данных, а данные
   * приезжают из `useWatch` новой ссылкой на КАЖДУЮ запись под шагом — в том числе на ввод подписи
   * к кадру. Курсор прыгал в поле выноски после первого набранного символа, и подпись к снимку
   * было не набрать. Одноразовый флаг: поставил жест — редактор его снял.
   */
  const focusOnce = useRef(false);
  /**
   * Только что поставленная фигура ждёт выбора. Ключ новой выноски знает ВЛАДЕЛЕЦ (она приедет
   * следующим рендером), поэтому выбор делается по её появлению — но по одноразовому флагу из
   * жеста, а не по факту роста массива: массив растёт и от чужой правки в соседней вкладке.
   */
  const pendingSelect = useRef(false);
  const takeFocusRequest = useCallback(() => {
    const v = focusOnce.current;
    focusOnce.current = false;
    return v;
  }, []);

  const select = useCallback(
    (key: string | null, opts?: { focus?: boolean }) => {
      if (key !== null) claimEditing(claimRef.current);
      focusOnce.current = !!opts?.focus;
      setSelected(key);
      setArmed(null);
      onSelect?.(key);
    },
    [onSelect],
  );

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Смена инструмента обнуляет набранное: две точки мерки не годятся началом дуги. СИНХРОННО,
  // а не эффектом: между сменой и уборкой был бы кадр, в котором вид уже null, а точки ещё есть,
  // и всё, что читает правила вида по точкам, получало бы их у несуществующего вида.
  const prevTool = useRef(tool);
  if (prevTool.current !== tool) {
    prevTool.current = tool;
    if (points.length) setPoints([]);
    if (cursor) setCursor(null);
  }

  useEffect(() => {
    onPlacedCountChange?.(points.length);
  }, [points.length, onPlacedCountChange]);

  const count = callouts.length;
  const prevCount = useRef(count);
  useEffect(() => {
    const grew = count > prevCount.current;
    prevCount.current = count;
    if (!grew || !pendingSelect.current) return;
    pendingSelect.current = false;
    select(callouts[count - 1].key, { focus: true });
    // `callouts` намеренно не в зависимостях: эффект реагирует на ПОЯВЛЕНИЕ выноски, а не на
    // каждую правку её текста — иначе он бы стрелял на ввод и возвращал сюда фокус из подписи.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const px = useCallback((p: ShapePoint) => ({ x: p.x * size.w, y: p.y * size.h }), [size]);
  /** Экранный пиксель в долях кадра — пороги захвата обязаны быть экранными, а не кадровыми. */
  const unitPerPx = size.w > 0 ? 1 / (size.w * (zoom ? scale : 1)) : 0;

  /** Экранная точка → доля кадра, БЕЗ клампа: клик мимо картинки обязан быть отличим. */
  const rawAt = useCallback((clientX: number, clientY: number): ShapePoint | null => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const cx = clientX - r.left - r.width / 2;
    const cy = clientY - r.top - r.height / 2;
    const s = scaleRef.current;
    const p = posRef.current;
    return {
      x: 0.5 + (cx - p.x) / s / r.width,
      y: 0.5 + (cy - p.y) / s / r.height,
    };
  }, []);
  const at = useCallback(
    (clientX: number, clientY: number): ShapePoint => {
      const raw = rawAt(clientX, clientY);
      return raw ? { x: clamp01(raw.x), y: clamp01(raw.y) } : { x: 0, y: 0 };
    },
    [rawAt],
  );

  // ── ПОСТАНОВКА ────────────────────────────────────────────────────────────────────────────────

  const finishPlacing = useCallback(
    (kind: string, pts: ShapePoint[]) => {
      const d = kindDef(kind);
      if (pts.length < d.points[0]) return;
      setPoints([]);
      setCursor(null);
      if (!full) {
        // Вид ХРАНЕНИЯ у подписи считается по числу якорей: панель знает один вид, провод
        // различает одну стрелку и несколько. Различие — счётчик, поэтому его считают.
        const stored = d.key === 'label' || d.key === 'multi' ? labelKindForPoints(pts.length) : d.key;
        onAdd?.(stored, pts, { ...pen, filled: d.fillable ? pen.filled : false });
        // ТРЕТИЙ ТАКТ ЖЕСТА «клик-клик-ввод»: поставленная фигура выбирается сама и открывает
        // редактор. Кроме липкого инструмента: там штрихуют сериями, и открытый редактор после
        // каждого штриха превращает набросок в процедуру.
        pendingSelect.current = !d.sticky;
      }
      // Липкий инструмент (маркер) остаётся включённым: штрихуют сериями, и перевыбор чипа между
      // штрихами превращает набросок в процедуру.
      if (!d.sticky) onToolDone?.();
    },
    [full, onAdd, onToolDone],
  );

  const cancelPlacing = useCallback(() => {
    setPoints([]);
    setCursor(null);
    onToolDone?.();
  }, [onToolDone]);

  /** Курсор в радиусе замыкания у первой вершины зоны — и вершин уже хватает, чтобы замкнуть. */
  // Радиус захвата — ЭКРАННЫЙ: в долях кадра он растягивался бы вместе с картинкой, и на узком
  // кадре замыкание срабатывало бы за три пикселя, а на широком — за тридцать.
  const snapClose = (() => {
    if (def.grammar !== 'polygon' || points.length < def.points[0] || !cursor) return false;
    const a = px(cursor);
    const b = px(points[0]);
    return Math.hypot(a.x - b.x, a.y - b.y) * (zoom ? scale : 1) < SNAP_RADIUS;
  })();

  const addPlacementPoint = (p: ShapePoint) => {
    // Первая точка ЗДЕСЬ отменяет наполовину набранное у соседей: жест принадлежит одному снимку.
    if (points.length === 0) claimEditing(claimRef.current);
    if (def.grammar === 'arc') {
      // Начало → конец → ИЗГИБ. Хранится [начало, точка на кривой, конец]: порядок кликов и
      // порядок хранения различаются намеренно — ставящему нужна кривая под курсором, а не три
      // слепых клика, после которых видно, что получилось.
      if (points.length < 2) {
        setPoints([...points, p]);
        return;
      }
      finishPlacing('arc', [points[0], p, points[1]]);
      return;
    }
    if (def.grammar === 'polygon') {
      if (snapClose) {
        finishPlacing('polygon', points);
        return;
      }
      const next = [...points, p];
      if (next.length >= def.points[1]) finishPlacing('polygon', next);
      else setPoints(next);
      return;
    }
    const next = [...points, p];
    if (next.length >= def.points[1]) finishPlacing(def.key, next);
    else setPoints(next);
  };

  // ── ЖЕСТЫ НА КАДРЕ ────────────────────────────────────────────────────────────────────────────

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ prev: number } | null>(null);
  const pan = useRef<{
    id: number;
    startX: number;
    startY: number;
    fromX: number;
    fromY: number;
    moved: boolean;
  } | null>(null);
  /** Живой штрих маркера. В ref, потому что его дописывает слушатель движения. */
  const inking = useRef<{ id: number; pts: ShapePoint[] } | null>(null);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const prev = scaleRef.current;
    const next = clamp(prev * factor, MIN_SCALE, MAX_SCALE);
    if (next === prev) return;
    const cx = clientX - r.left - r.width / 2;
    const cy = clientY - r.top - r.height / 2;
    const ratio = next / prev;
    const p = posRef.current;
    const maxX = Math.max(0, (r.width * next - r.width) / 2);
    const maxY = Math.max(0, (r.height * next - r.height) / 2);
    setScale(next);
    setPos({
      x: clamp(cx - (cx - p.x) * ratio, -maxX, maxX),
      y: clamp(cy - (cy - p.y) * ratio, -maxY, maxY),
    });
  }, []);

  // Колесо требует непассивного слушателя, иначе preventDefault не остановит прокрутку страницы.
  // Вешается ТОЛЬКО в увеличенном виде: инлайн-плитка не должна перехватывать колесо, иначе
  // прокрутка страницы над сеткой эскизов зумит миниатюру.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !zoom) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, zoomAt]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  function onFramePointerDown(e: ReactPointerEvent) {
    // Эхо прошлого перетаскивания снимается ЗДЕСЬ, а не только там, где его читают: жест,
    // кончившийся мимо плашки, оставлял флаг поднятым, и следующий клик по совсем другой выноске
    // молча проглатывался.
    justDragged.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // ЩИПОК ОТМЕНЯЕТ НЕЗАКОНЧЕННЫЙ ШТРИХ. Полштриха, закоммиченного вторым пальцем, человек не
    // просил: он менял масштаб, а не рисовал.
    if (zoom && pointers.current.size === 2) {
      inking.current = null;
      pan.current = null;
      const [a, b] = Array.from(pointers.current.values());
      if (a && b) pinch.current = { prev: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (pointers.current.size !== 1) return;

    if (placing && def.grammar === 'ink') {
      const p = at(e.clientX, e.clientY);
      claimEditing(claimRef.current);
      inking.current = { id: e.pointerId, pts: [p] };
      setPoints([p]);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (zoom) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pan.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      fromX: posRef.current.x,
      fromY: posRef.current.y,
      moved: false,
    };
  }

  function onFramePointerMove(e: ReactPointerEvent) {
    if (placing && def.grammar !== 'ink') {
      const p = at(e.clientX, e.clientY);
      setCursor(p);
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const ink = inking.current;
    if (ink && ink.id === e.pointerId) {
      const p = at(e.clientX, e.clientY);
      const last = ink.pts[ink.pts.length - 1];
      // Отсев совпавших отсчётов до RDP: браузер шлёт движение и без смещения, и такие точки
      // разбавляют след, не неся о нём ничего.
      if (Math.hypot(p.x - last.x, p.y - last.y) > unitPerPx * 0.5) {
        ink.pts.push(p);
        setPoints([...ink.pts]);
      }
      return;
    }

    if (zoom && pointers.current.size === 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.prev > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.current.prev);
      pinch.current.prev = dist;
      return;
    }

    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.moved && Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) {
      p.moved = true;
      if (zoom && scaleRef.current > 1) setPanning(true);
    }
    if (p.moved && zoom && scaleRef.current > 1) {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const maxX = Math.max(0, (r.width * scaleRef.current - r.width) / 2);
      const maxY = Math.max(0, (r.height * scaleRef.current - r.height) / 2);
      setPos({ x: clamp(p.fromX + dx, -maxX, maxX), y: clamp(p.fromY + dy, -maxY, maxY) });
    }
  }

  function releasePointer(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pan.current?.id === e.pointerId) {
      pan.current = null;
      setPanning(false);
    }
  }

  function onFramePointerUp(e: ReactPointerEvent) {
    const ink = inking.current;
    if (ink && ink.id === e.pointerId) {
      inking.current = null;
      releasePointer(e);
      // ПРОРЕЖИВАНИЕ ПЕРЕД ЗАПИСЬЮ, а не при отрисовке: сырой след уезжает в JSON-колонку, в
      // отпечаток секции и в каждое чтение карточки. Порог — экранный, тот, который видел рисующий.
      const eps = INK_EPSILON * unitPerPx;
      // Порог не бывает нулевым: в зуме ×6 он мельчает, но ноль означал бы «не прореживать».
      const thinned = simplifyToLimit(
        ink.pts.length > 2 ? simplifyPath(ink.pts, Math.max(eps, 1e-5)) : ink.pts,
        kindDef('ink').points[1],
      );
      setPoints([]);
      if (thinned.length >= 2) finishPlacing('ink', thinned);
      return;
    }

    const p = pan.current;
    const wasPress = p?.id === e.pointerId;
    const moved = !!p?.moved;
    releasePointer(e);
    if (!wasPress || moved) return;

    if (placing) {
      // Клик мимо картинки отвергается, а не прижимается к краю: иначе промах родил бы фантомную
      // точку на самой кромке, которую потом ищут глазами.
      const raw = rawAt(e.clientX, e.clientY);
      const EPS = 0.001;
      if (!raw || raw.x < -EPS || raw.x > 1 + EPS || raw.y < -EPS || raw.y > 1 + EPS) return;
      addPlacementPoint({ x: clamp01(raw.x), y: clamp01(raw.y) });
      return;
    }
    if (selected !== null) {
      select(null);
      return;
    }
    onBackgroundView?.();
  }

  // ── ПЕРЕТАСКИВАНИЕ ────────────────────────────────────────────────────────────────────────────
  //
  // Слушатели на window, а не на самом органе: ручка размером в десять пикселей, и указатель
  // сходит с неё на первом же движении — на самой ручке жест обрывался бы сразу. Подписка
  // держится, ПОКА ЖЕСТ ЖИВ, а не пересоздаётся на каждое движение.

  const dragging = drag !== null;
  useEffect(() => {
    // Карточку выпустили посреди жеста — жест обрывается сразу, не дожидаясь отпускания.
    if (dragging && !editable) setDragBoth(null);
  }, [dragging, editable, setDragBoth]);

  useEffect(() => {
    if (!dragging) return;
    const point = (e: PointerEvent) => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r || r.width === 0) return null;
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      const s = scaleRef.current;
      const q = posRef.current;
      return {
        x: clamp01(0.5 + (cx - q.x) / s / r.width),
        y: clamp01(0.5 + (cy - q.y) / s / r.height),
      };
    };
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const p = point(e);
      if (!p) return;
      if (d.what === 'label') {
        const nx = clamp01(p.x - d.offX);
        const ny = clamp01(p.y - d.offY);
        if (!d.moved && Math.hypot((nx - d.at.x) * size.w, (ny - d.at.y) * size.h) <= CLICK_MOVE_THRESHOLD)
          return;
        setDragBoth({ ...d, moved: true, at: { x: nx, y: ny } });
        return;
      }
      if (d.what === 'handle') {
        if (!d.moved && Math.hypot((p.x - d.at.x) * size.w, (p.y - d.at.y) * size.h) <= CLICK_MOVE_THRESHOLD)
          return;
        setDragBoth({ ...d, moved: true, at: p });
        return;
      }
      const dx = p.x - d.from.x;
      const dy = p.y - d.from.y;
      if (!d.moved && Math.hypot(dx * size.w, dy * size.h) <= CLICK_MOVE_THRESHOLD) return;
      // Смещение — ПЕРЕД состоянием: его читает отрисовка во время рендера, и обратный порядок
      // держался бы только на том, что React рендерит после обработчика.
      lastShapeDelta.current = { x: dx, y: dy };
      setDragBoth({ ...d, moved: true, from: d.from, base: d.base });
    };
    const up = () => {
      const d = dragRef.current;
      setDragBoth(null);
      if (!d?.moved) return;
      justDragged.current = true;
      // ПРАВО НА ЗАПИСЬ ПРОВЕРЯЕТСЯ В МОМЕНТ ЗАПИСИ, а не в момент начала жеста.
      const l = live.current;
      if (!l.editable) return;
      if (d.what === 'label') {
        l.onMoveLabel?.(d.key, d.at);
        return;
      }
      const c = l.callouts.find((x) => x.key === d.key);
      if (!c) return;
      if (d.what === 'handle') {
        l.onEditPoints?.(
          d.key,
          c.points.map((p, i) => (i === d.index ? d.at : p)),
        );
        return;
      }
      const delta = lastShapeDelta.current;
      const shifted = d.base.map((p) => ({ x: clamp01(p.x + delta.x), y: clamp01(p.y + delta.y) }));
      l.onEditPoints?.(d.key, shifted);
      // Плашка едет вместе с фигурой: иначе перенос указания оставлял бы подпись у старого места,
      // и лидер тянулся бы через весь кадр.
      l.onMoveLabel?.(d.key, { x: clamp01(c.label.x + delta.x), y: clamp01(c.label.y + delta.y) });
    };
    const cancel = () => {
      justDragged.current = !!dragRef.current?.moved;
      setDragBoth(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [dragging, setDragBoth, size.w, size.h]);

  // ── КЛАВИАТУРА ────────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      // НЕ КОГДА КУРСОР В ПОЛЕ ВВОДА: там те же клавиши стирают букву, и перехватить их значило
      // бы удалять выноску при правке её же подписи.
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      // И НЕ КОГДА ПОВЕРХНОСТЬ НА СКРЫТОЙ ВКЛАДКЕ. Вкладки карточки смонтированы все разом
      // (переключение — это `hidden`), слушатель висит на window, а выбор переживает уход с
      // вкладки: без проверки Delete уносил выноску с невидимого экрана, молча.
      const visible = !!boxRef.current?.isConnected && boxRef.current.offsetParent !== null;
      if (!visible) return;

      if (e.key === 'Escape') {
        // ЛЕСТНИЦА: вооружённая ручка → выбор → инструмент. Один Esc — один шаг: иначе выход из
        // режима правки точки гасил бы заодно и инструмент, который выбирали отдельно.
        if (armed) setArmed(null);
        else if (selected !== null) select(null);
        else if (tool) cancelPlacing();
        return;
      }
      if (e.key === 'Enter' && !typing && placing && points.length >= def.points[0]) {
        e.preventDefault();
        finishPlacing(def.key, points);
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (typing) return;
      // Delete/Backspace ОБЕ намеренно: на маковской клавиатуре «Delete» — это Backspace, и
      // обещать жест, которого у половины команды физически нет, хуже, чем не обещать вовсе.
      if (armed) {
        const c = byKey.get(armed.key);
        if (!c) return;
        const d = kindDef(c.kind);
        if (c.points.length <= d.points[0]) return;
        e.preventDefault();
        const next = c.points.filter((_, i) => i !== armed.index);
        setArmed(null);
        live.current.onEditPoints?.(armed.key, next);
        return;
      }
      if (selected === null) return;
      e.preventDefault();
      live.current.onRemove?.(selected);
      select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, armed, selected, tool, placing, points, def, byKey, select, cancelPlacing, finishPlacing]);

  // ── ОТРИСОВКА ─────────────────────────────────────────────────────────────────────────────────

  const isolatedKey = placing ? null : hovered;
  const dim = (key: string) => isolatedKey !== null && isolatedKey !== key;
  const inv = 1 / (zoom ? scale || 1 : 1);

  /** Транзиентная геометрия фигуры во время перетаскивания — иначе линия «отстаёт» от руки. */
  const pointsOf = (c: SurfaceCallout): ShapePoint[] => {
    const d = drag;
    if (!d || d.key !== c.key || !d.moved) return c.points;
    if (d.what === 'handle') return c.points.map((p, i) => (i === d.index ? d.at : p));
    if (d.what === 'shape') {
      const delta = lastShapeDelta.current;
      return d.base.map((p) => ({ x: clamp01(p.x + delta.x), y: clamp01(p.y + delta.y) }));
    }
    return c.points;
  };
  const labelOf = (c: SurfaceCallout): ShapePoint => {
    const d = drag;
    if (!d || d.key !== c.key || !d.moved) return c.label;
    if (d.what === 'label') return d.at;
    if (d.what === 'shape') {
      const delta = lastShapeDelta.current;
      return { x: clamp01(c.label.x + delta.x), y: clamp01(c.label.y + delta.y) };
    }
    return c.label;
  };

  const startLabelDrag = (c: SurfaceCallout, e: ReactPointerEvent) => {
    if (!editable || dragRef.current) return;
    e.stopPropagation();
    justDragged.current = false;
    const p = at(e.clientX, e.clientY);
    setDragBoth({
      what: 'label',
      key: c.key,
      offX: p.x - c.label.x,
      offY: p.y - c.label.y,
      at: c.label,
      moved: false,
    });
  };

  const startHandleDrag = (key: string, index: number, from: ShapePoint, e: ReactPointerEvent) => {
    if (!editable || dragRef.current) return;
    e.stopPropagation();
    justDragged.current = false;
    setDragBoth({ what: 'handle', key, index, at: from, moved: false });
  };

  const startShapeDrag = (c: SurfaceCallout, e: ReactPointerEvent) => {
    if (!editable || dragRef.current) return;
    e.stopPropagation();
    justDragged.current = false;
    lastShapeDelta.current = { x: 0, y: 0 };
    setDragBoth({
      what: 'shape',
      key: c.key,
      from: at(e.clientX, e.clientY),
      base: c.points,
      moved: false,
    });
  };

  const selectedCallout = selected !== null ? byKey.get(selected) : undefined;
  const handlesVisible =
    editable && !placing && !hideCallouts && selectedCallout && kindDef(selectedCallout.kind).handles;

  const cursorClass = placing
    ? 'cursor-crosshair'
    : zoom && scale > 1
      ? panning
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : onBackgroundView
        ? 'cursor-zoom-in'
        : 'cursor-default';

  return (
    <div className={cn('flex flex-col gap-1', heightPx != null && 'w-fit', className)}>
      <div
        ref={boxRef}
        className={cn(
          'relative select-none border border-borderColor bg-bgZebra',
          heightPx != null && 'w-fit',
          // `touch-action` объявляется ЗАРАНЕЕ: браузер выбирает поведение жеста в момент касания,
          // и запрет, выставленный позже, уже ничего не решает — палец уводит страницу в
          // прокрутку, прилетает pointercancel, и полштриха теряется.
          (zoom || placing) && 'touch-none',
          zoom && 'overflow-hidden',
          frameClassName,
          cursorClass,
        )}
        style={{ aspectRatio, ...frameStyle }}
        onPointerDown={onFramePointerDown}
        onPointerMove={onFramePointerMove}
        onPointerUp={onFramePointerUp}
        onPointerCancel={releasePointer}
        onPointerLeave={() => placing && setCursor(null)}
      >
        {/* ТРАНСФОРМ ОТДЕЛЬНО ОТ РАСКЛАДКИ. Раскладка решается пропорциями кадра, а не тем,
            включён ли зум: у сеточной плитки кадр задан отношением сторон и картинка его
            заполняет, у полосы и печати кадр ОБНИМАЕТ картинку её собственного размера. Свяжи их
            — и увеличенный вид начал бы обрезать снимок, а доли кадра поехали бы вместе с
            обрезкой, то есть указания стали бы показывать мимо. */}
        <div
          className={aspectRatio ? 'absolute inset-0' : 'relative'}
          style={zoom ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})` } : undefined}
        >
          {media === 'video' ? (
            <video
              src={src}
              className={cn(
                aspectRatio ? 'absolute inset-0 h-full w-full object-cover' : 'block w-full',
              )}
              muted
              loop
              playsInline
            />
          ) : (
            /* `max-h` кладётся на САМО изображение, а не на контейнер: коробка с ограниченной
               высотой и картинкой `w-full` внутри просто переполняется — на печати это обрезанный
               снимок. Ограничив изображение, коробка ужимается по нему, а выноски остаются на
               местах: они в долях кадра, а не в пикселях. */
            <img
              src={src}
              alt={alt ?? ''}
              // Вкладки карточки смонтированы ВСЕ разом (переключение — это `hidden`), поэтому без
              // `lazy` открытие карточки ради опечатки в шапке тянет снимки шагов, весь мудборд и
              // все эскизы в полный размер.
              loading='lazy'
              draggable={false}
              className={cn(
                aspectRatio
                  ? 'absolute inset-0 h-full w-full object-cover'
                  : heightPx != null
                    ? 'block h-auto w-auto max-w-none'
                    : 'block h-auto w-full',
                maxHeightClass,
              )}
              style={heightPx != null && !aspectRatio ? { height: heightPx } : undefined}
            />
          )}

          {/* СЛОЙ ГЕОМЕТРИИ — внутри трансформа: мерка обязана ехать вместе с картинкой при зуме и
              панораме, иначе она указывала бы мимо ровно тогда, когда её и приблизили, чтобы
              рассмотреть. viewBox в ПИКСЕЛЯХ КАДРА, а не в процентах: замер сделан для экрана, а
              печать меняет ширину коробки без ResizeObserver — с viewBox холст масштабируется
              вместе с коробкой, а в процентах засечки на альбомном снимке стали бы косыми. */}
          {size.w > 0 && !hideCallouts && (
            <svg
              className='pointer-events-none absolute inset-0 h-full w-full'
              viewBox={`0 0 ${size.w} ${size.h}`}
              preserveAspectRatio='none'
              aria-hidden
            >
              <defs>
                <AnnotationDefs />
              </defs>
              {callouts.map((c) =>
                dim(c.key) ? null : (
                  <CalloutShape
                    key={c.key}
                    kind={c.kind}
                    pts={pointsOf(c).map(px)}
                    label={px(labelOf(c))}
                    color={c.color || undefined}
                    dashed={c.dashed}
                    filled={c.filled}
                    halo={halo}
                    strokeWidth={selected === c.key ? 2 : 1.5}
                  />
                ),
              )}
              {/* ХИТ-ПУТИ — невидимые толстые копии штрихов: попасть мышью в волосяную линию
                  нельзя, а выбирать фигуру надо именно по ней. Живут ТОЛЬКО когда правка
                  возможна и инструмент выключен: во время постановки слой обязан быть прозрачным
                  для кликов, иначе точку под чужой фигурой не поставить. */}
              {editable &&
                !placing &&
                callouts.map((c) => {
                  const pts = pointsOf(c).map(px);
                  const d = hitPath(c.kind, pts, px(labelOf(c)));
                  if (!d) return null;
                  // Заштрихованная зона ловится ПО ПЛОЩАДИ: когда область закрашена, целятся в неё,
                  // а не в двухпиксельный контур по краю.
                  const byArea = kindDef(c.kind).key === 'polygon' && !!c.filled;
                  return (
                    <path
                      key={`hit:${c.key}`}
                      d={d}
                      fill={byArea ? 'transparent' : 'none'}
                      stroke='transparent'
                      strokeWidth={HIT_WIDTH}
                      style={{ pointerEvents: byArea ? 'all' : 'stroke', cursor: 'pointer' }}
                      onPointerEnter={() => setHovered(c.key)}
                      onPointerLeave={() => setHovered((h) => (h === c.key ? null : h))}
                      onPointerDown={(e) => {
                        if (selected === c.key) startShapeDrag(c, e);
                        else e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (justDragged.current) {
                          justDragged.current = false;
                          return;
                        }
                        select(selected === c.key ? null : c.key, { focus: true });
                      }}
                    />
                  );
                })}
              {placing && points.length > 0 && (
                <PlacingShape
                  kind={def.key}
                  pts={points.map(px)}
                  cursor={cursor ? px(cursor) : null}
                  color={pen.color || undefined}
                  snapClose={snapClose}
                />
              )}
            </svg>
          )}

          {/* ПОДПИСНОЙ СЛОЙ. Плашки и маркеры — HTML поверх SVG, а не `<text>`: перенос строки,
              обрезка и выделение мышью в SVG приходится изобретать заново. */}
          {size.w > 0 &&
            !hideCallouts &&
            labelMode === 'plate' &&
            callouts.map((c) => {
              const d = kindDef(c.kind);
              const names = (c.pieceLineKeys ?? [])
                .map((k) => pieceLabel?.(k) ?? (pieceLabel ? 'деталь удалена' : undefined))
                .filter(Boolean) as string[];
              const text = (c.text ?? '').trim();
              if (d.key === 'pin') {
                const p = c.points[0];
                if (!p) return null;
                return (
                  <PinMarker
                    key={`pin:${c.key}`}
                    at={px(p)}
                    inv={inv}
                    number={c.number ?? 0}
                    title={[text, ...names].filter(Boolean).join(' · ') || `выноска ${c.number ?? ''}`}
                    dimmed={dim(c.key)}
                    selected={selected === c.key}
                    interactive={!placing}
                    onHover={(on) => setHovered(on ? c.key : null)}
                    onPress={() => editable && select(selected === c.key ? null : c.key, { focus: true })}
                  />
                );
              }
              // Пустая плашка у зоны и следа — прямоугольник «—» посреди снимка: контур уже сказал
              // «вот здесь», и добавлять к этому нечего, пока текста нет.
              if (!d.plateWhenEmpty && !text && names.length === 0) return null;
              return (
                <Plate
                  key={`plate:${c.key}`}
                  at={px(labelOf(c))}
                  inv={inv}
                  text={text}
                  names={names}
                  dimmed={dim(c.key)}
                  selected={selected === c.key}
                  interactive={!placing}
                  editable={editable}
                  onHover={(on) => setHovered(on ? c.key : null)}
                  onPointerDown={(e) => startLabelDrag(c, e)}
                  onPress={() => {
                    if (justDragged.current) {
                      justDragged.current = false;
                      return;
                    }
                    if (editable) select(selected === c.key ? null : c.key, { focus: true });
                  }}
                />
              );
            })}

          {size.w > 0 &&
            !hideCallouts &&
            labelMode === 'marker' &&
            renderNote &&
            callouts.map((c) => (
              <ImageCallout
                key={c.key}
                data={{
                  key: c.key,
                  number: c.number ?? 0,
                  xNorm: labelOf(c).x,
                  yNorm: labelOf(c).y,
                  hasText: !!c.hasText,
                }}
                onHoverChange={(on) => setHovered(on ? c.key : null)}
                title={noteTitle?.(c.key)}
                scale={zoom ? scale : 1}
                showAll={showAllNotes}
                editable={editable}
                pinSize={pinSize}
                noteClassName={noteClassName}
                // Транзиентное положение уже вшито в `data` через labelOf — второй канал
                // (dragging/dragPos) означал бы два источника одной координаты.
                dragging={false}
                dragPos={null}
                onPinPointerDown={(e) => startLabelDrag(c, e)}
                onRemove={() => onRemove?.(c.key)}
                renderNote={(opts) => renderNote(c.key, opts)}
              />
            ))}

          {/* РУЧКИ — HTML-слоем и последними: они обязаны лежать поверх подписей, иначе якорь под
              плашкой не схватить. Экранно-постоянные: ручка, растущая с зумом, перекрыла бы саму
              фигуру ровно тогда, когда её приблизили, чтобы поправить точнее. */}
          {size.w > 0 && handlesVisible && selectedCallout && (
            <Handles
              callout={selectedCallout}
              pts={pointsOf(selectedCallout)}
              px={px}
              inv={inv}
              armed={armed}
              onArm={(index) => setArmed({ key: selectedCallout.key, index })}
              onDrag={(index, from, e) => startHandleDrag(selectedCallout.key, index, from, e)}
              onInsert={(index, p) => {
                const next = [...selectedCallout.points];
                next.splice(index + 1, 0, p);
                if (next.length <= kindDef(selectedCallout.kind).points[1])
                  live.current.onEditPoints?.(selectedCallout.key, next);
              }}
            />
          )}
        </div>

        {zoom && scale > 1 && (
          <FrameButton
            label={`${Math.round(scale * 100)}%`}
            title='вернуть исходный масштаб'
            onPress={resetZoom}
            className='bottom-1 left-1'
          />
        )}
        {cornerSlot && <div className='absolute right-1 top-1 z-[4] flex gap-1'>{cornerSlot}</div>}
      </div>

      {renderEditor && selected !== null && byKey.has(selected) && (
        <EditorSlot focusRequested={takeFocusRequest}>
          {renderEditor(selected, { close: () => select(null) })}
        </EditorSlot>
      )}
    </div>
  );
}

/**
 * Обёртка редактора, переносящая ЗАПРОС фокуса из жеста выбора внутрь. Раньше редактор фокусировал
 * себя эффектом на данных, а данные меняют идентичность на каждую запись под шагом — курсор
 * прыгал в поле выноски из подписи к кадру после первого символа.
 */
function EditorSlot({
  focusRequested,
  children,
}: {
  focusRequested: () => boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusRequested()) return;
    const el = ref.current?.querySelector<HTMLElement>('textarea, input');
    el?.focus();
  });
  return <div ref={ref}>{children}</div>;
}

/**
 * Путь ДЛЯ ПОПАДАНИЯ мышью — упрощённая копия видимого штриха. Не сама фигура: у мерки хит-путь
 * это одна линия без засечек, у подписи — лучи к якорям, и утолщать засечки значило бы ловить
 * клики там, где линии нет.
 */
function hitPath(kind: string, pts: ShapePoint[], label: ShapePoint): string | null {
  const d = kindDef(kind);
  if (pts.length === 0) return null;
  switch (d.key) {
    case 'pin':
      // У пина видимой линии нет вовсе: его хит — сам нумерованный кружок, HTML-слоем.
      return null;
    case 'label':
    case 'multi':
      // Хит подписи — её ЛИДЕРЫ: единственное, что она рисует на кадре.
      return pts.map((p) => `M${label.x},${label.y} L${p.x},${p.y}`).join(' ');
    case 'dim':
      return pts.length >= 2 ? `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}` : null;
    case 'bracket':
    case 'arc':
    case 'polygon':
    case 'ink': {
      if (pts.length < 2) return null;
      const line = `M${pts.map((p) => `${p.x},${p.y}`).join(' L')}`;
      return d.key === 'polygon' ? `${line} Z` : line;
    }
    default:
      return null;
  }
}

// ── ОРГАНЫ УПРАВЛЕНИЯ ───────────────────────────────────────────────────────────────────────────
//
// Все они `<span role='button'>`, а не `<button>`. Поверхность живёт внутри общего
// `<fieldset disabled>` выпущенной карточки, а задизейбленность НАСЛЕДУЕТСЯ: у нативной кнопки под
// таким предком не стреляют ни клик, ни фокус. На выпущенной карточке это убило бы не правку (её и
// так нет), а ЧТЕНИЕ — зум, изоляцию, выбор кадра. Запись гасится пропом `frozen`, и только им.

function FrameButton({
  label,
  title,
  onPress,
  className,
}: {
  label: string;
  title: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
      className={cn(
        'absolute z-[4] cursor-pointer border border-borderColor bg-bgColor px-1.5 py-px text-nano uppercase leading-none tracking-label tabular-nums hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Радиус кружка пина в экранных пикселях. */
const R_PIN = 9;

function PinMarker({
  at,
  inv,
  number,
  title,
  dimmed,
  selected,
  interactive,
  onHover,
  onPress,
}: {
  at: ShapePoint;
  inv: number;
  number: number;
  title: string;
  dimmed: boolean;
  selected: boolean;
  interactive: boolean;
  onHover: (on: boolean) => void;
  onPress: () => void;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      title={title}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      // Нажатие не доходит до кадра: иначе оно завело бы там жест панорамы, а его отпускание —
      // снятие выбора, которое тут же отменяло бы выбор, сделанный кликом по этому же маркеру.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
      className={cn(
        'absolute flex cursor-pointer items-center justify-center rounded-full border bg-bgColor text-nano tabular-nums',
        selected ? 'border-textColor' : 'border-borderColor',
        dimmed && 'invisible',
        !interactive && 'pointer-events-none',
      )}
      style={{
        left: `${at.x}px`,
        top: `${at.y}px`,
        width: R_PIN * 2,
        height: R_PIN * 2,
        transform: `translate(-50%, -50%) scale(${inv})`,
      }}
    >
      {number || ''}
    </span>
  );
}

/** Плашка. Текст ВСЕГДА чёрным по белому — см. довод в `editor.tsx`. */
function Plate({
  at,
  inv,
  text,
  names,
  dimmed,
  selected,
  interactive,
  editable,
  onHover,
  onPointerDown,
  onPress,
}: {
  at: ShapePoint;
  inv: number;
  text: string;
  names: string[];
  dimmed: boolean;
  selected: boolean;
  interactive: boolean;
  editable: boolean;
  onHover: (on: boolean) => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPress: () => void;
}) {
  // Одно-два имени — инлайном; дальше счётчик: узкая плашка не резиновая, и счётчик честнее
  // трёх обрезанных имён. Полный список — в подсказке, в легенде и на бумаге.
  const tail = names.length === 0 ? '' : names.length <= 2 ? names.join(', ') : `${names.length} детали`;
  return (
    <span
      role='button'
      tabIndex={0}
      title={[text, ...names].filter(Boolean).join(' · ') || 'указание'}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
      className={cn(
        'absolute block max-w-[45%] cursor-pointer whitespace-pre-wrap border bg-bgColor px-1 py-px text-left text-nano leading-tight text-textColor',
        selected ? 'border-textColor' : 'border-borderColor',
        dimmed && 'invisible',
        !interactive && 'pointer-events-none',
      )}
      style={{
        // `touch-action` объявляется ЗАРАНЕЕ: браузер выбирает поведение жеста в момент касания, и
        // запрет, выставленный позже, уже ничего не решает — палец уводит страницу в прокрутку,
        // прилетает pointercancel, плашка возвращается назад.
        touchAction: editable ? 'none' : undefined,
        left: `${at.x}px`,
        top: `${at.y}px`,
        transform: `translate(-50%, -50%) scale(${inv})`,
      }}
    >
      {text || (tail ? '' : '—')}
      {tail && (
        <span className='block uppercase tracking-label text-labelColor'>{tail}</span>
      )}
    </span>
  );
}

/** Размер ручки в экранных пикселях: видимый квадрат и обёртка, в которую попадают пальцем. */
const HANDLE = 10;
const HANDLE_HIT = 20;

function Handles({
  callout,
  pts,
  px,
  inv,
  armed,
  onArm,
  onDrag,
  onInsert,
}: {
  callout: SurfaceCallout;
  pts: ShapePoint[];
  px: (p: ShapePoint) => ShapePoint;
  inv: number;
  armed: { key: string; index: number } | null;
  onArm: (index: number) => void;
  onDrag: (index: number, from: ShapePoint, e: ReactPointerEvent) => void;
  onInsert: (index: number, p: ShapePoint) => void;
}) {
  const d = kindDef(callout.kind);
  // ГОРБ ДУГИ — РОМБ, а не квадрат. Средняя точка дуги отличается по РОЛИ: концы задают, где
  // кривая начинается и кончается, средняя — насколько она выгнута. Одинаковые ручки заставляли бы
  // выяснять это перетаскиванием.
  const rhombusAt = d.key === 'arc' ? 1 : -1;
  const closed = d.key === 'polygon';
  const ghosts =
    closed && pts.length < d.points[1]
      ? pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          return { index: i, at: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
        })
      : [];

  return (
    <>
      {ghosts.map((g) => {
        const at = px(g.at);
        return (
          <span
            key={`ghost:${g.index}`}
            role='button'
            tabIndex={-1}
            title='добавить вершину на этой стороне'
            onPointerDown={(e) => {
              e.stopPropagation();
              onInsert(g.index, g.at);
            }}
            className='absolute cursor-copy'
            style={{
              left: `${at.x}px`,
              top: `${at.y}px`,
              width: HANDLE_HIT,
              height: HANDLE_HIT,
              transform: `translate(-50%, -50%) scale(${inv})`,
            }}
          >
            <span
              aria-hidden
              className='absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 border border-dashed border-textColor bg-bgColor opacity-60'
              style={{ width: 8, height: 8 }}
            />
          </span>
        );
      })}
      {pts.map((p, i) => {
        const at = px(p);
        const isArmed = armed?.key === callout.key && armed.index === i;
        return (
          <span
            key={`handle:${i}`}
            role='button'
            tabIndex={0}
            title={
              isArmed
                ? 'Delete уберёт эту точку'
                : 'тащить — двигать точку; клик — выбрать её для удаления'
            }
            onPointerDown={(e) => onDrag(i, p, e)}
            onClick={(e) => {
              e.stopPropagation();
              onArm(i);
            }}
            className='absolute cursor-move'
            style={{
              left: `${at.x}px`,
              top: `${at.y}px`,
              width: HANDLE_HIT,
              height: HANDLE_HIT,
              transform: `translate(-50%, -50%) scale(${inv})`,
              touchAction: 'none',
            }}
          >
            <span
              aria-hidden
              className={cn(
                'absolute left-1/2 top-1/2 block bg-bgColor',
                isArmed ? 'border-2 border-textColor' : 'border border-textColor',
              )}
              style={{
                width: HANDLE,
                height: HANDLE,
                transform: `translate(-50%, -50%)${i === rhombusAt ? ' rotate(45deg)' : ''}`,
              }}
            />
          </span>
        );
      })}
    </>
  );
}

