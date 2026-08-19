import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Chip } from 'ui/components/chip';
import Text from 'ui/components/text';

import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyResult, AssemblyStep } from './assembly-frontier';
import { assemblyLayout, type SchematicLayout } from './assembly-layout';
import {
  buildWires,
  directInputsOf,
  makeRowY,
  TailBoxView,
  TileView,
  UnitBoxView,
  WireLayer,
} from './assembly-node-views';
import type { CreatePrefill } from './assembly-create-dialog';
import { applyOverrides, combineVerdict, hitNode, type PosOverrides } from './assembly-positions';
import {
  fitView,
  hatchK,
  OPEN_FLOOR,
  sheetRect,
  toWorld,
  zoomAt,
  ZOOM_MAX,
  ZOOM_MIN,
  type Rect,
  type View,
} from './canvas-view';
import { hatchId } from './cloth-hatch';
import { clothRollup, type PieceCloth, type PieceClothState } from './piece-cloth';
import type { PieceShapeMap } from './use-piece-shapes';

// ПОЛОТНО ФУЛСКРИНА: тот же граф, что на инлайновой схеме, но в мире с трансформом.
//
// ЧЕМ ОНО ОТЛИЧАЕТСЯ ОТ `AssemblySchematic` — ровно одним: системой координат. Инлайн живёт в
// прокручиваемом `overflow: auto` и считает точку события как «клиент − rect + scroll»; здесь
// прокрутки нет вовсе, а есть мир, сдвинутый и смасштабированный CSS-трансформом, и точка
// считается как `(клиент − rect − pan) / zoom` (`canvas-view.ts`). Всё остальное — ноды, провода,
// плитки, вердикты, порядок дропа — общее, и общее оно ФИЗИЧЕСКИ: рендер нод приходит из
// `assembly-node-views`, арифметика жеста — из `assembly-positions`.
//
// ЧЕГО ЗДЕСЬ НЕТ. Ни одного мутатора и ни одной подписки на форму (R3): полотно собирает ЖЕСТ и
// отдаёт его наверх — `onCreate` кончается диалогом создания, `onMove` пишет в предпочтения мимо
// RHF. Ни одного `useFieldArray`: он существует в единственном экземпляре, в `OperationsField`.
//
// ПОЧЕМУ ТРАНСФОРМ ПИШЕТСЯ ИМПЕРАТИВНО, а не через состояние React. Пан колесом и рукой идёт со
// скоростью кадров; положи `view` в state — и каждый кадр панорамы перерисовывал бы два десятка
// нод и весь слой проводов. Поэтому `view` живёт в ref, а `applyView()` пишет `transform` и `--hk`
// прямо в стиль мира. В состоянии остаётся только ОКРУГЛЁННЫЙ процент зума — он меняется на
// порядки реже и нужен подписи HUD.

/** Порог, разводящий клик и перетаскивание. Тот же, что у инлайна. */
const DRAG_THRESHOLD = 4;

/** Шаг зума кнопками и клавишами. Порт прототипа. */
export const ZOOM_STEP = 1.2;

type DragState = {
  key: string;
  pointerId: number;
  /** Где внутри ноды её взяли — чтобы нода не прыгала под курсор углом. Координаты МИРА. */
  offX: number;
  offY: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  /** Где сейчас указатель, в координатах мира: по нему ищется цель под курсором. */
  ptrX: number;
  ptrY: number;
  started: boolean;
};

/** Подсказка вердикта: полотно её СЧИТАЕТ, а показывает зарезервированная строка хрома. */
export type CanvasHint = { text: string; bad: boolean } | null;

/**
 * Императивные команды вида. Живут ручкой, потому что зовёт их не полотно: `f`/`⌘1`/`⌘0` ловит
 * роутер клавиш фулскрина (он один на весь экран), а кнопки HUD стоят здесь.
 */
export type CanvasHandle = {
  /** Вписать всё. `animate` гасится под `prefers-reduced-motion`. */
  fit: (animate?: boolean) => void;
  zoomBy: (factor: number) => void;
  /** Зум 1:1, панорама не трогается — как `⌘0` в прототипе. */
  zoomReset: () => void;
  /**
   * Пробел зажат/отпущен. Решает это РОУТЕР КЛАВИШ ФУЛСКРИНА: он один знает про typing-гард, а
   * пробел в поле заметки и на кнопке — не «взять ладонь». Полотно только исполняет.
   */
  setSpaceHand: (on: boolean) => void;
};

