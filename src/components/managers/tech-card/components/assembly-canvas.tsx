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
import {
  applyOverrides,
  combineVerdict,
  hitNode,
  type CombineVerdict,
  type PosOverrides,
} from './assembly-positions';
import {
  autopanDelta,
  autopanTick,
  fitView,
  hatchK,
  marqueeHits,
  OPEN_FLOOR,
  revealDelta,
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

/** Одна едущая нода. Их больше одной, когда взяли ноду из выделения. */
type DragItem = {
  key: string;
  /** Где внутри ноды её взяли — чтобы нода не прыгала под курсор углом. Координаты МИРА. */
  offX: number;
  offY: number;
  x: number;
  y: number;
};

type DragState = {
  /** Нода, ЗА КОТОРУЮ взяли: по ней считается вердикт, остальные едут следом. */
  key: string;
  pointerId: number;
  /**
   * Всё, что едет. МУЛЬТИДРАГ — ЛИСТ, СОБРАННЫЙ НА pointerdown И БОЛЬШЕ НЕ РАСТУЩИЙ: выделение во
   * время жеста меняться не может (маркиза и клики заблокированы зажатым указателем), а
   * пересобирать список на каждом кадре значило бы возить ноды, которых в жесте не было.
   */
  items: DragItem[];
  fromX: number;
  fromY: number;
  /** Где сейчас указатель, в координатах мира: по нему ищется цель под курсором. */
  ptrX: number;
  ptrY: number;
  started: boolean;
};

/**
 * Маркиза — рамка по пустой земле.
 *
 * Углы живут в МИРЕ, а рисуется рамка в ЭКРАННЫХ координатах (`r * zoom + pan`): иначе автопан
 * посреди жеста растягивал бы её вместе с миром, вместо того чтобы оставить под рукой.
 */
type MarqueeState = {
  pointerId: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Shift — добавление к тому, что было выбрано на старте. */
  add: boolean;
  base: string[];
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
  /** Инструмент клавишами `v`/`h`. Кнопки HUD зовут то же состояние. */
  setTool: (tool: 'select' | 'hand') => void;
  /**
   * Сдвинуть выделение стрелками. Мимо формы — это раскладка, а не данные; и мимо фулскрина —
   * координаты нод знает только раскладка, живущая здесь.
   */
  nudge: (dx: number, dy: number) => void;
  /** Кадрировать габарит выделения (`⇧2`). Пустое выделение отвергает вызывающий — он же и объясняет. */
  fitSelection: () => void;
  /** Довести ноду до глаз панорамой, МИНИМАЛЬНЫМ сдвигом. Потребитель — find-палитра. */
  reveal: (key: string) => void;
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

  const layout = useMemo(() => {
    if (!drag?.started) return applyOverrides(auto, positions);
    const live: PosOverrides = { ...positions };
    for (const it of drag.items) live[it.key] = { x: it.x, y: it.y };
    return applyOverrides(auto, live);
  }, [auto, positions, drag]);
  // Слушатели жестов живут на window и не имеют права держать раскладку в замыкании: пересоздавать
  // их на каждое движение мыши значило бы снимать и вешать четыре подписки шестьдесят раз в секунду.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // По той же причине — выбор, его писатель, писатель позиций и фронтир.
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const onPickedRef = useRef(onPicked);
  onPickedRef.current = onPicked;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onTableRef = useRef(onTable);
  onTableRef.current = onTable;

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
      setTool,
      nudge: (dx, dy) => {
        const eff = layoutRef.current;
        for (const k of pickedRef.current) {
          const n = eff.byKey.get(k) ?? eff.tileByKey.get(k);
          if (!n) continue;
          // Кламп в ноль — тот же, что у драга: за левым/верхним краем нода недостижима.
          onMoveRef.current(k, { x: Math.max(0, n.x + dx), y: Math.max(0, n.y + dy) });
        }
      },
      fitSelection: () => {
        const vp = viewportRef.current;
        if (!vp) return;
        const r = vp.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const box = boxOfKeys(layoutRef.current, pickedRef.current);
        if (!box) return;
        // ТОТ ЖЕ КЛАМП, ЧТО У fitView, и БЕЗ пола открытия: «показать выбранное» просили явно,
        // ровно как ручной fit. Но `fitted` не взводим — авто-пере-вписывание на ресайзе показывает
        // ВСЁ, и наследовать ему кадр одного узла значило бы молча подменить смысл.
        fitted.current = false;
        animateOnce();
        viewRef.current = fitView(box, { w: r.width, h: r.height });
        applyView();
      },
      reveal: (key) => {
        const vp = viewportRef.current;
        if (!vp) return;
        const r = vp.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const eff = layoutRef.current;
        const n =
          eff.byKey.get(key) ?? eff.tileByKey.get(key) ?? (key === '' ? eff.tail : undefined);
        if (!n) return;
        const d = revealDelta(
          { x: n.x, y: n.y, w: n.w, h: n.h },
          { w: r.width, h: r.height },
          viewRef.current,
        );
        if (!d.x && !d.y) return; // уже видно — увозить экран не за чем
        fitted.current = false;
        animateOnce();
        const { pan, zoom } = viewRef.current;
        viewRef.current = { zoom, pan: { x: pan.x + d.x, y: pan.y + d.y } };
        applyView();
      },
    }),
    [runFit, applyView, animateOnce],
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
      // МУЛЬТИДРАГ ТОЛЬКО ИЗ ВЫДЕЛЕНИЯ. Взяли ноду, которая в выделении, — едет всё выделение;
      // взяли постороннюю — едет она одна, и выделение НЕ ТРОГАЕТСЯ. Прототип на захвате
      // невыделенной ноды делал её единственной выбранной, но там клик = выбрать; здесь клик по
      // шапке ПЕРЕКЛЮЧАЕТ, и выбор на pointerdown спорил бы с переключением на click.
      const group = picked.includes(key) ? picked : [key];
      const eff = layoutRef.current;
      const items: DragItem[] = [];
      for (const k of group) {
        const n = k === key ? { x: nodeX, y: nodeY } : eff.byKey.get(k) ?? eff.tileByKey.get(k);
        if (!n) continue;
        items.push({ key: k, offX: p.x - n.x, offY: p.y - n.y, x: n.x, y: n.y });
      }
      if (!items.some((i) => i.key === key)) return;
      commitDrag({
        key,
        pointerId: e.pointerId,
        items,
        fromX: p.x,
        fromY: p.y,
        ptrX: p.x,
        ptrY: p.y,
        started: false,
      });
      // Жест ноды состоялся — маркиза его не перехватывает. Виджет-предок иначе завёл бы рамку
      // прямо поверх начатого перетаскивания.
      e.stopPropagation();
    },
  });

  // --- маркиза ------------------------------------------------------------------------------------

  const marqueeRef = useRef<MarqueeState | null>(null);
  const [marqueeOn, setMarqueeOn] = useState(false);
  const marqueeElRef = useRef<HTMLDivElement>(null);
  /** Последнее выделение, ОТПРАВЛЕННОЕ наверх: рамка ползёт кадрами, а выбор меняется редко. */
  const emitted = useRef<string[]>([]);
  /** Где сейчас палец, в координатах ОКНА: по нему считается автопан. */
  const lastClient = useRef<{ x: number; y: number } | null>(null);

  /** Рамка рисуется в ЭКРАННЫХ координатах и пишется императивно — как и сам трансформ мира. */
  const paintMarquee = useCallback(() => {
    const el = marqueeElRef.current;
    if (!el) return;
    const m = marqueeRef.current;
    if (!m) {
      el.style.display = 'none';
      return;
    }
    const { pan, zoom } = viewRef.current;
    const x = Math.min(m.x0, m.x1);
    const y = Math.min(m.y0, m.y1);
    el.style.display = 'block';
    el.style.left = `${x * zoom + pan.x}px`;
    el.style.top = `${y * zoom + pan.y}px`;
    el.style.width = `${Math.abs(m.x1 - m.x0) * zoom}px`;
    el.style.height = `${Math.abs(m.y1 - m.y0) * zoom}px`;
  }, []);

  /**
   * Пересчитать выделение под рамкой.
   *
   * Наверх уходит ТОЛЬКО СМЕНА НАБОРА: `onPicked` перерисовывает весь фулскрин, а рамка ползёт по
   * пустой земле большую часть жеста.
   *
   * Фильтр по фронтиру — тот же инвариант, что у эффекта очистки выбора ниже: съеденная деталь
   * входом не годится, и мигать ею в полосе выбора нечестно.
   */
  const applyMarquee = useCallback(() => {
    const m = marqueeRef.current;
    if (!m) return;
    const eff = layoutRef.current;
    const rect: Rect = {
      x: Math.min(m.x0, m.x1),
      y: Math.min(m.y0, m.y1),
      w: Math.abs(m.x1 - m.x0),
      h: Math.abs(m.y1 - m.y0),
    };
    const hits = marqueeHits(rect, [...eff.boxes, ...eff.tiles]).filter((k) =>
      onTableRef.current.has(k),
    );
    const next = m.add ? [...m.base, ...hits.filter((k) => !m.base.includes(k))] : hits;
    // Сравнение поэлементное, а не по склейке: ключ детали приходит из чертежа и любой разделитель
    // содержать вправе, а склейка с общим разделителем склеила бы два разных набора в один.
    const prev = emitted.current;
    if (next.length === prev.length && next.every((k, i) => k === prev[i])) return;
    emitted.current = next;
    onPickedRef.current(next);
  }, []);

  /**
   * Жест начался с ПУСТОЙ ЗЕМЛИ — рамка. Нода до этого места событие не пускает (`stopPropagation`
   * в её `onPointerDown`), лист и слой проводов — пускают, и это правильно: и то и другое фон.
   */
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    // ХРОМ ПОЛОТНА — НЕ ЗЕМЛЯ. HUD и полоса выбора живут ВНУТРИ вьюпорта (они не должны ехать с
    // миром), и их pointerdown всплывает сюда: без этой строки нажатие «fit» заводило бы рамку и
    // сбрасывало выделение, а в режиме ладони — начинало панораму прямо с кнопки.
    if ((e.target as HTMLElement | null)?.closest?.('[data-canvas-chrome]')) return;
    startPan(e);
    if (panRef.current || dragRef.current || marqueeRef.current) return;
    if (e.button !== 0 || handRef.current) return;
    const p = toWorldPoint(e);
    if (!p) return;
    const base = e.shiftKey ? picked : [];
    marqueeRef.current = {
      pointerId: e.pointerId,
      x0: p.x,
      y0: p.y,
      x1: p.x,
      y1: p.y,
      add: e.shiftKey,
      base,
    };
    lastClient.current = { x: e.clientX, y: e.clientY };
    emitted.current = base;
    if (!e.shiftKey && picked.length > 0) onPicked([]);
    setMarqueeOn(true);
    paintMarquee();
    e.preventDefault();
  };

  useEffect(() => {
    if (!marqueeOn) return;
    const move = (e: PointerEvent) => {
      const m = marqueeRef.current;
      if (!m || e.pointerId !== m.pointerId) return;
      const p = toWorldPoint(e);
      if (!p) return;
      lastClient.current = { x: e.clientX, y: e.clientY };
      m.x1 = p.x;
      m.y1 = p.y;
      paintMarquee();
      applyMarquee();
    };
    const end = () => {
      marqueeRef.current = null;
      lastClient.current = null;
      setMarqueeOn(false);
      paintMarquee();
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
  }, [marqueeOn, toWorldPoint, paintMarquee, applyMarquee]);

  // --- автопан у края -----------------------------------------------------------------------------
  //
  // Порт scroll-модели инлайна СО СМЕНОЙ ЗНАКА и делением на зум: прокрутка двигает окно по миру,
  // трансформ — мир под окном. Обе половины (`autopanDelta`, `autopanTick`) живут в `canvas-view.ts`
  // под пробой; здесь остаётся только применить их к состоянию жеста.
  //
  // ЖЕСТ ЕДЕТ ВМЕСТЕ С МИРОМ. Палец стоит, мир уехал — значит и точка прицела, и все едущие ноды
  // сместились в мире на одну и ту же величину. Без второй половины автопан довозил бы ноду до
  // цели, а hit-test продолжал бить в исходную точку: дроп «на подъехавший узел» молча становился
  // бы перемещением, и даже отказа бы не было.
  const autopanOn = (drag?.started ?? false) || marqueeOn;
  useEffect(() => {
    if (!autopanOn) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const vp = viewportRef.current;
      const c = lastClient.current;
      if (!vp || !c) return;
      const r = vp.getBoundingClientRect();
      const delta = autopanDelta(r, c);
      if (!delta.x && !delta.y) return;
      const d = dragRef.current;
      const m = marqueeRef.current;
      const ptr = d ? { x: d.ptrX, y: d.ptrY } : m ? { x: m.x1, y: m.y1 } : null;
      if (!ptr) return;
      const next = autopanTick(viewRef.current, ptr, delta);
      const dw = { x: next.ptrWorld.x - ptr.x, y: next.ptrWorld.y - ptr.y };
      viewRef.current = next.view;
      fitted.current = false;
      applyView();
      if (d) {
        commitDrag({
          ...d,
          ptrX: next.ptrWorld.x,
          ptrY: next.ptrWorld.y,
          items: d.items.map((it) => ({ ...it, x: it.x + dw.x, y: it.y + dw.y })),
        });
      } else if (m) {
        m.x1 = next.ptrWorld.x;
        m.y1 = next.ptrWorld.y;
        paintMarquee();
        applyMarquee();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autopanOn, applyView, commitDrag, paintMarquee, applyMarquee]);

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
      lastClient.current = { x: e.clientX, y: e.clientY };
      // Порог считается в МИРЕ, но сравнивается с экранными пикселями: на 0.5× четыре мировых
      // пикселя — это два экранных, и жест разъезжался бы с рукой. Делим порог на зум.
      const t = DRAG_THRESHOLD / viewRef.current.zoom;
      const far = Math.abs(p.x - d.fromX) > t || Math.abs(p.y - d.fromY) > t;
      if (!d.started && !far) return;
      commitDrag({
        ...d,
        started: true,
        items: d.items.map((it) => ({ ...it, x: p.x - it.offX, y: p.y - it.offY })),
        ptrX: p.x,
        ptrY: p.y,
      });
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
      const landed: PosOverrides = {};
      for (const it of d.items) landed[it.key] = { x: Math.max(0, it.x), y: Math.max(0, it.y) };
      // ПОРЯДОК ХВОСТА — ТОТ ЖЕ, ЧТО У ИНЛАЙНА, и он не про удобство: перемещение состоялось в
      // любом случае (жест композитен, и «перенёс» не отменяется тем, что «соединить» потом
      // отклонили), поэтому `onMove` идёт ПЕРВЫМ и до гейта заморозки — раскладывать чужую
      // выпущенную карточку разрешено (R10). Соединять — нет.
      for (const it of d.items) onMove(it.key, landed[it.key]);
      if (frozen) return;
      const eff = applyOverrides(auto, { ...positions, ...landed });
      // ВСЁ ЕДУЩЕЕ ВЫРЕЗАНО ИЗ HIT-TEST, а не только та нода, за которую взяли: остальные едут под
      // тем же курсором и заслоняли бы цель. `hitNode` умеет исключать одну ноду, и менять его
      // сигнатуру ради этого — лезть в чужой модуль; вырезать их из раскладки честнее и дешевле.
      const held = new Set(d.items.map((i) => i.key));
      const probe = {
        ...eff,
        boxes: eff.boxes.filter((b) => !held.has(b.key)),
        tiles: eff.tiles.filter((t) => !held.has(t.key)),
        tail: eff.tail && held.has(eff.tail.key) ? undefined : eff.tail,
      };
      const hit = hitNode(probe, d.ptrX, d.ptrY, d.key);
      if (!hit) return;
      // МУЛЬТИДРОП — ЕСТЕСТВЕННОЕ ОБОБЩЕНИЕ, а не новый жест: вердикт спрашивается за КАЖДУЮ
      // едущую ноду против одной цели, первый отказ произносится и жест кончается. Соглашаться
      // выборочно нельзя — человек бросал их вместе.
      const keys = d.items.map((i) => i.key);
      const verdicts = keys.map((k) => combineVerdict(k, hit.key, res, steps));
      const bad = verdicts.find((v) => v && !v.ok);
      if (bad && !bad.ok) {
        // Отказ ДО диалога, словами движка: открывать форму, которую нельзя отправить, — предлагать
        // заведомый отказ (R2).
        showMessage(bad.reason, 'error');
        return;
      }
      let joined = false;
      let absorbInto: string | undefined;
      for (const v of verdicts) {
        if (!v || !v.ok) continue;
        joined = true;
        absorbInto = v.absorbInto;
      }
      if (!joined) return; // жеста не было вовсе: бросили саму в себя или в хвостовой бокс
      onCreate({
        inputKeys: [...keys, hit.key],
        absorbInto,
        intent: absorbInto ? undefined : 'unit',
      });
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

  // Escape во время МАРКИЗЫ — тот же откат жеста, симметрично драгу. Без него Esc посреди рамки
  // проваливался в Esc-лестницу фулскрина: при пустом выборе она закрывала ВЕСЬ экран прямо под
  // зажатым указателем, а при непустом — гасила выбор, оставляя рамку жить и молча воскрешать его
  // на первой же новой ноде (сравнение в `applyMarquee` идёт с `emitted`, а не с внешним выбором).
  // Выбор возвращается к БАЗЕ жеста: не-shift маркиза начинается с очистки, и очистка остаётся —
  // ровно как у клика по пустому месту.
  useEffect(() => {
    if (!marqueeOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      const m = marqueeRef.current;
      if (m) onPickedRef.current(m.base);
      marqueeRef.current = null;
      lastClient.current = null;
      setMarqueeOn(false);
      paintMarquee();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [marqueeOn, paintMarquee]);

  // --- вердикт и подсказка ----------------------------------------------------------------------

  // Цель ищется в раскладке БЕЗ едущих нод — по той же причине, что и на отпускании: они едут под
  // тем же курсором и заслоняли бы то, во что целятся.
  const heldNow = drag?.started ? new Set(drag.items.map((i) => i.key)) : null;
  const probeLayout = heldNow
    ? {
        ...layout,
        boxes: layout.boxes.filter((b) => !heldNow.has(b.key)),
        tiles: layout.tiles.filter((t) => !heldNow.has(t.key)),
        tail: layout.tail && heldNow.has(layout.tail.key) ? undefined : layout.tail,
      }
    : layout;
  const target = drag?.started ? hitNode(probeLayout, drag.ptrX, drag.ptrY, drag.key) : null;
  const verdict: CombineVerdict | null = (() => {
    if (!target || frozen || !drag?.started) return null;
    let okV: CombineVerdict | null = null;
    for (const it of drag.items) {
      const v = combineVerdict(it.key, target.key, res, steps);
      if (v && !v.ok) return v; // первый отказ и есть ответ: соглашаться выборочно нельзя
      if (v?.ok) okV = v;
    }
    return okV;
  })();
  const nameOfNode = (key: string) => (res.units.has(key) ? `▣ ${key}` : pieceNameOf(key));

  /**
   * ОДНО ПРЕДЛОЖЕНИЕ О ВЫДЕЛЕНИИ — и подсказка маркизы, и полоса выбора зовут именно его.
   *
   * Урок прототипа: «одно выделение, два словаря». Пока рамку тянут, счётчик в подсказке считался
   * по всем задетым нодам, а полоса — по тем, что можно взять, и два органа описывали одно
   * выделение разными числами одновременно.
   */
  const selectionSentence = (keys: string[]): string => {
    const free = keys.filter((k) => onTable.has(k));
    const units = free.filter((k) => res.units.has(k)).length;
    const parts = free.length - units;
    const bits: string[] = [];
    if (parts) bits.push(`${parts} ${parts === 1 ? 'piece' : 'pieces'}`);
    if (units) bits.push(`${units} ${units === 1 ? 'unit' : 'units'}`);
    const spent = keys.length - free.length;
    return (
      (bits.length ? `picked: ${bits.join(' · ')}` : 'picked: nothing that can be taken') +
      (spent ? ` · ${spent} already in units` : '')
    );
  };

  const hintText = (() => {
    // Маркиза говорит ТЕМ ЖЕ предложением, что и полоса выбора, — иначе рамка и панель считают
    // одно выделение по-разному.
    if (marqueeOn) {
      return picked.length ? selectionSentence(picked) : 'drag over nodes to pick them up';
    }
    if (!drag?.started || !verdict) return '';
    if (!verdict.ok) return verdict.reason;
    if (verdict.absorbInto) return `release: add to ▣ ${verdict.absorbInto}`;
    const held = drag.items.map((i) => nameOfNode(i.key)).join(' + ');
    return `release: join ${held} + ${nameOfNode(target!.key)}`;
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
      onPointerDown={onCanvasPointerDown}
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
                dragging={!!heldNow?.has(box.key)}
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
              dragging={!!heldNow?.has('')}
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
              dragging={!!heldNow?.has(t.key)}
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

      {/* РАМКА МАРКИЗЫ — ВНЕ МИРА и в экранных координатах: внутри мира её обводка масштабировалась
          бы вместе с ним (на 2.5× пунктир втрое жирнее контуров нод), а автопан растягивал бы её
          вместо того, чтобы оставить под рукой. Позиция пишется императивно — как и сам трансформ. */}
      <div
        ref={marqueeElRef}
        aria-hidden
        className='pointer-events-none absolute border border-dashed border-textColor bg-textColor/5'
        style={{ display: 'none', left: 0, top: 0, width: 0, height: 0 }}
      />

      {/* HUD — инструмент и зум. Внизу слева, поверх мира и вне его трансформа: орган, который
          масштабируется вместе с содержимым, перестаёт быть органом. */}
      <div
        data-canvas-chrome
        className='pointer-events-none absolute inset-x-2 bottom-2 flex items-end gap-1.5'
      >
        <div className='pointer-events-auto flex items-center gap-1.5'>
          {/* БУКВЫ ВЕРНУЛИСЬ В ПОДПИСИ вместе с клавишами: Ф3 сняла их ровно с формулировкой «Ф4,
              заводя клавиши, возвращает их». Подсказка, обещающая мёртвую клавишу, — ложь; молчащая
              о живой — потеря. */}
          <HudGroup>
            <HudButton
              pressed={!hand}
              onClick={() => setTool('select')}
              title='select — click and drag the nodes (v)'
            >
              ▣
            </HudButton>
            <HudButton
              pressed={hand}
              onClick={() => setTool('hand')}
              title='pan the canvas (h, or hold space)'
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
            бывают и у обработки, и решать за автора по их числу значит переигрывать его выбор.
            Считает она ТЕМ ЖЕ предложением, что и подсказка маркизы (`selectionSentence`).

            НА ВЫПУЩЕННОЙ КАРТОЧКЕ ДЕЙСТВИЙ НЕТ ВОВСЕ — зеркало инлайна, где `ActionPanel` стоит за
            `{!frozen && …}`. Маркиза на RELEASED законна (выделение — способ смотреть, R10), но
            кнопка, которая молча выбросит заполненную форму (`appendStep` выходит на первой
            строке), хуже отсутствующей кнопки. Остаются предложение и `clear`. */}
        {picked.length > 0 && (
          <div className='pointer-events-auto ml-auto flex max-w-[60%] flex-wrap items-center gap-1 border border-textColor bg-bgColor px-1.5 py-1'>
            {/* ПРЕДЛОЖЕНИЕМ, а не капслоком: строка бывает длиннее четырёх слов, а капслок в этом
                приложении носят только вещи в четыре слова и короче. */}
            <Text size='micro' variant='label' component='span' className='shrink-0'>
              {selectionSentence(picked)}
            </Text>
            <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
              {picked.map(pieceNameOf).join(' + ')}
            </Text>
            {clothLine(picked.filter((k) => !res.units.has(k))) && (
              <Text size='micro' variant='label' component='span' className='shrink-0'>
                {clothLine(picked.filter((k) => !res.units.has(k)))}
              </Text>
            )}
            {!frozen && picked.length >= 2 && (
              <Chip
                onClick={() => {
                  onCreate({ inputKeys: picked, intent: 'unit' });
                  onPicked([]);
                }}
                title='assemble a new unit from the selection (u)'
              >
                join · {picked.length}
              </Chip>
            )}
            {!frozen && (
              <Chip
                dashed
                onClick={() => {
                  onCreate({ inputKeys: picked, intent: 'process' });
                  onPicked([]);
                }}
                title='a step on the selection that assembles nothing (o)'
              >
                processing · {picked.length}
              </Chip>
            )}
            {/* РАСТВОРИТЬ — гейт тот же, что у клавиши `d` и у кнопки в боксе: ровно один узел, и
                он на столе. Полотно только зовёт мутатор; отказы формулирует клавиша. */}
            {!frozen && picked.length === 1 && res.units.has(picked[0]) && (
              <Chip
                dashed
                onClick={() => {
                  const b = blocks.find((x) => x.key === picked[0]);
                  if (!b) return;
                  onDissolve(b.producedAt);
                  onPicked([]);
                }}
                title='dissolve the unit — its inputs return to the table (d)'
              >
                dissolve
              </Chip>
            )}
            <Chip dashed onClick={() => onPicked([])} title='clear the selection (esc)'>
              clear
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

/**
 * Габарит НАБОРА нод в координатах мира — для `⇧2` (кадрировать выделение).
 *
 * `null`, когда кадрировать нечего: пустой выбор или ключи, которых в раскладке уже нет. Отказ
 * произносит вызывающий — полотно о словах не знает.
 */
function boxOfKeys(layout: SchematicLayout, keys: string[]): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const k of keys) {
    const n = layout.byKey.get(k) ?? layout.tileByKey.get(k) ?? (k === '' ? layout.tail : undefined);
    if (!n) continue;
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w);
    y1 = Math.max(y1, n.y + n.h);
  }
  if (!Number.isFinite(x0)) return null;
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
