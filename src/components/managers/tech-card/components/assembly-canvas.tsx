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
  notifyWorldMoved,
  picksMany,
  pieceAddPrefill,
  TailBoxView,
  TileView,
  unitAddPrefill,
  unitHeadOpen,
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

/**
 * Порог, разводящий клик и перетаскивание. Тот же, что у инлайна.
 *
 * ЭКСПОРТИРУЕТСЯ ради жеста ИЗ ПОЛКИ: он начинается за пределами полотна, и порог ему считает
 * владелец жеста (`assembly-fullscreen.tsx`). Второе число здесь означало бы, что одна и та же
 * рука разводит клик и драг по-разному на двух сторонах одной границы.
 */
export const DRAG_THRESHOLD = 4;

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
  /**
   * Жест начат СНАРУЖИ — плиткой полки, через ручку `beginExternalDrag`.
   *
   * Состояние у него то же самое, и это главное: подсветка цели, вердикт, подсказка, автопан и
   * живая позиция плитки читают одно поле, а хвост дропа — один на оба жеста. Отличается ровно
   * одно — КТО его ведёт: оконные слушатели полотна такой драг пропускают целиком, потому что
   * указатель захвачен чужим элементом и решение «состоялся ли дроп» принимает владелец.
   */
  external?: boolean;
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
   * ВСЕ НОДЫ ПОЛОТНА — детали, потом узлы, в порядке раскладки. Нужна ⌘A: «выделить всё» обязано
   * значить ВСЁ, включая поглощённое (выделение — презентация, R10), а состав нод знает раскладка,
   * живущая здесь. Хвостовой бокс не входит: узлом он не является, и выделять его нечем.
   */
  nodeKeys: () => string[];
  /**
   * Сдвинуть выделение стрелками. Мимо формы — это раскладка, а не данные; и мимо фулскрина —
   * координаты нод знает только раскладка, живущая здесь.
   */
  nudge: (dx: number, dy: number) => void;
  /** Кадрировать габарит выделения (`⇧2`). Пустое выделение отвергает вызывающий — он же и объясняет. */
  fitSelection: () => void;
  /** Довести ноду до глаз панорамой, МИНИМАЛЬНЫМ сдвигом. Потребитель — find-палитра. */
  reveal: (key: string) => void;

  // --- ПОРТ ВНЕШНЕГО ЖЕСТА ---------------------------------------------------------------------
  //
  // Драг плитки ИЗ ПОЛКИ на полотно. Жест начинается ВНЕ полотна, поэтому ведёт его владелец экрана
  // (`assembly-fullscreen.tsx`): он держит захват указателя, считает порог, рисует ghost и гасит
  // клик-эхо. Полотно отдаёт наружу ровно то, чего снаружи не достать: свою систему координат, свою
  // подсветку цели и СВОЙ ХВОСТ ДРОПА — тот же `hitNode` → `combineVerdict` → отказ словами движка
  // → `onCreate`, что и у драга нод.
  //
  // POINTER, А НЕ HTML5 DnD (решение плана, M4): под нативным драгом pointer-события не летят вовсе,
  // и hit-тест узлов перестал бы работать — дроп «на узел» молча стал бы переносом.

  /** Рука поехала: взять деталь `key` в мир. Порог владелец жеста уже прошёл. */
  beginExternalDrag: (key: string, clientX: number, clientY: number) => void;
  /**
   * Указатель переехал. Возвращает, находится ли он НАД СЦЕНОЙ: там плитку уже везёт само полотно,
   * и ghost владельцу больше не нужен.
   */
  moveExternalDrag: (clientX: number, clientY: number) => boolean;
  /** Отпустили. Мимо сцены — жеста не было; над сценой — общий хвост дропа. */
  dropExternalDrag: (clientX: number, clientY: number) => void;
  /** Жест оборвали: Escape, `pointercancel` от браузера, потеря окна. */
  cancelExternalDrag: () => void;
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
   * ШАГ, ОТКРЫТЫЙ В ДОКЕ, — его строка на полотне инвертируется, где бы она ни была нарисована
   * (в узле, в хвосте или обработкой на плитке детали). Считает ФУЛСКРИН: только он знает, что
   * сейчас в нижнем баре, — полотно про док не знает вовсе и знать не должно.
   *
   * `null` — внизу не открыт ни один шаг (док свёрнут или показывает узел списком). Инлайн этот
   * проп не передаёт: редактора под схемой у него нет.
   */
  openStep?: number | null;
  /**
   * Открыть создание операции по собранному жесту. Полотно НЕ пишет в форму: ни один жест не
   * подставляет тип, зону и машину — всё кончается диалогом (R1).
   */
  onCreate: (prefill: CreatePrefill) => void;
  /**
   * Открыть УЗЕЛ в доке — вторая роль дока, та же, в которую ведёт клавиша `e`, и та же, в
   * которую ведёт клик по шапке узла с двумя и более операциями. Необязателен, и это не
   * небрежность: дока нет у инлайна, и там клик по шапке открывает первую операцию узла.
   */
  onOpenUnit?: (unitKey: string) => void;
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
  /**
   * Σ SMV ХВОСТОВОГО БОКСА — по НАРИСОВАННЫМ им строкам, а не по хвостовому блоку. Считает досье
   * (`useRailGrouping`), полотно только показывает. Отдельно от `smvOfBlock` потому, что вопрос
   * другой: у блока считается вся приписанная работа, у коробки — то, что в ней нарисовано.
   */
  tailSmv: string;
  positions: PosOverrides;
  /**
   * Ноды переехали. ПАЧКОЙ, А НЕ ПО ОДНОЙ, потому что жест бывает мультидроп и стрелка по
   * выделению: разбитый на N вызовов, он лёг бы в историю отмены как N отдельных жестов, и ⌘Z
   * возвращал бы мультидраг из четырёх нод по одной ноде за нажатие. Пишет вызывающий — полотно
   * не знает ни про предпочтения, ни про историю.
   */
  onMove: (moves: { key: string; at: { x: number; y: number } }[]) => void;
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
    openStep = null,
    onCreate,
    onOpenUnit,
    onDissolve,
    pieceShapes,
    cloth,
    smvOfBlock,
    tailSmv,
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

  const toggle = (key: string) =>
    onPicked(picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);

  /**
   * ЧАСТЬ ВЫДЕЛЕНИЯ, ГОДНАЯ ВО ВХОДЫ. Выделять можно ЧТО УГОДНО (выделение — презентация, R10), а
   * собирать — только со стола: съеденная нода входом не годится, это правило 2 движка. Огранка
   * стоит здесь, у глаголов и чипов, а не на маркизе: на собранной карточке фронтир схлопывается
   * почти в одну ноду, и фильтр на маркизе делал «выделить несколько блоков» невозможным физически.
   */
  const pickedFree = picked.filter((k) => onTable.has(k));

  const auto = useMemo(() => assemblyLayout(blocks, steps, res), [blocks, steps, res]);

  // ВЫБОР ЖИВЁТ, ПОКА ЖИВА САМА НОДА, а не пока она на столе. Раньше здесь стоял фильтр по
  // фронтиру — под прежний контракт «выделение = входы следующего жеста». Контракт отменён:
  // выделение стало презентацией, и съеденная нода вправе остаться выделенной — она никуда с
  // полотна не делась. Выбрасывать надо только то, чего БОЛЬШЕ НЕТ: деталь, ушедшую из рецепта, и
  // узел, растворённый соседним жестом. Множество живых нод — это ровно то, что нарисовала
  // раскладка, поэтому спрашиваем её, а не пересчитываем состав деталей второй формулой.
  useEffect(() => {
    const live = picked.filter((k) => auto.byKey.has(k) || auto.tileByKey.has(k));
    if (live.length !== picked.length) onPicked(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

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
  // По той же причине — выбор, его писатель и писатель позиций.
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const onPickedRef = useRef(onPicked);
  onPickedRef.current = onPicked;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

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
    //
    // ЗАЧЕМ ПРИДЕРЖИВАТЬ РЕШЁТКУ. Не потому, что контур «не масштабируется»: он масштабируется
    // вместе с миром — CSS-трансформ предка растягивает уже отрисованный слой, и на 250 % чернила
    // те же 2.5px, что и штрих без клампа (замерено ревью PR, прежняя формулировка здесь врала).
    // Придерживать нужно потому, что словарь различает РОЛИ ткани частотой решётки — contrast 3.5
    // против main 6, — и растянутая вдвое с половиной решётка съедает этот разрыв: две разные роли
    // становятся одной текстурой. На 100 % всё при этом выглядит правильно, поэтому дефекта не
    // видно, пока не приблизишь.
    world.style.setProperty('--hk', String(hatchK(zoom)));
    setZoomPct(Math.round(zoom * 100));
    // МИР ПОЕХАЛ — И ОБ ЭТОМ НАДО СКАЗАТЬ ВСЛУХ. Всё, что решается по ЭКРАННОМУ положению ноды
    // (сегодня — в какую сторону встаёт ховер-полоса), рендера на зуме и панораме не получает
    // вовсе: трансформ пишется сюда, в стиль, мимо React. Весть стоит РОВНО ЗДЕСЬ, у
    // единственного писателя трансформа, — второе место означало бы, что однажды мир поедет
    // молча. Цикл `notifyWorldMoved` пуст, пока никто ни на что не наведён.
    notifyWorldMoved();
  }, []);

  // --- маркиза: состояние и живопись -------------------------------------------------------------
  //
  // Объявлены ВЫШЕ вида, потому что вид их зовёт: каждый писатель `viewRef` обязан перерисовать
  // рамку (она живёт в экранных координатах) и передвинуть мировые точки живого жеста —
  // `syncGestureToView` ниже. Сами слушатели жеста остаются в секции «маркиза».

  const marqueeRef = useRef<MarqueeState | null>(null);
  const marqueeElRef = useRef<HTMLDivElement>(null);
  /** Последнее выделение, ОТПРАВЛЕННОЕ наверх: рамка ползёт кадрами, а выбор меняется редко. */
  const emitted = useRef<string[]>([]);
  /** Где сейчас палец, в координатах ОКНА: по нему считаются автопан и компенсация смены вида. */
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
   * ФИЛЬТРА ПО ФРОНТИРУ ЗДЕСЬ БОЛЬШЕ НЕТ, и это отмена прежнего контракта, а не его нарушение.
   * Рамка брала только то, что лежит на столе, потому что выделение задумывалось как «входы
   * следующего жеста». На собранной карточке фронтир схлопывается почти в одну ноду — и «выделить
   * несколько блоков» становилось невозможным ФИЗИЧЕСКИ, при том что подсказка продолжала звать
   * тащить рамку поверх нод. Выделение теперь презентация (R10): рамка берёт всё, что накрыла, а
   * годность во входы проверяют глаголы и чипы — там же, где жест исполняется, и там же, где
   * отказ можно произнести словами движка.
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
    const hits = marqueeHits(rect, [...eff.boxes, ...eff.tiles]);
    const next = m.add ? [...m.base, ...hits.filter((k) => !m.base.includes(k))] : hits;
    // Сравнение поэлементное, а не по склейке: ключ детали приходит из чертежа и любой разделитель
    // содержать вправе, а склейка с общим разделителем склеила бы два разных набора в один.
    const prev = emitted.current;
    if (next.length === prev.length && next.every((k, i) => k === prev[i])) return;
    emitted.current = next;
    onPickedRef.current(next);
  }, []);

  /**
   * ЖЕСТ ЕДЕТ ВМЕСТЕ С МИРОМ — та же вторая половина, что у автопана, но для ЛЮБОГО писателя вида.
   *
   * Колесо, зум клавишей или кнопкой HUD, fit посреди живого драга или маркизы двигают мир, а рука
   * стоит: без сдвига мировых точек жеста hit-test бьёт туда, где курсор уже не стоит, дроп сразу
   * после колеса ложится мимо руки на всю величину прокрутки, а рамка маркизы остаётся нарисованной
   * по старому экрану. Зовётся ПОСЛЕ записи `viewRef` с ПРЕЖНИМ видом аргументом; точка пересчёта —
   * `lastClient` (в неё пишут и жест ноды, и маркиза, и внешний драг над сценой).
   */
  const syncGestureToView = useCallback(
    (prev: View) => {
      const m = marqueeRef.current;
      const d = dragRef.current;
      if (!d && !m) return;
      const vp = viewportRef.current;
      const c = lastClient.current;
      if (vp && c) {
        const r = vp.getBoundingClientRect();
        const before = toWorld(c.x, c.y, r, prev);
        const after = toWorld(c.x, c.y, r, viewRef.current);
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        if (dx || dy) {
          if (d?.started) {
            commitDrag({
              ...d,
              ptrX: d.ptrX + dx,
              ptrY: d.ptrY + dy,
              items: d.items.map((it) => ({ ...it, x: it.x + dx, y: it.y + dy })),
            });
          } else if (d) {
            // Порог ещё не пройден: нода стоит на месте, поэтому едут ТОЧКА ЗАХВАТА и начало
            // жеста — иначе прокрутка под зажатой рукой сама начинала бы перетаскивание.
            commitDrag({
              ...d,
              fromX: d.fromX + dx,
              fromY: d.fromY + dy,
              items: d.items.map((it) => ({ ...it, offX: it.offX + dx, offY: it.offY + dy })),
            });
          }
          if (m) {
            // Якорь рамки — точка МИРА и остаётся на месте (ровно как при автопане); за рукой
            // едет только живой угол.
            m.x1 += dx;
            m.y1 += dy;
            applyMarquee();
          }
        }
      }
      // Рамку перерисовывает ЛЮБАЯ смена вида, даже с нулевой мировой дельтой: зум у курсора
      // держит точку под рукой, но экранное положение якоря меняет.
      if (m) paintMarquee();
    },
    [commitDrag, applyMarquee, paintMarquee],
  );

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
      // ВТОРАЯ ВЕСТЬ — КОГДА МИР ВСТАЛ. `applyView` кричит в момент ЗАПИСИ трансформа, а под
      // переходом запись — это только начало движения: замер, снятый тогда, читает ещё СТАРУЮ
      // геометрию, и вписывание клавишей «f» оставило бы полосу с решением от прошлого кадра.
      notifyWorldMoved();
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
      const prev = viewRef.current;
      viewRef.current = fitView(
        contentRef.current,
        { w: r.width, h: r.height },
        // ПОЛ ЧИТАЕМОСТИ — только на ОТКРЫТИИ. Ручной «fit» просили явно: он обязан показать всё,
        // каким бы мелким оно ни вышло, иначе кнопка врёт своей подписью.
        open ? { floor: OPEN_FLOOR, anchorTopLeft: true } : undefined,
      );
      fitted.current = true;
      applyView();
      // «f» с клавиатуры может прилететь и посреди живого жеста — жест обязан уехать вместе с миром.
      syncGestureToView(prev);
      return true;
    },
    [animateOnce, applyView, syncGestureToView],
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
      // Жест жив — мир не имеет права уехать из-под руки. Откладываем до отпускания. Маркиза
      // здесь наравне с драгом и паном (спека Ф3 называет её поимённо): пере-вписывание посреди
      // рамки — тот же незваный автопан, только рывком.
      if (dragRef.current || panRef.current || marqueeRef.current) {
        pendingRefit.current = true;
        return;
      }
      runFit(true, lastFitOpen.current);
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [runFit]);

  /**
   * Отложенное пере-вписывание, накопленное ЖИВЫМ ЖЕСТОМ, — по его окончании.
   *
   * ОДНА функция на все концы жеста: панораму рукой, драг ноды и драг из полки. Ресайз вьюпорта
   * посреди перетаскивания (сплиттер, свёртка панели) мир из-под руки уводить не имеет права,
   * поэтому он ждёт здесь; забыть его на одном из трёх концов — оставить экран не вписанным ровно
   * после того жеста, который панель и подвинул.
   */
  const settleRefit = useCallback(() => {
    if (!pendingRefit.current) return;
    // ДРУГОЙ жест ещё жив (второй указатель, чужая половина внешнего драга) — долг остаётся
    // висеть до ЕГО конца: пере-вписаться из-под живой руки нельзя ни на одном из концов.
    if (dragRef.current || panRef.current || marqueeRef.current) return;
    pendingRefit.current = false;
    if (fitted.current) runFit(true, lastFitOpen.current);
  }, [runFit]);

  // МИР МОНТИРУЕТСЯ ЗАНОВО на переходе «пусто → первый узел» — и монтируется БЕЗ ТРАНСФОРМА:
  // `applyView` пишет стиль императивно, а на пустом полотне писать было некуда, так что записи
  // просто не случилось. Без этого эффекта первый шаг пустой карточки рисуется в мире 1:1, тогда
  // как `viewRef` продолжает жить видом, вписанным на маунте, — маркиза, дроп и первое же колесо
  // бьют мимо на разницу двух систем, а колесо ещё и дёргает мир скачком, применяя накопленное.
  // Вид, оставшийся вписанным, честно пере-вписывается под НАСТОЯЩИЙ контент (вписывание на маунте
  // считалось по умолчальному 400×300); тронутый рукой — просто применяется к новому миру.
  const wasEmpty = useRef(empty);
  useLayoutEffect(() => {
    if (wasEmpty.current === empty) return;
    wasEmpty.current = empty;
    if (empty) return;
    paintSheet(true);
    if (fitted.current) runFit(false, lastFitOpen.current);
    else applyView();
  }, [empty, paintSheet, runFit, applyView]);

  // --- координаты и общий хвост дропа -----------------------------------------------------------
  //
  // Обе функции стоят ЗДЕСЬ, выше и жестов, и императивной ручки, ровно потому, что зовут их ОБЕ
  // стороны: и жест ноды, начатый на полотне, и жест плитки, начатый в полке. Разведи их по местам
  // употребления — и вторая сторона неминуемо заведёт свою копию.

  /** Точка события в координатах МИРА. Ровно та формула, что в пробе. */
  const toWorldPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const vp = viewportRef.current;
    if (!vp) return null;
    return toWorld(e.clientX, e.clientY, vp.getBoundingClientRect(), viewRef.current);
  }, []);

  /**
   * Точка окна лежит В СЦЕНЕ.
   *
   * Нужна только внешнему жесту: у драга ноды указатель со сцены выходит редко и осмысленно (нода
   * едет к кромке, работает автопан), а деталь из полки половину пути несут НАД полкой и хромом, и
   * там ни бросать, ни автопанорамировать нечего.
   */
  const overStage = useCallback((clientX: number, clientY: number): boolean => {
    const vp = viewportRef.current;
    if (!vp) return false;
    const r = vp.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }, []);

  /**
   * ХВОСТ ДРОПА — ОДИН НА ВСЕ ЖЕСТЫ ПОЛОТНА.
   *
   * Сюда приходит и отпускание ноды, и отпускание плитки, притащенной из полки: начала у них
   * разные (одно ловится оконным слушателем ниже, второе приезжает ручкой `dropExternalDrag`), а
   * конец обязан быть общим. Второй хвост означал бы вторую матрицу трансформа, второй hit-тест и
   * второй порядок «переместить → вердикт → диалог» — и разошлись бы они не в диффе, а на карточке.
   */
  const finishDrop = useCallback(
    (d: DragState) => {
      if (!d.started) return;
      justDragged.current = true;
      const landed: PosOverrides = {};
      for (const it of d.items) landed[it.key] = { x: Math.max(0, it.x), y: Math.max(0, it.y) };
      // ПОРЯДОК ХВОСТА — ТОТ ЖЕ, ЧТО У ИНЛАЙНА, и он не про удобство: перемещение состоялось в
      // любом случае (жест композитен, и «перенёс» не отменяется тем, что «соединить» потом
      // отклонили), поэтому `onMove` идёт ПЕРВЫМ и до гейта заморозки — раскладывать чужую
      // выпущенную карточку разрешено (R10). Соединять — нет. Съеденная деталь здесь тоже
      // легитимна: она нода раскладки (стопка у своего бокса), и переносить её — раскладка.
      onMove(d.items.map((it) => ({ key: it.key, at: landed[it.key] })));
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
    },
    [auto, positions, res, steps, frozen, onMove, onCreate, showMessage],
  );

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
      const prev = viewRef.current;
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
      // ПАНОРАМУ РУКОЙ КОЛЕСО ПЕРЕБАЗИРУЕТ: её move-обработчик пишет `база + (client − from)`
      // абсолютно, и без новой базы следующий же кадр руки молча перетёр бы сдвиг колеса.
      const pn = panRef.current;
      if (pn) {
        pn.panX = viewRef.current.pan.x;
        pn.panY = viewRef.current.pan.y;
        pn.fromX = e.clientX;
        pn.fromY = e.clientY;
      }
      applyView();
      // Колесо посреди драга или маркизы — жест едет вместе с миром (вторая половина автопана).
      syncGestureToView(prev);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [applyView, syncGestureToView]);

  // --- инструмент и панорама рукой --------------------------------------------------------------

  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const hand = tool === 'hand' || spaceHeld;
  const handRef = useRef(hand);
  handRef.current = hand;
  const panRef = useRef<{
    pointerId: number;
    fromX: number;
    fromY: number;
    panX: number;
    panY: number;
    /** Бит кнопки, ВЕДУЩЕЙ жест (1 — левая в ладони, 4 — средняя): pointerup чужой кнопки того же
     *  указателя (chord на мыши) пан не кончает — кончает отпускание своей. */
    bit: number;
    /** Рука реально возила полотно (порог тот же, что у драга). Ладонь-пан, НАЧАТЫЙ на ноде,
     *  кончается ещё и `click` по ней — preventDefault на pointerdown его не гасит (замерено), —
     *  и без этого флага каждый такой пан заодно переключал бы выбор ноды. */
    moved: boolean;
  } | null>(null);
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
    // Потеря видимости без blur (экран заблокировали) — keyup не придёт, ладонь не должна залипнуть.
    document.addEventListener('visibilitychange', blur);
    return () => {
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', blur);
    };
  }, [spaceHeld]);

  const startPan = (e: React.PointerEvent) => {
    // Живой жест полотна сильнее — ЛЮБОЙ из трёх: средняя кнопка, нажатая посреди маркизы,
    // иначе заводила бы второй жест на том же указателе.
    if (panRef.current || dragRef.current || marqueeRef.current) return;
    // Средняя кнопка панорамирует всегда — привычка из любого редактора схем.
    if (!(e.button === 1 || (e.button === 0 && handRef.current))) return;
    const { pan } = viewRef.current;
    panRef.current = {
      pointerId: e.pointerId,
      fromX: e.clientX,
      fromY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      bit: e.button === 1 ? 4 : 1,
      moved: false,
    };
    setPanning(true);
    fitted.current = false;
    e.preventDefault();
  };

  useEffect(() => {
    if (!panning) return;
    const end = () => {
      // Пан с реальным движением гасит своё клик-эхо: ладонь-пан, начатый на ноде, иначе кончался
      // бы ещё и переключением её выбора. Клик БЕЗ движения остаётся кликом.
      if (panRef.current?.moved) justDragged.current = true;
      panRef.current = null;
      setPanning(false);
      settleRefit();
    };
    const move = (e: PointerEvent) => {
      const p = panRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      // Отпускание, съеденное системой (pointerup так и не пришёл): первое же движение без кнопок
      // гасит жест, а не возит полотно приклеенным к пустой руке. То же самолечение, что у драга.
      if (e.buttons === 0) {
        end();
        return;
      }
      if (
        Math.abs(e.clientX - p.fromX) > DRAG_THRESHOLD ||
        Math.abs(e.clientY - p.fromY) > DRAG_THRESHOLD
      ) {
        p.moved = true;
      }
      viewRef.current = {
        zoom: viewRef.current.zoom,
        pan: { x: p.panX + (e.clientX - p.fromX), y: p.panY + (e.clientY - p.fromY) },
      };
      applyView();
    };
    const up = (e: PointerEvent) => {
      const p = panRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      // Chord: отпущена ЧУЖАЯ кнопка той же мыши, ведущая ещё зажата — жест продолжается.
      if (e.buttons & p.bit) return;
      end();
    };
    const cancel = (e: PointerEvent) => {
      const p = panRef.current;
      if (p && e.pointerId !== p.pointerId) return;
      end();
    };
    // Потеря окна И потеря видимости — оба аварийные конца (blur может и не прийти); та же пара,
    // что у драга ноды и у владельца внешнего жеста.
    const lost = () => end();
    // Esc посреди панорамы — конец жеста, а не ступень Esc-лестницы: живой жест выше всей лестницы,
    // ровно как у драга ноды и маркизы. Отматывать панораму назад нечего — она не пишет ничего.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', lost);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', lost);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [panning, applyView, settleRefit]);

  /**
   * ДОВЕСТИ НОДУ ДО ГЛАЗ МИНИМАЛЬНЫМ СДВИГОМ. Живёт локальным колбэком, а не только в ручке:
   * потребителей стало двое — find-палитра снаружи и токен-ссылка на самом боксе, — а вторая
   * копия этой арифметики означала бы, что панорама «к ноде» однажды поедет по-разному в
   * зависимости от того, кто попросил.
   */
  const revealKey = useCallback(
    (key: string) => {
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
      const prev = viewRef.current;
      const { pan, zoom } = viewRef.current;
      viewRef.current = { zoom, pan: { x: pan.x + d.x, y: pan.y + d.y } };
      applyView();
      syncGestureToView(prev);
    },
    [animateOnce, applyView, syncGestureToView],
  );

  /**
   * ПЕРЕЙТИ К УЗЛУ ПО ТОКЕНУ `▣ ИМЯ`. Ровно два действия и оба обязательны: выделить названный
   * узел и, если он за краем, довезти его панорамой. Без второго «переход» означал бы «выделено
   * где-то там», а на полотне в пять экранов это не ответ.
   *
   * ВЫДЕЛЕНИЕ ЗАМЕЩАЕТСЯ, а не пополняется: это навигация, и после неё человек смотрит на ОДИН
   * узел — тот, который назвал. Пополняй она выбор, второй клик по тому же токену снимал бы
   * выделение, то есть переход отменял бы сам себя.
   *
   * SHIFT ЗДЕСЬ НЕ ЗНАЧИТ НИЧЕГО, И ЭТО РЕШЕНО, А НЕ ЗАБЫТО. На маркизе shift пополняет выбор, и
   * соблазн отдать ему то же значение на токене велик — «перейти и добавить к выбранным». Но
   * тогда один орган снова получил бы два смысла, различаемых невидимым состоянием клавиши:
   * ровно тот перегруз, который Т10 с этого бокса и сняла. Токен — орган НАВИГАЦИИ; модификаторы
   * выбора принадлежат органам выбора (шапка, маркиза), и там shift работает как работал.
   */
  const goToNode = (key: string) => {
    onPicked([key]);
    revealKey(key);
  };

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
        const prev = viewRef.current;
        viewRef.current = zoomAt(viewRef.current, factor, r.width / 2, r.height / 2);
        applyView();
        // «+»/«−» с клавиатуры живут и посреди жеста — жест едет вместе с миром.
        syncGestureToView(prev);
      },
      zoomReset: () => {
        fitted.current = false;
        const prev = viewRef.current;
        viewRef.current = { ...viewRef.current, zoom: 1 };
        applyView();
        syncGestureToView(prev);
      },
      setSpaceHand: setSpaceHeld,
      setTool,
      nodeKeys: () => [...layoutRef.current.tileByKey.keys(), ...layoutRef.current.byKey.keys()],
      nudge: (dx, dy) => {
        const eff = layoutRef.current;
        // ОДНИМ ВЫЗОВОМ НА НАЖАТИЕ, а не по ноде: стрелка по выделению из четырёх нод — один жест,
        // и ⌘Z обязан вернуть все четыре разом.
        const moves: { key: string; at: { x: number; y: number } }[] = [];
        for (const k of pickedRef.current) {
          const n = eff.byKey.get(k) ?? eff.tileByKey.get(k);
          if (!n) continue;
          // Кламп в ноль — тот же, что у драга: за левым/верхним краем нода недостижима.
          moves.push({ key: k, at: { x: Math.max(0, n.x + dx), y: Math.max(0, n.y + dy) } });
        }
        if (moves.length) onMoveRef.current(moves);
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
        const prev = viewRef.current;
        viewRef.current = fitView(box, { w: r.width, h: r.height });
        applyView();
        syncGestureToView(prev);
      },
      reveal: revealKey,

      // --- порт внешнего жеста (драг из полки) ---------------------------------------------

      beginExternalDrag: (key, clientX, clientY) => {
        // Живой жест полотна сильнее — ЛЮБОЙ из трёх: два перетаскивания на одном состоянии не
        // живут, а маркиза (второй указатель — тач) спорила бы с внешним драгом за автопан и
        // выделение. А вот ИНСТРУМЕНТ здесь ни при чём — ладонь возит полотно указателем, НАЧАТЫМ
        // НА ПОЛОТНЕ, и отказывать из-за неё жесту, начатому в полке, значило бы гасить его молча
        // и без причины.
        if (dragRef.current || panRef.current || marqueeRef.current) return;
        const p = toWorldPoint({ clientX, clientY });
        if (!p) return;
        // Точка автопана и компенсации вида — с первого кадра жеста, но ТОЛЬКО над сценой:
        // над полкой автопану делать нечего (см. moveExternalDrag).
        lastClient.current = overStage(clientX, clientY) ? { x: clientX, y: clientY } : null;
        // Плитка встаёт ЦЕНТРОМ под курсор: точки захвата внутри ноды у этого жеста нет — в полке
        // деталь взяли за другую, меньшую картинку, и переносить оттуда угол не во что.
        const n = layoutRef.current.tileByKey.get(key) ?? layoutRef.current.byKey.get(key);
        const offX = n ? n.w / 2 : 0;
        const offY = n ? n.h / 2 : 0;
        justDragged.current = false;
        commitDrag({
          key,
          // Указатель ЧУЖОЙ: сравнивать оконным слушателям не с чем, и это ровно то, что нужно —
          // такой драг они пропускают целиком.
          pointerId: -1,
          external: true,
          items: [{ key, offX, offY, x: p.x - offX, y: p.y - offY }],
          fromX: p.x,
          fromY: p.y,
          ptrX: p.x,
          ptrY: p.y,
          // Порог владелец жеста уже прошёл — иначе он бы сюда не позвал.
          started: true,
        });
      },
      moveExternalDrag: (clientX, clientY) => {
        const d = dragRef.current;
        if (!d?.external) return false;
        const p = toWorldPoint({ clientX, clientY });
        if (!p) return false;
        const over = overStage(clientX, clientY);
        // АВТОПАН — ТОЛЬКО НАД СЦЕНОЙ, и это не мелочь: пока палец идёт над полкой, он по меркам
        // `autopanDelta` стоит за ВЕРХНЕЙ кромкой вьюпорта, и полотно уезжало бы вниз всё время,
        // пока деталь ещё несут. Пустой `lastClient` останавливает тик, не трогая его арифметику.
        lastClient.current = over ? { x: clientX, y: clientY } : null;
        commitDrag({
          ...d,
          items: d.items.map((it) => ({ ...it, x: p.x - it.offX, y: p.y - it.offY })),
          ptrX: p.x,
          ptrY: p.y,
        });
        return over;
      },
      dropExternalDrag: (clientX, clientY) => {
        const d = dragRef.current;
        if (!d?.external) return;
        commitDrag(null);
        lastClient.current = null;
        settleRefit();
        // ОТПУСТИЛИ МИМО СЦЕНЫ — ЖЕСТА НЕ БЫЛО. Над полкой, хромом и доком бросать некуда, а
        // записать позицию туда, куда не целились, хуже, чем не делать ничего.
        if (!overStage(clientX, clientY)) return;
        const p = toWorldPoint({ clientX, clientY });
        if (!p) return;
        // Позиция пересчитывается по КООРДИНАТАМ ОТПУСКАНИЯ, а не по последнему движению: между
        // ними лежит целый кадр, и на быстром жесте деталь легла бы там, где рука уже не была.
        finishDrop({
          ...d,
          items: d.items.map((it) => ({ ...it, x: p.x - it.offX, y: p.y - it.offY })),
          ptrX: p.x,
          ptrY: p.y,
        });
      },
      cancelExternalDrag: () => {
        if (!dragRef.current?.external) return;
        commitDrag(null);
        lastClient.current = null;
        settleRefit();
      },
    }),
    [
      runFit,
      applyView,
      animateOnce,
      commitDrag,
      toWorldPoint,
      overStage,
      finishDrop,
      settleRefit,
      syncGestureToView,
      revealKey,
    ],
  );

  // --- жест ноды --------------------------------------------------------------------------------

  const dragHandlers = (key: string, nodeX: number, nodeY: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      // Ладонь сильнее ноды: в режиме панорамы полотно возят целиком, и нода под курсором к жесту
      // отношения не имеет.
      if (handRef.current) return;
      // Живой жест полотна сильнее: пан или маркиза ВТОРЫМ указателем (средняя кнопка + тач)
      // иначе получали бы драг-соседа, и оба возили бы мир и ноду одним движением.
      if (dragRef.current || panRef.current || marqueeRef.current) return;
      if (e.button !== 0) return;
      const p = toWorldPoint(e);
      if (!p) return;
      // Точка автопана и компенсации вида — с первого касания: колесо может прийти раньше
      // первого pointermove.
      lastClient.current = { x: e.clientX, y: e.clientY };
      // Клик-эхо прошлого жеста снимает перехват на вьюпорте — ОДИН на все нажатия полотна.
      // Здесь эта строка стояла, пока нажатие доходило до ноды всегда; после того как полоса
      // начала гасить `pointerdown`, она перестала быть правдой и осталась бы ложным свидетелем
      // того, что вопрос закрыт.
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

  // --- маркиза: жест ------------------------------------------------------------------------------
  //
  // Состояние и живопись рамки объявлены выше вида (см. «маркиза: состояние и живопись»): их зовёт
  // каждый писатель `viewRef`. Здесь остаются начало жеста и его слушатели.

  const [marqueeOn, setMarqueeOn] = useState(false);

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
    const end = () => {
      marqueeRef.current = null;
      lastClient.current = null;
      setMarqueeOn(false);
      paintMarquee();
      // Ресайз, отложенный живой рамкой (спека Ф3: re-fit ждёт конца жеста), — по её концу.
      settleRefit();
    };
    const move = (e: PointerEvent) => {
      const m = marqueeRef.current;
      if (!m || e.pointerId !== m.pointerId) return;
      // Отпускание, съеденное системой: движение без кнопок гасит рамку, а не тянет её за пустой
      // рукой. То же самолечение, что у драга и пана.
      if (e.buttons === 0) {
        end();
        return;
      }
      const p = toWorldPoint(e);
      if (!p) return;
      lastClient.current = { x: e.clientX, y: e.clientY };
      m.x1 = p.x;
      m.y1 = p.y;
      paintMarquee();
      applyMarquee();
    };
    const up = (e: PointerEvent) => {
      const m = marqueeRef.current;
      if (!m || e.pointerId !== m.pointerId) return;
      // Chord: отпущена другая кнопка той же мыши, рамку ведёт левая — она ещё зажата.
      if (e.buttons & 1) return;
      end();
    };
    const cancel = (e: PointerEvent) => {
      const m = marqueeRef.current;
      if (m && e.pointerId !== m.pointerId) return;
      end();
    };
    // Потеря окна И потеря видимости — оба аварийные конца, как у всех жестов полотна: blur может
    // и не прийти, а фантомная рамка продолжала бы менять выделение под рукой без кнопки.
    const lost = () => end();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', lost);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', lost);
    };
  }, [marqueeOn, toWorldPoint, paintMarquee, applyMarquee, settleRefit]);

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
  const activate = (fn?: (multi: boolean) => void, stop = false) =>
    fn
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: (e: React.MouseEvent) => {
            // ОРГАН ВНУТРИ ОРГАНА ГАСИТ ВСПЛЫТИЕ. Токен-ссылка живёт ВНУТРИ шапки, а у шапки
            // свой смысл — выделить: без этой строки один клик по токену делал бы обе вещи
            // разом, и «перейти к соседу» заодно выделяло бы того, от кого уходят.
            if (stop) e.stopPropagation();
            // МОДИФИКАТОР ЕДЕТ В ОБРАБОТЧИК, А НЕ ЧИТАЕТСЯ ИМ. Обработчики собираются здесь и
            // приходят во вьюшку готовым объектом — до них событие иначе не доходит вовсе, и
            // «⌘+клик набирает выделение» пришлось бы решать двумя разными путями на двух
            // поверхностях. Флаг считает ОДИН предикат (`picksMany`), общий с клавиатурой ниже.
            fn(picksMany(e));
          },
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
            // ⌘/⇧/Ctrl + Enter значит то же, что ⌘/⇧/Ctrl + клик: орган, слушающийся мыши и
            // глухой к клавиатуре, — это два разных органа под одной подписью.
            fn(picksMany(e));
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

  /**
   * Сторож клик-эха ПРОЗРАЧЕН ПО АРГУМЕНТАМ. Обобщение не украшение: он стоит и между `activate`
   * и обработчиком шапки (которому нужен флаг модификатора), и на голых чипах полосы, которые
   * по-прежнему `() => void`. Зафиксируй мы здесь один-единственный `(multi: boolean)`, чипы
   * получили бы лишний параметр — и первый же React-обработчик передал бы в него СОБЫТИЕ, то есть
   * объект, который в `if (multi)` истинен всегда.
   */
  const clickGuard =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      if (justDragged.current) {
        justDragged.current = false;
        return;
      }
      fn(...args);
    };

  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return;
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // ВНЕШНИЙ ЖЕСТ ВЕДЁТ ВЛАДЕЛЕЦ, и вести его вдвоём нельзя: указатель захвачен плиткой полки,
      // события всё равно всплывают сюда, и без этой строки один и тот же `pointermove` двигал бы
      // деталь дважды за кадр. Отпускание и отмену такого жеста тоже решает он — ниже те же две
      // строки по той же причине.
      if (d.external) return;
      if (e.pointerId !== d.pointerId) return;
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
      if (d?.external) return;
      if (d && e.pointerId !== d.pointerId) return;
      // Chord: отпущена другая кнопка той же мыши, ноду ведёт левая — она ещё зажата, и бросать
      // жест на её месте значило бы дропнуть ноду там, куда никто не целился.
      if (d && e.buttons & 1) return;
      commitDrag(null);
      settleRefit();
      if (!d) return;
      finishDrop(d);
    };
    const onPointerCancel = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d?.external) return;
      if (d && e.pointerId !== d.pointerId) return;
      justDragged.current = true;
      commitDrag(null);
      lastClient.current = null;
      settleRefit();
    };
    // ПОТЕРЯ ОКНА ГАСИТ И ВНЕШНИЙ ЖЕСТ. Здесь исключения нет и быть не может: `blur` владельцу
    // жеста может и не прийти, а полотно, оставшееся с фантомным драгом, продолжало бы светить
    // подсветкой цели по ноде, которую никто уже не несёт.
    const onLost = () => {
      const d = dragRef.current;
      if (!d) return;
      justDragged.current = d.started;
      commitDrag(null);
      lastClient.current = null;
      settleRefit();
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
  }, [dragActive, toWorldPoint, commitDrag, finishDrop, settleRefit]);

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
      lastClient.current = null;
      settleRefit();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drag?.started, commitDrag, settleRefit]);

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
      settleRefit();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [marqueeOn, paintMarquee, settleRefit]);

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
    // «NOTHING THAT CAN BE TAKEN» ЗДЕСЬ БОЛЬШЕ НЕ ГОВОРИТСЯ. С тех пор как рамка берёт что угодно,
    // эта фраза стала прямой ложью: ноды ВЗЯТЫ, они обведены на полотне и их видно. Не годятся они
    // только во ВХОДЫ — и ровно это надо сказать, теми же словами, которыми движок отказывает.
    if (!bits.length) {
      return `picked: ${keys.length} already in units — nothing here can be an input`;
    }
    return `picked: ${bits.join(' · ')}` + (spent ? ` · ${spent} already in units` : '');
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

  /**
   * РАМКА НОДЫ — ТРИ СОСТОЯНИЯ, ТРИ РАЗНЫХ РАМКИ. Приоритет: цель живого жеста > выделение > ховер.
   *
   * До этой правки выделение не рисовало НИЧЕГО: единственным его признаком был фон шапки
   * `bg-bgZebra` — тот же самый цвет, которым красится шапка под курсором. Замерено: контраст
   * «выделено» ↔ «под курсором» = 1.000, то есть буквально один цвет, и выделенный блок выглядел
   * как случайно задетый мышью, только хуже — у задетого хотя бы была обводка.
   *
   * ПОЧЕМУ РАМКИ РАЗНЫЕ, А НЕ РАЗНОГО ЦВЕТА. Монохром: состояние никогда не несётся одним цветом.
   * Различают толщина и штрих:
   *   ховер     1px сплошная  — самое мимолётное: курсор ушёл, и её нет;
   *   выделение 2px ПУНКТИР   — пунктиром нарисована и сама рамка маркизы, поэтому её улов носит
   *                             тот же штрих: «это то, что забрала рамка»;
   *   цель жеста 2px сплошная — утверждение о том, что произойдёт по отпусканию, и оно сильнее
   *                             всего остального; отказ — тем же весом, но `outline-error`.
   *
   * ВНУТРЬ ОБЩИХ ВЬЮШЕК НОД ЭТО НЕ УЕЗЖАЕТ: там уже стоит `ringClassName`, и второй источник
   * outline-классов дрался бы с ним за одно и то же свойство непредсказуемым порядком. Приоритет
   * живёт здесь, у родителя, потому что знание про жест — тоже здесь.
   */
  const nodeRing = (key: string) => {
    if (target?.key === key && verdict) {
      return verdict.ok
        ? 'outline outline-2 outline-offset-2 outline-textColor'
        : 'outline outline-2 outline-offset-2 outline-error';
    }
    if (picked.includes(key)) {
      return 'outline-dashed outline-2 outline-offset-2 outline-textColor';
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
      // НОВЫЙ НАЖИМ ГАСИТ СТАРОЕ ЭХО — В ФАЗЕ ПЕРЕХВАТА, И ТОЛЬКО ЗДЕСЬ.
      //
      // `justDragged` взводится концом перетаскивания и живёт до следующего нажатия: драг,
      // кончившийся не на кликабельном, обязан проглотить своё клик-эхо и не проглотить ничего
      // после. Снимался флаг в `onPointerDown` САМОЙ НОДЫ — и это перестало работать, как только
      // ховер-полоса начала гасить `pointerdown` (иначе нажатие на чип заводило перетаскивание):
      // до обработчика ноды событие больше не доходит, флаг остаётся взведённым, и `clickGuard`
      // чипа съедает ПЕРВЫЙ законный клик. Замерено: утащить ноду за подвал в пустое место,
      // навести другую, нажать «steps · N» — выделение пусто, срабатывает только второй клик.
      // (Того чипа больше нет — замер снят на нём; починка касается ЛЮБОГО чипа полосы, и
      // «+ operation» с «dissolve» держатся ею ровно так же.)
      //
      // ФАЗА ПЕРЕХВАТА РАЗВОДИТ ЭТИ ДВА СВОЙСТВА, не жертвуя ни одним: перехват идёт от корня К
      // ЦЕЛИ и завершается ЦЕЛИКОМ до всплытия, поэтому полоса гасит жест ровно как гасила, а
      // весть «рука нажала заново» приходит сюда всё равно. И приходит она от ЛЮБОГО нажатия
      // внутри полотна — по ноде, по чипу, по пустой земле, — то есть следующий орган, которому
      // понадобится погасить всплытие, ничего здесь не сломает.
      onPointerDownCapture={() => {
        justDragged.current = false;
      }}
      onPointerDown={onCanvasPointerDown}
      // Средняя кнопка на полотне — ПАН, а не браузерный автоскролл. Обычный путь гасит его сам:
      // `startPan` зовёт preventDefault на pointerdown, и совместимостный mousedown умирает вместе
      // с ним. Но у CHORD-нажатия (средняя ПОСРЕДИ живого левого жеста) pointerdown не бывает
      // вовсе — только pointermove со сменой buttons (замерено на стенде), — а mousedown браузер
      // шлёт всё равно, и его дефолт (автоскролл Chromium) остаётся не погашенным никем. Гасим
      // дефолт средней кнопки здесь, чтобы chord-клик посреди драга не заводил автоскролл поверх
      // живого жеста.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
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
            const addPrefill = unitAddPrefill(b, res);
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
                isPicked={picked.includes(box.key)}
                openStep={openStep}
                frozen={frozen}
                hovered={hovered === box.key}
                dragging={!!heldNow?.has(box.key)}
                ringClassName={nodeRing(box.key)}
                dragProps={dragHandlers(box.key, box.x, box.y)}
                hoverProps={hoverHandlers(box.key)}
                // ШАПКА ПОКАЗЫВАЕТ ОПЕРАЦИИ ЭТОГО УЗЛА — одну самой ею, несколько списком в
                // доке. Решение считает `unitHeadOpen`, ОДИН на обе поверхности: вьюшка бокса
                // общая, и разведи мы решение — полотно с инлайном разошлись бы молча.
                // Выделение при этом не теряется: `openUnitDock` сам переводит его на узел, а
                // набирает выделение маркиза.
                headProps={activate(clickGuard(unitHeadOpen(b, toggle, onPickStep, onOpenUnit)))}
                stepProps={(i) => activate(clickGuard(() => onPickStep(i)))}
                tokenProps={(k) => activate(clickGuard(() => goToNode(k)), true)}
                surfaceWords='on the canvas'
                // ЧИП КЛАДЁТ ШАГ ВНУТРЬ БЛОКА, а не в низ листа: позицию и обещание попадания в
                // узел считает `unitAddPrefill` — та же арифметика, что у хвостовой точки вставки
                // мини-рельса. Вернула `null` — вставлять некуда, и чипа не будет вовсе.
                onAddOperation={addPrefill ? clickGuard(() => onCreate(addPrefill)) : undefined}
                onDissolveUnit={clickGuard(() => onDissolve(b.producedAt))}
              />
            );
          })}

          {layout.tail && (
            <TailBoxView
              tail={layout.tail}
              // СТРОКИ БЕРУТСЯ У РАСКЛАДКИ, а не у хвостового псевдоблока: она одна знает,
              // какие обработки уехали на плитки своих деталей, и высоту коробки отмерила
              // ровно по этому списку.
              tailSteps={layout.tailSteps}
              tailSmv={tailSmv}
              labelOf={labelOf}
              openStep={openStep}
              dragging={!!heldNow?.has('')}
              ringClassName={nodeRing('')}
              dragProps={dragHandlers('', layout.tail.x, layout.tail.y)}
              hoverProps={hoverHandlers('')}
              stepProps={(i) => activate(clickGuard(() => onPickStep(i)))}
            />
          )}

          {layout.tiles.map((t) => {
            // ПОЗИЦИЯ ШАГА НА ПЛИТКЕ СЧИТАЕТСЯ ПО РАСКЛАДКЕ — «сразу за ближайшим блоком», и
            // раскладка сюда идёт ЭФФЕКТИВНАЯ, с ручными позициями: догадка обязана считать по
            // тому, что человек видит, а не по автоматической расстановке под ней.
            const addPrefill = pieceAddPrefill(t.key, steps, res, blocks, layout);
            return (
              <TileView
                key={`tile:${t.key}`}
                tile={t}
                name={pieceNameOf(t.key)}
                pieceShapes={pieceShapes}
                cloth={cloth}
                labelOf={labelOf}
                openStep={openStep}
                picked={picked.includes(t.key)}
                frozen={frozen}
                hovered={hovered === t.key}
                dragging={!!heldNow?.has(t.key)}
                ringClassName={nodeRing(t.key)}
                surfaceWords='on the canvas'
                // ГОЛОВА ПЛИТКИ ВЫДЕЛЯЕТ ВСЕГДА — свободная, съеденная, на выпущенной карточке.
                // Раньше здесь стояла та же развилка, что снята с шапки бокса: свободная
                // выделяет, съеденная уводит к съевшему шагу, под `frozen` свободная мертва.
                // Один орган, три смысла, и смысл зависел от невидимого на глаз состояния;
                // «уйти к съевшему» переехало на чип полосы, где у него своё место.
                organProps={activate(clickGuard(() => toggle(t.key)))}
                dragProps={dragHandlers(t.key, t.x, t.y)}
                hoverProps={hoverHandlers(t.key)}
                // Строка обработки открывает шаг РОВНО ТЕМ ЖЕ органом, что строка блока: второго
                // способа открыть шаг в системе заводить нельзя.
                stepProps={(i) => activate(clickGuard(() => onPickStep(i)))}
                onAddOperation={addPrefill ? clickGuard(() => onCreate(addPrefill)) : undefined}
                // ТОТ ЖЕ `goToNode`, ЧТО У ТОКЕНА: «перейти к узлу» — одно действие, и второго
                // его исполнителя в системе быть не должно.
                onGoToUnit={
                  t.state === 'eaten' && t.into ? clickGuard(() => goToNode(t.into)) : undefined
                }
              />
            );
          })}
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
                const prev = viewRef.current;
                viewRef.current = zoomAt(viewRef.current, 1 / ZOOM_STEP, r.width / 2, r.height / 2);
                applyView();
                // Кнопка HUD достижима вторым указателем (тач) посреди живого жеста — жест едет
                // вместе с миром, как и у клавиш.
                syncGestureToView(prev);
              }}
              disabled={zoomPct <= ZOOM_MIN * 100}
              title='zoom out (−)'
            >
              −
            </HudButton>
            <HudButton
              onClick={() => {
                fitted.current = false;
                const prev = viewRef.current;
                viewRef.current = { ...viewRef.current, zoom: 1 };
                applyView();
                syncGestureToView(prev);
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
                const prev = viewRef.current;
                viewRef.current = zoomAt(viewRef.current, ZOOM_STEP, r.width / 2, r.height / 2);
                applyView();
                syncGestureToView(prev);
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
            {/* ЧИПЫ СЧИТАЮТ И БЕРУТ `pickedFree`, А НЕ ВЕСЬ ВЫБОР. С тех пор как рамка берёт что
                угодно, в выделении законно лежат съеденные ноды — входами они не годятся (правило 2
                движка), и передать их в диалог значило бы собрать форму, которую сервер отвергнет.
                Число на чипе поэтому равно тому, что он ДЕЙСТВИТЕЛЬНО возьмёт, а про разницу
                говорит предложение слева: «N already in units». Когда брать нечего, чипа нет
                вовсе — по той же причине, что и на выпущенной карточке: кнопка, которая молча
                выбросит заполненную форму, хуже отсутствующей кнопки. */}
            {!frozen && pickedFree.length >= 2 && (
              <Chip
                onClick={() => {
                  onCreate({ inputKeys: pickedFree, intent: 'unit' });
                  onPicked([]);
                }}
                title='assemble a new unit from the selection (u)'
              >
                join · {pickedFree.length}
              </Chip>
            )}
            {!frozen && pickedFree.length > 0 && (
              <Chip
                dashed
                onClick={() => {
                  onCreate({ inputKeys: pickedFree, intent: 'process' });
                  onPicked([]);
                }}
                title='a step on the selection that assembles nothing (o)'
              >
                processing · {pickedFree.length}
              </Chip>
            )}
            {/* РАСТВОРИТЬ — гейт тот же, что у клавиши `d` и у кнопки в боксе: ровно один узел, и
                он НА СТОЛЕ. Проверка стола здесь не украшение: выделение больше не ограничено
                фронтиром, и без неё чип предлагал бы растворить уже съеденный узел — ровно то, что
                клавиша `d` отказывается делать словами. */}
            {!frozen && pickedFree.length === 1 && res.units.has(pickedFree[0]) && (
              <Chip
                dashed
                onClick={() => {
                  const b = blocks.find((x) => x.key === pickedFree[0]);
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