export type AssemblyCanvasProps = {
  blocks: AssemblyBlock[];
  steps: AssemblyStep[];
  res: AssemblyResult;
  /** Короткая подпись шага для строки бокса. */
  labelOf: (index: number) => string;
  pieceNameOf: (lineKey: string) => string;
  onPickStep: (index: number) => void;
  /**
   * Открыть создание операции по собранному жесту. Полотно НЕ пишет в форму: ни один жест не
   * подставляет тип, зону и машину — всё кончается диалогом (R1).
   */
  onCreate: (prefill: CreatePrefill) => void;
  /** Растворить узел — по индексу его производящего шага. */
  onDissolve: (stepIndex: number) => void;
  pieceShapes: PieceShapeMap;
  /**
   * Ткань деталей — УЖЕ РАЗРЕШЁННАЯ карта показываемого колорвея, как у `AssemblySchematic`, а не
   * весь массив по колорвеям. В Ф3 сюда приезжает первый колорвей; когда полка принесёт
   * переключатель, сменится ИСТОЧНИК, а полотно не тронется.
   */
  cloth?: Map<string, PieceCloth> | null;
  smvOfBlock: Map<string, string>;
  positions: PosOverrides;
  onMove: (key: string, at: { x: number; y: number }) => void;
  /** Карточка выпущена: читать и раскладывать можно, соединять и растворять нельзя (R10). */
  frozen?: boolean;
  /**
   * Выбор живёт ВЫШЕ полотна: его гасит Esc-лестница фулскрина, а лестница одна на экран.
   * Само полотно только переключает ключи.
   */
  picked: string[];
  onPicked: (next: string[]) => void;
  /**
   * Подсказка вердикта — наверх, в зарезервированную строку хрома. Зовётся ТОЛЬКО на смене
   * текста: строка живёт в хроме рядом с доком, и вызов на каждое движение указателя
   * перерисовывал бы редактор шага шестьдесят раз в секунду.
   */
  onHint: (hint: CanvasHint) => void;
};

export const AssemblyCanvas = forwardRef<CanvasHandle, AssemblyCanvasProps>(function AssemblyCanvas(
  {
    blocks,
    steps,
    res,
    labelOf,
    pieceNameOf,
    onPickStep,
    onCreate,
    onDissolve,
    pieceShapes,
    cloth,
    smvOfBlock,
    positions,
    onMove,
    frozen = false,
    picked,
    onPicked,
    onHint,
  },
  handleRef,
) {
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const sheetElRef = useRef<HTMLDivElement>(null);

  // Маркер-стрелка на ИНСТАНС. Фиксированный документный id ломается ровно здесь: пока полотен
  // два (инлайн под оверлеем и это), `url(#assembly-arrow)` вправе разрешиться в маркер внутри
  // спрятанного поддерева, и провода исчезают. Санитация — та же, что у `hatchId`.
  const markerId = hatchId('assembly-arrow', useId());

  const onTable = new Set(res.frontier);
  const liveUnits = res.frontier.filter((k) => res.units.has(k));
  const looseSteps = blocks.find((b) => b.key === '')?.steps ?? [];

  const toggle = (key: string) =>
    onPicked(picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);

  // ВЫБОР ЖИВЁТ, ПОКА ЖИВЫ ЕГО КЛЮЧИ — тот же инвариант, что у инлайна: деталь, съеденная соседним
  // жестом, входом больше не годится.
  useEffect(() => {
    const live = picked.filter((k) => res.frontier.includes(k));
    if (live.length !== picked.length) onPicked(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res]);

  const auto = useMemo(() => assemblyLayout(blocks, steps, res), [blocks, steps, res]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const commitDrag = useCallback((v: DragState | null) => {
    dragRef.current = v;
    setDrag(v);
  }, []);
  const justDragged = useRef(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      applyOverrides(
        auto,
        drag?.started ? { ...positions, [drag.key]: { x: drag.x, y: drag.y } } : positions,
      ),
    [auto, positions, drag],
  );

  const empty = layout.tiles.length === 0 && layout.boxes.length === 0 && !layout.tail;

  // --- вид: пан, зум, лист --------------------------------------------------------------------

  const viewRef = useRef<View>({ pan: { x: 0, y: 0 }, zoom: 1 });
  // Подпись HUD. Отдельным состоянием и в процентах, потому что меняется на зуме, а не на пане:
  // панорама не стоит ни одного рендера.
  const [zoomPct, setZoomPct] = useState(100);
  /** Вид получен вписыванием и ещё не тронут рукой — только такой пере-вписывается на ресайзе. */
  const fitted = useRef(true);
  const sheetRef = useRef<Rect | null>(null);

  /** Габарит работы в координатах мира. Считается по нодам, а не по `layout.width/height`:
   *  последние несут технические поля справа и снизу, и вписывание по ним оставляло бы пустоту. */
  const contentRef = useRef<Rect>({ x: 0, y: 0, w: 400, h: 300 });
  contentRef.current = useMemo(() => contentBox(layout), [layout]);

  const applyView = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const { pan, zoom } = viewRef.current;
    world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    // ПИСАТЕЛЬ `--hk` ЖИВЁТ ЗДЕСЬ, и это не «из фазы штриховки». Классы `.hx*` (global.css) уже
    // читают `var(--hk, 1)`, но писателя у переменной до сих пор не было — действовал дефолт 1.
    // Без этой строки на 250% решётка штриховки перевешивает контур, который не масштабируется
    // вовсе, и деталь читается как залитая. На 100% всё при этом выглядит правильно.
    world.style.setProperty('--hk', String(hatchK(zoom)));
    setZoomPct(Math.round(zoom * 100));
  }, []);

  const paintSheet = useCallback((settle: boolean) => {
    const el = sheetElRef.current;
    if (!el) return;
    const r = sheetRect(contentRef.current, sheetRef.current, settle);
    sheetRef.current = r;
    el.style.left = `${r.x}px`;
    el.style.top = `${r.y}px`;
    el.style.width = `${r.w}px`;
    el.style.height = `${r.h}px`;
  }, []);

  const animateOnce = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    // Движение под запретом — значит его нет: анимация вида не «украшение поверх», а само
    // движение, и под `prefers-reduced-motion` оно обязано отсутствовать целиком.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    world.style.transition = 'transform .22s cubic-bezier(.22,1,.36,1)';
    window.setTimeout(() => {
      if (worldRef.current) worldRef.current.style.transition = '';
    }, 240);
  }, []);

  // Семантика ПОСЛЕДНЕГО состоявшегося вписывания. Авто-пере-вписывание (ресайз, сплиттер дока)
  // обязано её наследовать: открытие фулскрина стоит на полу читаемости 0.5, и без памяти первый
  // же клик по шагу — док открылся, вьюпорт сжался — пере-вписывал бы БЕЗ пола, роняя большую
  // карточку в те самые нечитаемые 0.3×, от которых пол и защищал. Ручной «fit» кнопкой её
  // честно перезаписывает: его попросили показать всё, и наследники ресайза показывают всё же.
  const lastFitOpen = useRef(true);
  /**
   * Вписать содержимое. Возвращает `false`, если коммитить было нечего.
   *
   * НУЛЕВОЙ RECT НЕ КОММИТИТСЯ. Radix монтирует содержимое диалога асинхронно, и первый вызов
   * приходит на элемент 0×0: `fitView` от него дал бы зум из деления на ноль, а «первый кадр по
   * `?fs=1`» — пустое полотно с NaN в трансформе, из которого уже не выйти.
   */
  const runFit = useCallback(
    (animate: boolean, open = false): boolean => {
      const vp = viewportRef.current;
      if (!vp) return false;
      const r = vp.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      lastFitOpen.current = open;
      if (animate) animateOnce();
      viewRef.current = fitView(
        contentRef.current,
        { w: r.width, h: r.height },
        // ПОЛ ЧИТАЕМОСТИ — только на ОТКРЫТИИ. Ручной «fit» просили явно: он обязан показать всё,
        // каким бы мелким оно ни вышло, иначе кнопка врёт своей подписью.
        open ? { floor: OPEN_FLOOR, anchorTopLeft: true } : undefined,
      );
      fitted.current = true;
      applyView();
      return true;
    },
    [animateOnce, applyView],
  );

  // ВПИСЫВАНИЕ — В `useLayoutEffect`, ДО ПОКРАСКИ. В обычном `useEffect` по `open` первый
  // `getBoundingClientRect` приходит на неразложенный элемент, зум выходит NaN и первый кадр
  // пуст. Первый тик `ResizeObserver` ниже — вторая попытка ровно на этот случай.
  const fittedOnce = useRef(false);
  useLayoutEffect(() => {
    paintSheet(true);
    fittedOnce.current = runFit(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ресайз вьюпорта — это и окно, и сплиттер дока, и свёртка панели: «место, освобождённое
  // панелью, обязано стать графом, а не пустой землёй». Пере-вписывается ТОЛЬКО вид, полученный
  // вписыванием: подвинутый рукой чужой ресайз трогать не имеет права.
  const pendingRefit = useRef(false);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!fittedOnce.current) {
        fittedOnce.current = runFit(false, true);
        return;
      }
      if (!fitted.current) return;
      // Жест жив — мир не имеет права уехать из-под руки. Откладываем до отпускания.
      if (dragRef.current || panRef.current) {
        pendingRefit.current = true;
        return;
      }
      runFit(true, lastFitOpen.current);
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [runFit]);

  // Габарит работы поменялся (родился узел, приехали детали) — лист догоняет. Во время жеста лист
  // только растёт: сжимающийся уводит землю из-под руки.
  useEffect(() => {
    paintSheet(!(dragRef.current || panRef.current));
  }, [layout, paintSheet]);

  // --- колесо: пан, ⌘/ctrl — зум у курсора ------------------------------------------------------
  //
  // Слушатель ЖИВОЙ (`{ passive: false }` + `preventDefault`), потому что иначе трекпад уводит в
  // прокрутку страницу под оверлеем. React-проп `onWheel` для этого не годится: React вешает
  // wheel пассивно, и `preventDefault` там не работает.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      fitted.current = false;
      if (e.ctrlKey || e.metaKey) {
        viewRef.current = zoomAt(
          viewRef.current,
          Math.pow(0.995, e.deltaY),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      } else {
        const { pan, zoom } = viewRef.current;
        viewRef.current = {
          zoom,
          // Shift меняет ось: трекпад отдаёт горизонталь сам, мышь с одним колесом — нет.
          pan: {
            x: pan.x - (e.shiftKey ? e.deltaY : e.deltaX),
            y: pan.y - (e.shiftKey ? 0 : e.deltaY),
          },
        };
      }
      applyView();
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [applyView]);

  // --- инструмент и панорама рукой --------------------------------------------------------------

  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const hand = tool === 'hand' || spaceHeld;
  const handRef = useRef(hand);
  handRef.current = hand;
  const panRef = useRef<{ pointerId: number; fromX: number; fromY: number; panX: number; panY: number } | null>(
    null,
  );
  const [panning, setPanning] = useState(false);

  // Пробел держат — ладонь, отпустили — прежний инструмент. Слушать приходится на window: фокус
  // внутри фулскрина гуляет, а удержание — состояние экрана, а не элемента. Поля и кнопки
  // отсекает роутер клавиш фулскрина, здесь остаётся только зеркало его решения.
  useEffect(() => {
    if (!spaceHeld) return;
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [spaceHeld]);

  const startPan = (e: React.PointerEvent) => {
    if (panRef.current || dragRef.current) return;
    // Средняя кнопка панорамирует всегда — привычка из любого редактора схем.
    if (!(e.button === 1 || (e.button === 0 && handRef.current))) return;
    const { pan } = viewRef.current;
    panRef.current = {
      pointerId: e.pointerId,
      fromX: e.clientX,
      fromY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setPanning(true);
    fitted.current = false;
    e.preventDefault();
  };

  useEffect(() => {
    if (!panning) return;
    const move = (e: PointerEvent) => {
      const p = panRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      viewRef.current = {
        zoom: viewRef.current.zoom,
        pan: { x: p.panX + (e.clientX - p.fromX), y: p.panY + (e.clientY - p.fromY) },
      };
      applyView();
    };
    const end = () => {
      panRef.current = null;
      setPanning(false);
      if (pendingRefit.current) {
        pendingRefit.current = false;
        if (fitted.current) runFit(true, lastFitOpen.current);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
    };
  }, [panning, applyView, runFit]);

  useImperativeHandle(
    handleRef,
    () => ({
      fit: (animate = true) => {
        runFit(animate);
      },
      zoomBy: (factor: number) => {
        const vp = viewportRef.current;
        if (!vp) return;
        const r = vp.getBoundingClientRect();
        fitted.current = false;
        viewRef.current = zoomAt(viewRef.current, factor, r.width / 2, r.height / 2);
        applyView();
      },
      zoomReset: () => {
        fitted.current = false;
        viewRef.current = { ...viewRef.current, zoom: 1 };
        applyView();
      },
      setSpaceHand: setSpaceHeld,
    }),
    [runFit, applyView],
  );

  // --- жест ноды --------------------------------------------------------------------------------

  /** Точка события в координатах МИРА. Ровно та формула, что в пробе. */
  const toWorldPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const vp = viewportRef.current;
    if (!vp) return null;
    return toWorld(e.clientX, e.clientY, vp.getBoundingClientRect(), viewRef.current);
  }, []);

  const dragHandlers = (key: string, nodeX: number, nodeY: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      // Ладонь сильнее ноды: в режиме панорамы полотно возят целиком, и нода под курсором к жесту
      // отношения не имеет.
      if (handRef.current) return;
      if (dragRef.current) return;
      if (e.button !== 0) return;
      const p = toWorldPoint(e);
      if (!p) return;
      justDragged.current = false;
      commitDrag({
        key,
        pointerId: e.pointerId,
        offX: p.x - nodeX,
        offY: p.y - nodeY,
        x: nodeX,
        y: nodeY,
        fromX: p.x,
        fromY: p.y,
        ptrX: p.x,
        ptrY: p.y,
        started: false,
      });
    },
  });

  /**
   * Кликабельный элемент полотна, НЕ являющийся формой (R4).
   *
   * Причина та же, что у инлайна, и она не отменяется порталом: карточка может быть выпущена, и
   * `<button>` под общим `<fieldset disabled>` умирает. Здесь fieldset до портала не достаёт, но
   * разводить две механики органов на два вида — верный способ развести и их поведение.
   */
  const activate = (fn?: () => void) =>
    fn
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: fn,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            // Клавиатура зовёт действие напрямую, минуя защиту от клик-эха: эхо бывает только у
            // указателя.
            //
            // `stopPropagation` — против РОУТЕРА КЛАВИШ ФУЛСКРИНА, а не против чего-то в полотне:
            // его typing-гард отсекает настоящие кнопки, а орган полотна — это div, и Space на
            // сфокусированной ноде долетал бы до роутера и брал ладонь ровно в тот момент, когда
            // человек эту ноду выбирает.
            e.stopPropagation();
            justDragged.current = false;
            fn();
          },
        }
      : {};

  const hoverHandlers = (key: string) => ({
    onPointerEnter: () => {
      if (drag?.started) return;
      setHovered(key);
    },
    onPointerLeave: () => setHovered((h) => (h === key ? null : h)),
  });

  const clickGuard = (fn: () => void) => () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    fn();
  };

  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return;
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (e.buttons === 0) {
        justDragged.current = d.started;
        commitDrag(null);
        return;
      }
      const p = toWorldPoint(e);
      if (!p) return;
      // Порог считается в МИРЕ, но сравнивается с экранными пикселями: на 0.5× четыре мировых
      // пикселя — это два экранных, и жест разъезжался бы с рукой. Делим порог на зум.
      const t = DRAG_THRESHOLD / viewRef.current.zoom;
      const far = Math.abs(p.x - d.fromX) > t || Math.abs(p.y - d.fromY) > t;
      if (!d.started && !far) return;
      commitDrag({ ...d, started: true, x: p.x - d.offX, y: p.y - d.offY, ptrX: p.x, ptrY: p.y });
    };
    const onPointerUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d && e.pointerId !== d.pointerId) return;
      commitDrag(null);
      if (pendingRefit.current) {
        pendingRefit.current = false;
        if (fitted.current) runFit(true, lastFitOpen.current);
      }
      if (!d?.started) return;
      justDragged.current = true;
      const at = { x: Math.max(0, d.x), y: Math.max(0, d.y) };
      // ПОРЯДОК ХВОСТА — ТОТ ЖЕ, ЧТО У ИНЛАЙНА, и он не про удобство: перемещение состоялось в
      // любом случае (жест композитен, и «перенёс» не отменяется тем, что «соединить» потом
      // отклонили), поэтому `onMove` идёт ПЕРВЫМ и до гейта заморозки — раскладывать чужую
      // выпущенную карточку разрешено (R10). Соединять — нет.
      onMove(d.key, at);
      if (frozen) return;
      const eff = applyOverrides(auto, { ...positions, [d.key]: at });
      const hit = hitNode(eff, d.ptrX, d.ptrY, d.key);
      const v = hit ? combineVerdict(d.key, hit.key, res, steps) : null;
      if (v && !v.ok) {
        // Отказ ДО диалога, словами движка: открывать форму, которую нельзя отправить, — предлагать
        // заведомый отказ (R2).
        showMessage(v.reason, 'error');
      } else if (v?.ok && hit) {
        onCreate({
          inputKeys: [d.key, hit.key],
          absorbInto: v.absorbInto,
          intent: v.absorbInto ? undefined : 'unit',
        });
      }
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId !== dragRef.current.pointerId) return;
      justDragged.current = true;
      commitDrag(null);
    };
    const onLost = () => {
      const d = dragRef.current;
      if (!d) return;
      justDragged.current = d.started;
      commitDrag(null);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', onLost);
    document.addEventListener('visibilitychange', onLost);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', onLost);
      document.removeEventListener('visibilitychange', onLost);
    };
  }, [
    dragActive,
    auto,
    positions,
    res,
    steps,
    frozen,
    onMove,
    onCreate,
    showMessage,
    toWorldPoint,
    commitDrag,
    runFit,
  ]);

  // Escape во время драга — откат жеста. Стоит ДО Esc-лестницы фулскрина по естественной причине:
  // слушатель на window ловит событие раньше, чем `onEscapeKeyDown` Radix, и гасит его сам.
  useEffect(() => {
    if (!drag?.started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      justDragged.current = true;
      commitDrag(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drag?.started, commitDrag]);

  // --- вердикт и подсказка ----------------------------------------------------------------------

  const target = drag?.started ? hitNode(layout, drag.ptrX, drag.ptrY, drag.key) : null;
  const verdict = target && !frozen ? combineVerdict(drag!.key, target.key, res, steps) : null;
  const nameOfNode = (key: string) => (res.units.has(key) ? `▣ ${key}` : pieceNameOf(key));
  const hintText = (() => {
    if (!drag?.started || !verdict) return '';
    if (!verdict.ok) return verdict.reason;
    if (verdict.absorbInto) return `release: add to ▣ ${verdict.absorbInto}`;
    return `release: join ${nameOfNode(drag.key)} + ${nameOfNode(target!.key)}`;
  })();
  const hintBad = !!verdict && !verdict.ok;

  // Наверх — ТОЛЬКО НА СМЕНЕ ТЕКСТА. Строка стоит в хроме, рядом с доком; вызов на каждое
  // движение указателя перерисовывал бы редактор шага шестьдесят раз в секунду.
  const lastHint = useRef('');
  useEffect(() => {
    if (lastHint.current === hintText) return;
    lastHint.current = hintText;
    onHint(hintText ? { text: hintText, bad: hintBad } : null);
  }, [hintText, hintBad, onHint]);
  // Полотно ушло — подсказка не имеет права остаться висеть в хроме.
  useEffect(() => () => onHint(null), [onHint]);

  const nodeRing = (key: string) => {
    if (target?.key === key && verdict) {
      return verdict.ok
        ? 'outline outline-2 outline-offset-2 outline-textColor'
        : 'outline outline-2 outline-offset-2 outline-error';
    }
    return hovered === key ? 'outline outline-1 outline-offset-2 outline-textColor' : undefined;
  };

  // --- ткань словами ----------------------------------------------------------------------------
  //
  // Обёртки над общей `clothRollup` — те же две, что в `assembly-schematic.tsx`. Словарь и
  // формулировки приходят из `piece-cloth.ts` в одном экземпляре; здесь остаётся только счётчик,
  // и разойтись ему не с чем.

  const clothOf = (lineKey: string): PieceClothState => cloth?.get(lineKey)?.state ?? 'unbound';
  const clothLine = (lineKeys: string[]): string => {
    if (lineKeys.length === 0) return '';
    const count = `${lineKeys.length} ${lineKeys.length === 1 ? 'piece' : 'pieces'}`;
    // `cloth == null` — вопрос не задавался (у карточки нет ни одного колорвея): свёртки нет вовсе.
    if (!cloth) return count;
    const rollup = clothRollup(lineKeys.map(clothOf));
    return rollup ? `${count} · ${rollup}` : count;
  };
  const unitClothLine = (key: string): string => {
    const line = clothLine(res.units.get(key)?.leaves ?? []);
    return line ? `${key} — ${line}` : '';
  };

  const directInputs = directInputsOf(blocks, steps);
  const rowY = makeRowY(blocks, layout);
  const wires = buildWires(blocks, steps, layout, rowY);

  return (
    <div
      ref={viewportRef}
      data-tool={hand ? 'hand' : 'select'}
      className={cn(
        'relative min-h-0 min-w-0 overflow-hidden border border-borderColor bg-pageBg',
        hand && (panning ? 'cursor-grabbing' : 'cursor-grab'),
      )}
      // Полотно не отдаёт палец прокрутке: жест здесь свой, и страница под оверлеем ехать не
      // должна ни при каких обстоятельствах.
      style={{ touchAction: 'none' }}
      onPointerDown={startPan}
    >
      {empty ? (
        // ЧЕСТНОЕ ПУСТОЕ СОСТОЯНИЕ, слово в слово как у инлайна: два экрана, по-разному
        // объясняющих одно и то же, читаются как два разных правила.
        <div className='absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center'>
          <Text size='micro' variant='label'>
            no pieces yet — the schematic has nothing to draw
          </Text>
          <Text size='micro' variant='label'>
            pieces come from the patterns; they show up here as tiles, and the assembly starts from
            them
          </Text>
        </div>
      ) : (
        <div ref={worldRef} className='world absolute inset-0 origin-top-left will-change-transform'>
          {/* ЛИСТ — ПОДЛОЖКА ПОД РАБОТОЙ, а не фон вьюпорта: у бесконечного полотна должно быть
              видно, где кончается замысел и начинается пустота. Точечная сетка мельче кегля, чтобы
              читалась как бумага, а не как таблица. */}
          <div
            ref={sheetElRef}
            aria-hidden
            className='absolute border border-borderColor bg-bgColor'
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, var(--color-hairline) 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />
          <WireLayer
            wires={wires}
            hovered={hovered}
            width={layout.width}
            height={layout.height}
            markerId={markerId}
          />

          {layout.boxes.map((box) => {
            const b = blocks.find((x) => x.key === box.key);
            if (!b) return null;
            const terminal = liveUnits.length === 1 && liveUnits[0] === box.key;
            return (
              <UnitBoxView
                key={box.key}
                box={box}
                block={b}
                steps={steps}
                units={res.units}
                directInputs={directInputs}
                smvOfBlock={smvOfBlock}
                labelOf={labelOf}
                nameOfNode={nameOfNode}
                unitClothLine={unitClothLine}
                terminal={terminal}
                onTable={onTable.has(box.key)}
                isPicked={picked.includes(box.key)}
                frozen={frozen}
                hovered={hovered === box.key}
                dragging={drag?.key === box.key && drag.started}
                ringClassName={nodeRing(box.key)}
                dragProps={dragHandlers(box.key, box.x, box.y)}
                hoverProps={hoverHandlers(box.key)}
                headProps={activate(
                  !frozen && onTable.has(box.key)
                    ? clickGuard(() => toggle(box.key))
                    : (() => {
                        const eater = res.consumedBy.get(box.key);
                        return eater === undefined ? undefined : clickGuard(() => onPickStep(eater));
                      })(),
                )}
                stepProps={(i) => activate(clickGuard(() => onPickStep(i)))}
                onAddOperation={clickGuard(() =>
                  onCreate({ inputKeys: [box.key], intent: 'process' }),
                )}
                onDissolveUnit={clickGuard(() => onDissolve(b.producedAt))}
              />
            );
          })}

          {layout.tail && (
            <TailBoxView
              tail={layout.tail}
              looseSteps={looseSteps}
              smvOfBlock={smvOfBlock}
              labelOf={labelOf}
              dragging={drag?.key === '' && drag.started}
              ringClassName={nodeRing('')}
              dragProps={dragHandlers('', layout.tail.x, layout.tail.y)}
              hoverProps={hoverHandlers('')}
              stepProps={(i) => activate(clickGuard(() => onPickStep(i)))}
            />
          )}

          {layout.tiles.map((t) => (
            <TileView
              key={`tile:${t.key}`}
              tile={t}
              name={pieceNameOf(t.key)}
              pieceShapes={pieceShapes}
              cloth={cloth}
              picked={picked.includes(t.key)}
              dragging={drag?.key === t.key && drag.started}
              ringClassName={nodeRing(t.key)}
              organProps={activate(
                t.state === 'free'
                  ? !frozen
                    ? clickGuard(() => toggle(t.key))
                    : undefined
                  : (() => {
                      const eater = res.consumedBy.get(t.key);
                      return eater === undefined ? undefined : clickGuard(() => onPickStep(eater));
                    })(),
              )}
              dragProps={dragHandlers(t.key, t.x, t.y)}
              hoverProps={hoverHandlers(t.key)}
            />
          ))}
        </div>
      )}

      {/* HUD — инструмент и зум. Внизу слева, поверх мира и вне его трансформа: орган, который
          масштабируется вместе с содержимым, перестаёт быть органом. */}
      <div className='pointer-events-none absolute inset-x-2 bottom-2 flex items-end gap-1.5'>
        <div className='pointer-events-auto flex items-center gap-1.5'>
          {/* Тултипы НЕ называют букв v/h: клавиши-глаголы инструментов приедут с роутером Ф4, а
              обещать мёртвую клавишу — врать подсказкой. Ф4, заводя клавиши, возвращает их и в
              подписи. */}
          <HudGroup>
            <HudButton
              pressed={!hand}
              onClick={() => setTool('select')}
              title='select — click and drag the nodes'
            >
              ▣
            </HudButton>
            <HudButton
              pressed={hand}
              onClick={() => setTool('hand')}
              title='pan the canvas (hold space)'
            >
              ✋
            </HudButton>
          </HudGroup>
          <HudGroup>
            <HudButton
              onClick={() => {
                fitted.current = false;
                const vp = viewportRef.current;
                if (!vp) return;
                const r = vp.getBoundingClientRect();
                viewRef.current = zoomAt(viewRef.current, 1 / ZOOM_STEP, r.width / 2, r.height / 2);
                applyView();
              }}
              disabled={zoomPct <= ZOOM_MIN * 100}
              title='zoom out (−)'
            >
              −
            </HudButton>
            <HudButton
              onClick={() => {
                fitted.current = false;
                viewRef.current = { ...viewRef.current, zoom: 1 };
                applyView();
              }}
              title='reset to 100% (⌘0)'
              className='min-w-[46px] tabular-nums'
            >
              {zoomPct}%
            </HudButton>
            <HudButton
              onClick={() => {
                fitted.current = false;
                const vp = viewportRef.current;
                if (!vp) return;
                const r = vp.getBoundingClientRect();
                viewRef.current = zoomAt(viewRef.current, ZOOM_STEP, r.width / 2, r.height / 2);
                applyView();
              }}
              disabled={zoomPct >= ZOOM_MAX * 100}
              title='zoom in (+)'
            >
              +
            </HudButton>
            <HudButton onClick={() => runFit(true)} title='fit everything on screen (f, ⌘1)'>
              fit
            </HudButton>
          </HudGroup>
        </div>

        {/* ПОЛОСА ВЫБОРА — ровно те же два действия и те же подписи, что у инлайна: два входа
            бывают и у обработки, и решать за автора по их числу значит переигрывать его выбор. */}
        {!frozen && picked.length > 0 && (
          <div className='pointer-events-auto ml-auto flex max-w-[60%] flex-wrap items-center gap-1 border border-textColor bg-bgColor px-1.5 py-1'>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              selected:
            </Text>
            <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
              {picked.map(pieceNameOf).join(' + ')}
            </Text>
            {clothLine(picked.filter((k) => !res.units.has(k))) && (
              <Text size='micro' variant='label' component='span' className='shrink-0'>
                {clothLine(picked.filter((k) => !res.units.has(k)))}
              </Text>
            )}
            {picked.length >= 2 && (
              <Chip
                onClick={() => {
                  onCreate({ inputKeys: picked, intent: 'unit' });
                  onPicked([]);
                }}
                title='assemble a new unit from the selection'
              >
                join · {picked.length}
              </Chip>
            )}
            <Chip
              dashed
              onClick={() => {
                onCreate({ inputKeys: picked, intent: 'process' });
                onPicked([]);
              }}
              title='a step on the selection that assembles nothing'
            >
              processing · {picked.length}
            </Chip>
            <Chip dashed onClick={() => onPicked([])} title='clear the selection'>
              cancel
            </Chip>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Габарит работы в координатах мира.
 *
 * Считается по НОДАМ, а не по `layout.width/height`: последние несут технические поля справа и
 * снизу (`PAD_RIGHT`/`PAD_BOTTOM`), и вписывание по ним оставляло бы на экране пустую полосу тем
 * шире, чем мельче карточка.
 */
function contentBox(layout: SchematicLayout): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const nodes = [...layout.boxes, ...layout.tiles, ...(layout.tail ? [layout.tail] : [])];
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w);
    y1 = Math.max(y1, n.y + n.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 400, h: 300 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function HudGroup({ children }: { children: React.ReactNode }) {
  return <div className='inline-flex bg-bgColor'>{children}</div>;
}

function HudButton({
  children,
  onClick,
  title,
  pressed,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      className={cn(
        '-ml-px inline-flex h-5 min-w-6 items-center justify-center border border-borderColor px-1.5 text-micro uppercase tracking-label transition-colors first:ml-0',
        pressed ? 'border-textColor bg-textColor text-bgColor' : 'text-labelColor hover:text-textColor',
        disabled && 'cursor-not-allowed opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}
