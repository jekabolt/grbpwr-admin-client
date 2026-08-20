import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyResult, AssemblyStep } from './assembly-frontier';
import { assemblyLayout } from './assembly-layout';
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
import { renamePicked, type UnitRenameNotice } from './assembly-rename';
import { revealDelta } from './canvas-view';
import { clothRollup, type PieceCloth, type PieceClothState } from './piece-cloth';
import type { PieceShapeMap } from './use-piece-shapes';

// Схема сборки: карта чёрных ящиков.
//
// ЭТО ПОЛНОЦЕННЫЙ РЕДАКТОР, а не витрина: собрать весь порядок сборки можно не уходя отсюда.
// Выбрал детали на столе → «сшить» → узел родился; добавил обработку внутрь блока; растворил
// узел; открыл шаг и правишь параметры.
//
// Первая редакция плана оставляла схеме только выбор и навигацию, опасаясь, что два экрана
// начнут спорить о том, где «настоящая» операция. Опасение верное, но лечится оно не запретом:
// источник истины и так ОДИН — состояние формы. Расходятся не виды, а ЛОГИКА МУТАЦИЙ, если её
// написать дважды. Поэтому схема не содержит ни одного собственного мутатора: `appendStep` и
// `dissolveUnit` живут в OperationsField в одном экземпляре, и список зовёт ровно их же. Схема
// собирает ЖЕСТ и передаёт его наверх; всё, что пишет в форму, — там.
//
// ПРОВОД ИДЁТ К СТРОКЕ-ПОТРЕБИТЕЛЮ, А НЕ К БОКСУ. Разница существенная: узел SHELL входит в
// GARMENT не «вообще», а на конкретном шаге, и провод, упирающийся в верх бокса, скрывает
// именно то, ради чего схему смотрят — где эта подсборка пришивается.
//
// РУЧНЫЕ ПОЗИЦИИ — ПРЕЗЕНТАЦИЯ, А НЕ ДАННЫЕ. Они идут мимо формы (см. `use-schematic-prefs`), и
// именно поэтому перетаскивание разрешено даже на выпущенной карточке: читатель раскладывает
// чужую схему под себя, ничего в ней не меняя. Расплата за свободу — ось времени: авто-раскладка
// ставила колонки по глубине, рука может поставить как угодно. Поэтому при живых оверрайдах
// экран честно говорит «раскладка: ручная», а провода рисуются ИЗ ДАННЫХ и никогда из позиций.

/** Порог, разводящий клик и перетаскивание. Ниже него жест остаётся кликом. */
const DRAG_THRESHOLD = 4;
/** Полоса у края контейнера, в которой драг подкручивает прокрутку. */
const AUTOSCROLL_EDGE = 32;
/** Постоянная скорость автоскролла: ускорение под неподвижным курсором дезориентирует. */
const AUTOSCROLL_SPEED = 12;

type DragState = {
  key: string;
  /** Указатель, начавший жест. Чужие события игнорируются: второй палец — не продолжение первого. */
  pointerId: number;
  /** Где внутри ноды её взяли — чтобы нода не прыгала под курсор углом. */
  offX: number;
  offY: number;
  /** Текущая позиция ноды в координатах полотна. */
  x: number;
  y: number;
  /** Точка начала жеста — для порога. */
  fromX: number;
  fromY: number;
  /** Где сейчас указатель, в координатах полотна: по нему ищется цель под курсором. */
  ptrX: number;
  ptrY: number;
  started: boolean;
};

export function AssemblySchematic({
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
  onResetPositions,
  renamedUnit,
  frozen = false,
}: {
  blocks: AssemblyBlock[];
  steps: AssemblyStep[];
  res: AssemblyResult;
  /** Короткая подпись шага для строки бокса. */
  labelOf: (index: number) => string;
  pieceNameOf: (lineKey: string) => string;
  onPickStep: (index: number) => void;
  /**
   * Открыть создание операции по собранному жесту. Схема НЕ пишет в форму сама: она собирает
   * намерение, пишет `appendStep` в OperationsField — единственный экземпляр логики записи.
   */
  onCreate: (prefill: CreatePrefill) => void;
  /** Растворить узел — по индексу его производящего шага. */
  onDissolve: (stepIndex: number) => void;
  /**
   * Контуры деталей из чертежа. Схема — экран, на котором сборку и размечают, поэтому деталь
   * здесь обязана выглядеть деталью, а не строкой текста: полочку от подборта на глаз отличают
   * по форме, а не по имени.
   */
  pieceShapes: PieceShapeMap;
  /**
   * Из какой ткани кроится каждая деталь — ПЕРВОГО колорвея карточки. Ключ карты — СЫРОЙ lineKey
   * детали, тот же, которым ключуются ноды полотна; контуры чертежа рядом ключуются
   * `pieceRefKey(lineKey)`, и это ДРУГОЕ пространство ключей. Перепутать их — получить пустую
   * штриховку при живом рецепте, ничего не сломав на глаз.
   *
   * Схема ткань только ПОКАЗЫВАЕТ: карту считает вкладка, потому что источников у неё два (слоты
   * из формы, рецепт с чтения) и ни один из них схеме не виден.
   */
  cloth?: Map<string, PieceCloth> | null;
  /** Σ SMV блока по ключу ('' — хвостовой). Считает досье, схема только показывает. */
  smvOfBlock: Map<string, string>;
  /** Ручные позиции нод. Живут выше схемы: схема размонтируется при смене режима. */
  positions: PosOverrides;
  onMove: (key: string, at: { x: number; y: number }) => void;
  onResetPositions: () => void;
  /**
   * Последнее состоявшееся переименование узла — весть от мутатора, живущего в поле операций.
   * Новый объект на каждый жест, включая ⌘Z: тождеством и распознаётся «весть новая».
   */
  renamedUnit: UnitRenameNotice | null;
  /** Карточка выпущена: схема остаётся читаемой и раскладываемой, но не редактируемой. */
  frozen?: boolean;
}) {
  // Выбор — то, из чего собирается следующий узел. Живёт в схеме, потому что это состояние
  // ЖЕСТА, а не данных: уход с экрана его обнуляет, и правильно.
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (key: string) =>
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const onTable = new Set(res.frontier);
  // Живые УЗЛЫ фронтира (детали на столе — не узлы). Ровно та величина, которой рельс решает,
  // сошёлся ли граф: правило выпуска требует РОВНО ОДИН терминал.
  const liveUnits = res.frontier.filter((k) => res.units.has(k));

  /**
   * ЧАСТЬ ВЫДЕЛЕНИЯ, ГОДНАЯ ВО ВХОДЫ — ровно то же, что `pickedFree` на полотне фулскрина, и
   * заведено ровно по той же причине. Выделять можно что угодно, а собирать — только со стола:
   * съеденная нода входом не годится, это правило 2 движка. Пока шапка съеденного узла выбором не
   * была, огранка не требовалась; теперь она обязательна, иначе «сшить» уехало бы в диалог с
   * входом, который сервер отвергнет.
   */
  const pickedFree = picked.filter((k) => onTable.has(k));

  // ВЫБОР ЖИВЁТ ДО ТЕХ ПОР, ПОКА ЖИВЫ ЕГО КЛЮЧИ. Деталь, попавшая в узел соседним жестом, входом
  // больше не годится, а чип «выбрано: A» продолжал бы предлагать её — и «обработка · 1» родила бы
  // шаг со съеденным входом, то есть ровно ту невалидность, ради устранения которой затевался
  // диалог.
  //
  // ФРОНТИР-ФИЛЬТРА ЗДЕСЬ БОЛЬШЕ НЕТ, и это не разнобой с полотном, а догонка. Он держался на
  // одном факте: клик по шапке съеденного узла НЕ выбирал, а уводил к съевшему шагу, — то есть
  // выбор по построению не выходил за фронтир. Шапка теперь выделяет всегда (один орган — один
  // смысл), факта не стало, и огранка переехала туда же, где живёт на полотне: в глаголы
  // (`pickedFree` ниже), а не в само выделение. Выделение — презентация (R10).
  //
  // ВЫДЕЛЕНИЕ ПЕРЕЖИВАЕТ ПЕРЕИМЕНОВАНИЕ — И ПРАВИТ ВЫБОР РОВНО ОДИН ЭФФЕКТ. Чистка судит по
  // раскладке, а переименованный узел выглядит для неё исчезнувшим, хотя не делся никуда: просто
  // называется иначе. Значит перенос обязан случиться РАНЬШЕ чистки — но «раньше» здесь не порядок
  // объявления двух эффектов, а порядок двух строк ВНУТРИ одного апдейтера.
  //
  // ПОЧЕМУ НЕ ДВА ЭФФЕКТА. Два работают, пока стоят в правильном порядке, и умирают молча от любой
  // перестановки, раннего `return` или условного объявления — замерено: эффекты, поменянные
  // местами, роняют выделение, а пробе видно только текст исходника, то есть ГРЕП. Порядок,
  // который нельзя нарушить, лучше порядка, который нельзя нарушать.
  //
  // ПОЧЕМУ НЕ ПЕРЕНОС В РЕНДЕРЕ, как у фулскрина: там чистка живёт в ДОЧЕРНЕМ полотне и иначе
  // нельзя, а здесь правка состояния в фазе рендера до апдейтера чистки не доезжает — тот получает
  // набор, каким он был ДО переноса (замерено стендом, выделение слетало).
  //
  // ВЕСТЬ СЪЕДАЕТСЯ РЕФОМ, а не читается из пропа: без этого чистка, сработавшая на любом
  // ПОСЛЕДУЮЩЕМ свипе, применяла бы давнее переименование заново — и выбор ноды, заведённой со
  // старым кодом после жеста, молча уезжал бы на новый.
  const seenRename = useRef(renamedUnit);
  const pendingRename = useRef<UnitRenameNotice | null>(null);
  if (renamedUnit !== seenRename.current) {
    seenRename.current = renamedUnit;
    pendingRename.current = renamedUnit;
  }

  // Объявлена ВЫШЕ чистки выбора намеренно: чистка спрашивает у раскладки, жива ли нода, и
  // порядок объявления здесь — не стиль, а условие того, что она спрашивает свежую.
  const auto = useMemo(() => assemblyLayout(blocks, steps, res), [blocks, steps, res]);

  useEffect(() => {
    setPicked((cur) => {
      const notice = pendingRename.current;
      pendingRename.current = null;
      const moved = notice ? renamePicked(cur, notice.from, notice.to) : cur;
      // ВЫБОР ЖИВЁТ, ПОКА ЖИВА САМА НОДА, а не пока она на столе — то же правило, что на полотне
      // фулскрина. Фронтир-фильтр стоял здесь, пока шапка съеденного узла НЕ выделяла; теперь
      // выделяет, и фильтр по фронтиру выбрасывал бы ровно то, что человек только что выбрал, —
      // молча и на первой же пересборке. Выбрасывать надо то, чего БОЛЬШЕ НЕТ, а множество живых
      // нод знает раскладка.
      const live = moved.filter((k) => auto.byKey.has(k) || auto.tileByKey.has(k));
      return live.length === moved.length ? moved : live;
    });
  }, [auto, res, renamedUnit]);

  const showMessage = useSnackBarStore((st) => st.showMessage);
  /** Человеческое имя ноды: имя детали или код узла. */
  const nameOfNode = (key: string) => (res.units.has(key) ? `▣ ${key}` : pieceNameOf(key));

  /**
   * Состояние детали. Ключа в карте НЕТ = рецепт про эту деталь молчит, и это `unbound` — тот же
   * договор, что у `pieceClothMap`: «нет ответа» не имеет права превратиться в ответ по умолчанию.
   */
  const clothOf = (lineKey: string): PieceClothState => cloth?.get(lineKey)?.state ?? 'unbound';

  /**
   * `N pieces · main ×3 · lining ×1` — свёртка множества деталей. Пустое множество — пусто.
   *
   * `cloth == null` — ВОПРОС НЕ ЗАДАВАЛСЯ, и свёртки тогда нет вовсе. Карты нет ровно там, где у
   * карточки нет ни одного колорвея (а у aux-карточек их не бывает никогда), и рецепт про ткань не
   * молчит — его просто не существует. Печатать в этом состоянии `no cloth ×4` значило бы выдать
   * отсутствие вопроса за отрицательный ответ и написать претензию к технологу на каждом узле
   * каждой aux-карточки навсегда. Отсутствие ключа в СУЩЕСТВУЮЩЕЙ карте — другое дело: там рецепт
   * есть и про эту деталь он действительно промолчал, и `unbound` называется словами.
   */
  const clothLine = (lineKeys: string[]): string => {
    if (lineKeys.length === 0) return '';
    const count = `${lineKeys.length} ${lineKeys.length === 1 ? 'piece' : 'pieces'}`;
    if (!cloth) return count;
    const rollup = clothRollup(lineKeys.map(clothOf));
    return rollup ? `${count} · ${rollup}` : count;
  };

  /**
   * ИЗ ЧЕГО СОБРАН УЗЕЛ — по ЛИСТЬЯМ, а не по прямым входам.
   *
   * Прямые входы узла — это его подсборки («← ▣ SHELL + 2 pieces»), и свёртка по ним отвечала бы
   * на вопрос «сколько деталей вошло НЕПОСРЕДСТВЕННО», которого никто не задаёт. Вопрос к узлу
   * звучит «из какой ткани он сшит», и отвечают на него все детали, которые в нём в итоге лежат, —
   * ровно то же множество, которым лоток называет узел «a unit of N pieces».
   */
  const unitClothLine = (key: string): string => {
    const line = clothLine(res.units.get(key)?.leaves ?? []);
    return line ? `${key} — ${line}` : '';
  };

  const [drag, setDrag] = useState<DragState | null>(null);
  // Зеркало состояния жеста для СИНХРОННОГО чтения. Слушатели window живут дольше одного рендера,
  // а решение «куда именно бросили» обязано считаться по последнему движению, а не по тому, что
  // успело отрендериться: последний рывок руки иначе теряется, и дроп попадает в прежнюю цель.
  const dragRef = useRef<DragState | null>(null);
  const commitDrag = useCallback((v: DragState | null) => {
    dragRef.current = v;
    setDrag(v);
  }, []);
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastClient = useRef<{ x: number; y: number } | null>(null);
  // Клик приходит после перетаскивания — и не должен срабатывать как выбор. Порог разводит
  // жесты по НАМЕРЕНИЮ, а этот флаг гасит уже случившееся эхо.
  const justDragged = useRef(false);
  const [resetOpen, setResetOpen] = useState(false);
  // НАВЕДЕНИЕ — состояние ЧТЕНИЯ, а не редактирования: схема из двух десятков нод и втрое
  // большего числа проводов читается только так — «покажи, что связано именно с этой». Живёт в
  // компоненте и никуда не сохраняется.
  const [hovered, setHovered] = useState<string | null>(null);

  const layout = useMemo(
    () => applyOverrides(auto, drag?.started ? { ...positions, [drag.key]: { x: drag.x, y: drag.y } } : positions),
    [auto, positions, drag],
  );

  /**
   * Точка события в координатах ПОЛОТНА, а не окна. Без учёта прокрутки контейнера нода
   * прыгала бы на величину скролла — а полотно шире окна уже на полутора десятках деталей.
   */
  const toLayoutPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const el = canvasRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop };
  }, []);

  /**
   * ЖЕСТ СЛУШАЕТСЯ НА WINDOW, А НЕ НА НОДЕ, и захват указателя не берётся вовсе.
   *
   * Первая редакция вешала move/up на саму ноду и брала `setPointerCapture` по достижении
   * порога. Два отказа отсюда следовали. Захват, если браузер его отклонил (а он вправе),
   * оставлял жест без единого слушателя за пределами ноды: указатель уходил, отпускался
   * снаружи, `pointerup` не приходил никогда — состояние жеста зависало вместе с работающим
   * rAF. И захват меняет цель последующего `click`, из-за чего обычные клики по строкам шагов
   * приходилось спасать отдельной механикой.
   *
   * Слушатели на window снимают оба: события приходят всегда, клик остаётся родным. Порог 4px
   * по-прежнему разводит клик и драг по НАМЕРЕНИЮ.
   */
  const dragHandlers = (key: string, nodeX: number, nodeY: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      // Жест уже идёт — второе касание не трогает НИЧЕГО, и проверка стоит первой строкой.
      // Стой она ниже, чужой палец успевал бы записать `lastClient`: автоскролл поехал бы по
      // координатам второго пальца, утаскивая ноду первого, который при этом неподвижен.
      if (dragRef.current) return;
      if (e.button !== 0) return;
      const p = toLayoutPoint(e);
      if (!p) return;
      lastClient.current = { x: e.clientX, y: e.clientY };
      // Новый жест — старое эхо больше не актуально. Сбрасывать флаг в clickGuard было бы
      // недостаточно: драг, закончившийся не на кликабельном, оставил бы флаг взведённым и
      // проглотил следующий честный клик.
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
   * Кликабельный элемент полотна, НЕ являющийся формой.
   *
   * Схема живёт внутри общего `<fieldset disabled={frozen}>` карточки (index.tsx), а
   * задизейбленность НАСЛЕДУЕТСЯ: любая `<button>` под таким предком не получает ни клика, ни
   * pointer-событий, и `aria-disabled` этого не отменяет. То есть на выпущенной карточке умирало
   * ровно то, что Р9 обещал оставить живым: раскладывать схему руками и ходить по её шагам.
   * Проп `frozen` был проведён честно, но душили нас раньше, чем он что-то решал.
   *
   * Поэтому интерактив полотна собран на div с ролью кнопки: клавиатура сохранена (Enter и
   * Space), а наследуемая задизейбленность до div'а не достаёт. Запреты Р9 продолжает решать
   * `frozen`, а не fieldset — явно, как и требовалось.
   */
  const activate = (fn?: () => void, stop = false) =>
    fn
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: (e: React.MouseEvent) => {
            // ОРГАН ВНУТРИ ОРГАНА ГАСИТ ВСПЛЫТИЕ. Токен-ссылка живёт ВНУТРИ шапки, а у шапки
            // свой смысл — выделить: без этой строки один клик по токену делал бы обе вещи
            // разом, и «перейти к соседу» заодно выделяло бы того, от кого уходят.
            if (stop) e.stopPropagation();
            fn();
          },
          // Клавиатура зовёт действие НАПРЯМУЮ, минуя защиту от клик-эха: эхо бывает только у
          // указателя, и общий сторож съедал бы первый Enter после отменённого жеста.
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            if (stop) e.stopPropagation();
            justDragged.current = false;
            fn();
          },
        }
      : // Без действия нет и роли: иначе скринридер объявляет кнопкой то, что ничего не делает и
        // даже не фокусируется.
        {};

  /**
   * Обработчики наведения для ноды.
   *
   * Во время начатого драга наведение НЕ ведётся: тащимая нода едет под курсором и подсвечивала
   * бы саму себя постоянно, а цель жеста показывает своя рамка вердикта — две подсветки об одном
   * месте спорили бы между собой.
   */
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

  /**
   * ПЕРЕЙТИ К УЗЛУ ПО ТОКЕНУ `▣ ИМЯ`: выделить названный и, если он за краем, довезти прокруткой.
   *
   * ВЫДЕЛЕНИЕ ЗАМЕЩАЕТСЯ, а не пополняется: это навигация, и после неё человек смотрит на ОДИН
   * узел — тот, который назвал. Пополняй она выбор, второй клик по тому же токену снимал бы
   * выделение, то есть переход отменял бы сам себя.
   *
   * ДОВОДКА СЧИТАЕТСЯ ТОЙ ЖЕ `revealDelta`, ЧТО У ПОЛОТНА, хотя двигает прокрутку, а не трансформ:
   * инлайн — это `overflow: auto` без зума, то есть тот же вид при `zoom = 1` и `pan = −scroll`.
   * Вторая формула здесь означала бы, что «довезти до ноды» однажды поедет на двух поверхностях
   * по-разному, а разъезд этот молчаливый.
   */
  const goToNode = (key: string) => {
    setPicked([key]);
    const el = canvasRef.current;
    const n = layout.byKey.get(key) ?? layout.tileByKey.get(key);
    if (!el || !n) return;
    const d = revealDelta(
      { x: n.x, y: n.y, w: n.w, h: n.h },
      { w: el.clientWidth, h: el.clientHeight },
      { zoom: 1, pan: { x: -el.scrollLeft, y: -el.scrollTop } },
    );
    if (!d.x && !d.y) return; // уже видно — прокручивать не за чем
    el.scrollTo({
      left: el.scrollLeft - d.x,
      top: el.scrollTop - d.y,
      // Движение под запретом — значит его нет: то же правило, что у панорамы полотна.
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  // Жизнь жеста целиком: движение, отпускание, срыв. Подписка держится, пока жест жив.
  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return;
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      // Кнопку отпустили там, где о нас не сообщили (потеря фокуса окна, дроп за его пределами) —
      // о жесте узнаём по первому же движению без нажатых кнопок и сворачиваем его.
      if (e.buttons === 0) {
        justDragged.current = d.started;
        commitDrag(null);
        return;
      }
      const p = toLayoutPoint(e);
      if (!p) return;
      lastClient.current = { x: e.clientX, y: e.clientY };
      const far = Math.abs(p.x - d.fromX) > DRAG_THRESHOLD || Math.abs(p.y - d.fromY) > DRAG_THRESHOLD;
      if (!d.started && !far) return;
      commitDrag({ ...d, started: true, x: p.x - d.offX, y: p.y - d.offY, ptrX: p.x, ptrY: p.y });
    };
    const onPointerUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d && e.pointerId !== d.pointerId) return;
      commitDrag(null);
      if (!d?.started) return;
      justDragged.current = true;
      const at = { x: Math.max(0, d.x), y: Math.max(0, d.y) };
      // Перемещение состоялось в любом случае: жест композитен, и «перенёс» не отменяется тем,
      // что «соединить» потом отклонили. Позиция остаётся там, где ноду бросили.
      onMove(d.key, at);
      if (frozen) return;
      // ПРИЦЕЛ СЧИТАЕТСЯ ЗДЕСЬ И СЕЙЧАС, из последнего состояния жеста и свежего `res`: цель,
      // посчитанная в рендере, отстаёт на одно движение, а форму мог изменить кто-то ещё, пока
      // жест длился.
      const eff = applyOverrides(auto, { ...positions, [d.key]: at });
      const hit = hitNode(eff, d.ptrX, d.ptrY, d.key);
      const v = hit ? combineVerdict(d.key, hit.key, res, steps) : null;
      if (v && !v.ok) {
        // Отказ ДО диалога: открывать форму, которую нельзя отправить, — предлагать заведомый
        // отказ. Причина словами движка.
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
      // Система забрала указатель — намерение подтверждено не было. Но клик-эхо погасить надо:
      // отпускание над нодой иначе сработает выбором, которого никто не просил.
      justDragged.current = true;
      commitDrag(null);
    };
    // Окно потеряло фокус или вкладку спрятали — поток событий указателя обрывается молча, и
    // без этого жест висел бы с работающим rAF до Escape или следующего касания.
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
  }, [dragActive, auto, positions, res, steps, frozen, onMove, onCreate, showMessage, toLayoutPoint, commitDrag]);

  // Escape во время драга — тот же откат: жест отменён, нода возвращается на прежнее место.
  useEffect(() => {
    if (!drag?.started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Отменённый жест не должен догнать пользователя кликом: указатель ещё зажат, и отпускание
      // родит click по ноде — то есть прыжок к шагу, которого никто не просил.
      justDragged.current = true;
      commitDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag?.started]);

  // Автоскролл у края: без него ноду нельзя увести за пределы видимой части полотна — а полотно
  // больше окна на любой настоящей карточке.
  useEffect(() => {
    if (!drag?.started) return;
    let raf = 0;
    const tick = () => {
      const el = canvasRef.current;
      const c = lastClient.current;
      if (el && c) {
        const r = el.getBoundingClientRect();
        let dx = 0;
        let dy = 0;
        if (c.x < r.left + AUTOSCROLL_EDGE) dx = -AUTOSCROLL_SPEED;
        else if (c.x > r.right - AUTOSCROLL_EDGE) dx = AUTOSCROLL_SPEED;
        if (c.y < r.top + AUTOSCROLL_EDGE) dy = -AUTOSCROLL_SPEED;
        else if (c.y > r.bottom - AUTOSCROLL_EDGE) dy = AUTOSCROLL_SPEED;
        if (dx || dy) {
          const wasL = el.scrollLeft;
          const wasT = el.scrollTop;
          el.scrollLeft += dx;
          el.scrollTop += dy;
          const movedX = el.scrollLeft - wasL;
          const movedY = el.scrollTop - wasT;
          // Курсор стоит на месте, полотно уехало — значит и нода, и ТОЧКА ПРИЦЕЛА сместились на
          // ту же величину. Без второй половины автоскролл довозил ноду до цели, а hit-test
          // продолжал бить в исходную точку: дроп на подъехавшую цель молча становился
          // перемещением.
          if (movedX || movedY) {
            const d = dragRef.current;
            if (d) {
              commitDrag({
                ...d,
                x: d.x + movedX,
                y: d.y + movedY,
                ptrX: d.ptrX + movedX,
                ptrY: d.ptrY + movedY,
              });
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag?.started]);

  // ЦЕЛЬ ЖЕСТА — СТРОГО ТО, ЧТО ПОД КУРСОРОМ, а не то, с чем пересеклась тащимая нода: пересечение
  // фигур зависит от их размеров, точка — нет, и рука предсказуемо попадает туда, куда целится.
  const target = drag?.started ? hitNode(layout, drag.ptrX, drag.ptrY, drag.key) : null;
  // Вердикт считается от СЕГОДНЯШНЕГО res, а не от того, что был на pointerdown: форма могла
  // измениться другой рукой, пока жест длился.
  const verdict = target && !frozen ? combineVerdict(drag!.key, target.key, res, steps) : null;
  const hint = (() => {
    if (!verdict) return '';
    if (!verdict.ok) return verdict.reason;
    if (verdict.absorbInto) return `release: add to ▣ ${verdict.absorbInto}`;
    return `release: join ${nameOfNode(drag!.key)} + ${nameOfNode(target!.key)}`;
  })();

  /**
   * Рамка ноды — ЗЕРКАЛО ПОЛОТНА ФУЛСКРИНА (`assembly-canvas.tsx`, `nodeRing`): цель живого жеста >
   * выделение > наведение. Все три рисуются outline'ом, и складывать их нельзя — у цели под
   * курсором вышла бы каша из двух рамок, поэтому ветки взаимоисключающие.
   *
   * Выделение до этой правки не рисовало НИЧЕГО: единственным признаком был фон шапки `bg-bgZebra`,
   * то есть тот же цвет, которым красится шапка под курсором (замерено: контраст 1.000). Различают
   * теперь толщина и штрих, а не цвет — монохром: 1px сплошная у ховера, 2px пунктир у выделения
   * (тем же штрихом нарисована рамка маркизы на полотне — это её улов), 2px сплошная у цели жеста.
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

  const manual = Object.keys(positions).length;

  if (layout.tiles.length === 0 && layout.boxes.length === 0 && !layout.tail) {
    // ЧЕСТНОЕ ПУСТОЕ СОСТОЯНИЕ, а не пустое полотно — но теперь оно означает ровно одно:
    // на карточке НЕТ ДЕТАЛЕЙ. До Ф7 сюда попадала и размеченная деталями карточка без единого
    // узла, то есть экран говорил «нечего рисовать» ровно тогда, когда рисовать было что.
    return (
      <div className='flex flex-col items-center gap-1 border border-dashed border-borderColor px-3 py-8 text-center'>
        <Text size='micro' variant='label'>
          no pieces yet — the schematic has nothing to draw
        </Text>
        <Text size='micro' variant='label'>
          pieces come from the patterns; they show up here as tiles, and the assembly starts from
          them
        </Text>
      </div>
    );
  }

  // Прямые входы блока и провода считает `assembly-node-views`: это презентация нод, а не жест, и
  // фулскрин рисует их той же арифметикой. Здесь остаётся только сборка — и она сознательно стоит
  // ПОСЛЕ пустого состояния, как стояла: на карточке без деталей считать нечего.
  const directInputs = directInputsOf(blocks, steps);
  const rowY = makeRowY(blocks, layout);
  const wires = buildWires(blocks, steps, layout, rowY);

  return (
    <>
      {!frozen && (
        <ActionPanel
          picked={picked}
          // ГЛАГОЛЫ БЕРУТ ОГРАНЁННЫЙ ВЫБОР, А СВОДКА — ВЕСЬ. Съеденная нода в выделении законна
          // (выделение — презентация, R10), но входом не годится: правило 2 движка. То же
          // разделение, что у полосы выбора полотна, и заведено оно тем же жестом — шапкой,
          // которая теперь выделяет что угодно.
          free={pickedFree}
          labelOf={pieceNameOf}
          // Свёртка ТОЛЬКО по деталям выделения: узел — не деталь, ткани у него нет, и посчитать
          // его наравне с деталями значило бы соврать в знаменателе («3 pieces» при двух).
          clothLine={clothLine(picked.filter((k) => !res.units.has(k)))}
          onCreate={(intent) => {
            onCreate({ inputKeys: pickedFree, intent });
            setPicked([]);
          }}
          onClear={() => setPicked([])}
        />
      )}
      {/* Место под подсказку зарезервировано ПОСТОЯННО. Появляясь по факту наведения, строка
          сдвигала бы контейнер вниз посреди жеста — а вместе с ним и систему координат: нода
          прыгала бы на высоту строки, и у верхней кромки цели подсветка мигала бы через кадр. */}
      <div className='mb-1.5 min-h-4'>
        {drag?.started && hint && (
          <Text size='micro' variant='label' className={cn(verdict && !verdict.ok && 'text-error')}>
            {hint}
          </Text>
        )}
      </div>
      {manual > 0 && (
        <ChipRow className='mb-1.5'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            layout: manual · {manual}
          </Text>
          {/* nonForm по той же причине, что у переключателя режима: сброс раскладки не меняет
              данных, но под внешним `<fieldset disabled>` настоящая кнопка мертва — и сбросить
              чужую расстановку на выпущенной карточке было бы нечем. */}
          <Chip nonForm dashed onClick={() => setResetOpen(true)} title='restore the automatic layout'>
            auto
          </Chip>
        </ChipRow>
      )}
      <div
        ref={canvasRef}
        className='overflow-auto border border-borderColor bg-bgColor'
        style={{ maxHeight: 640 }}
      >
        <div style={{ width: layout.width, height: layout.height, position: 'relative' }}>
          {/* Инлайн держит СТАБИЛЬНЫЙ id маркера: пока вид один, дубликата в документе нет, а
              снимок разметки (golden пробы вьюшек) канонизирует только токены `useId` — id на
              инстанс здесь ломал бы гейт на шуме. Уникальный заводит фулскрин: два смонтированных
              полотна — как раз тот случай, ради которого id стал пропом. */}
          <WireLayer
            wires={wires}
            hovered={hovered}
            width={layout.width}
            height={layout.height}
            markerId='assembly-arrow'
          />

          {layout.boxes.map((box) => {
            const b = blocks.find((x) => x.key === box.key);
            if (!b) return null;
            // «ГОТОВОЕ ИЗДЕЛИЕ» — ТОЛЬКО ЕДИНСТВЕННЫЙ ЖИВОЙ УЗЕЛ, тем же правилом, что у рельса.
            // Раньше здесь стояло «узел жив», и при двух несведённых узлах схема помечала ✓ оба,
            // пока рельс на том же графе показывал ✕ разрыв. Два ответа про одну карточку, причём
            // именно про то, выпустится она или нет: правило 4 требует РОВНО ОДИН терминал.
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
                isPicked={picked.includes(box.key)}
                frozen={frozen}
                hovered={hovered === box.key}
                dragging={drag?.key === box.key && drag.started}
                ringClassName={nodeRing(box.key)}
                dragProps={dragHandlers(box.key, box.x, box.y)}
                hoverProps={hoverHandlers(box.key)}
                // ОРГАНЫ СОБИРАЮТСЯ ЗДЕСЬ, А НЕ ВО ВЬЮШКЕ. `activate` знает про клавиатуру и про
                // то, почему это div, а `clickGuard` — про клик-эхо после драга; и то и другое —
                // механика ОДНОГО полотна, живущая в одном экземпляре. Вьюшка получает готовые
                // пропы и раскладывает их.
                // ШАПКА ВЫДЕЛЯЕТ ВСЕГДА — и съеденный узел, и на выпущенной карточке. Раньше
                // здесь стояла развилка `!frozen && onTable ? выделить : уйти к съевшему шагу`:
                // один орган значил две противоположные вещи по невидимому на глаз состоянию.
                // Вопрос «куда узел делся» никуда не делся — на него отвечает ТОКЕН в стрелке,
                // и отвечает адресно.
                headProps={activate(clickGuard(() => toggle(box.key)))}
                stepProps={(i) => activate(clickGuard(() => onPickStep(i)))}
                tokenProps={(k) => activate(clickGuard(() => goToNode(k)), true)}
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
              // СТРОКИ БЕРУТСЯ У РАСКЛАДКИ, а не у хвостового псевдоблока: она одна знает,
              // какие обработки уехали на плитки своих деталей, и высоту коробки отмерила
              // ровно по этому списку.
              tailSteps={layout.tailSteps}
              smvOfBlock={smvOfBlock}
              labelOf={labelOf}
              dragging={drag?.key === '' && drag.started}
              ringClassName={nodeRing('')}
              dragProps={dragHandlers('', layout.tail.x, layout.tail.y)}
              hoverProps={hoverHandlers('')}
              stepProps={(i) => activate(clickGuard(() => onPickStep(i)))}
            />
          )}

          {/* ВСЕ ДЕТАЛИ КАРТОЧКИ — по одной плитке на деталь, место следует из состояния: съеденная
              стоит у бокса своего узла, свободная — в колонке у левого края. Координаты приходят из
              раскладки, а не считаются здесь: раскладка проверяема пробой, разметка — нет.

              Плитки рисуются ПОСЛЕ боксов намеренно: hit-test отдаёт плитку при наложении (меньшая
              цель побеждает), и порядок отрисовки обязан этому соответствовать — иначе рука
              целилась бы в то, чего не видит. В авто-раскладке ноды не пересекаются, но ручные
              позиции пересечение разрешают.

              Плитка кликабельна в обоих состояниях: свободная берётся в сборку, съеденная уводит к
              шагу, который её съел. Роль кнопки на div, а не сама <button>: см. `activate` —
              внешний `<fieldset disabled>` карточки убил бы и клик, и перетаскивание. */}
          {layout.tiles.map((t) => (
            <TileView
              key={`tile:${t.key}`}
              tile={t}
              name={pieceNameOf(t.key)}
              pieceShapes={pieceShapes}
              cloth={cloth}
              labelOf={labelOf}
              picked={picked.includes(t.key)}
              dragging={drag?.key === t.key && drag.started}
              ringClassName={nodeRing(t.key)}
              organProps={activate(
                t.state === 'free'
                  ? !frozen
                    ? clickGuard(() => toggle(t.key))
                    : undefined
                  : // Съеденную деталь входом не взять — правило 2. Зато главный вопрос читателя о
                    // ней «куда она делась», и клик отвечает: уводит к шагу, который её съел.
                    (() => {
                      const eater = res.consumedBy.get(t.key);
                      return eater === undefined ? undefined : clickGuard(() => onPickStep(eater));
                    })(),
              )}
              dragProps={dragHandlers(t.key, t.x, t.y)}
              hoverProps={hoverHandlers(t.key)}
              // Строка обработки открывает шаг РОВНО ТЕМ ЖЕ органом, что строка блока: второго
              // способа открыть шаг в системе заводить нельзя.
              stepProps={(i) => activate(clickGuard(() => onPickStep(i)))}
            />
          ))}
        </div>
      </div>

      <ConfirmationModal
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={() => {
          onResetPositions();
          setResetOpen(false);
        }}
        title='restore the automatic layout'
        confirmLabel='reset'
        cancelLabel='keep'
        width='sm'
      >
        <Text size='micro' variant='label'>
          every manual position on this card will be forgotten, and the schematic will place the
          units by itself again. the card's data doesn't change: positions are only a way of looking.
        </Text>
      </ConfirmationModal>
    </>
  );
}

// Панель действий над полотном.
//
// ДО Ф7 ЗДЕСЬ ЛЕЖАЛИ ЧИПЫ СВОБОДНЫХ ДЕТАЛЕЙ — и это был единственный способ их выбрать. Теперь
// детали лежат на самом полотне и кликаются там, а дублировать их строкой значило бы держать две
// поверхности одного факта: разойдутся — врать будут тихо. Осталось то, чего на полотне нет:
// сводка выбора и два действия над ним.
//
// Два действия, а не одно с угадыванием: два входа бывают и у обработки, и решать за автора по
// их числу — переигрывать его выбор.
function ActionPanel({
  picked,
  free,
  labelOf,
  clothLine,
  onCreate,
  onClear,
}: {
  picked: string[];
  /**
   * Часть выделения, годная во входы. Считает вызывающий — знание про фронтир живёт там; панель
   * только не смеет предлагать действие на том, чего оно не возьмёт.
   */
  free: string[];
  labelOf: (k: string) => string;
  /**
   * Ткань выделения свёрткой. Отвечает на вопрос, который у выбранной кучи деталей встаёт раньше
   * всех прочих: сшивают вместе то, что кроят из одного, и «main ×2 · lining ×1» в строке выбора
   * ловит промах ДО того, как из него родится узел.
   */
  clothLine: string;
  onCreate: (intent: 'unit' | 'process') => void;
  onClear: () => void;
}) {
  if (picked.length === 0) return null;
  return (
    <ChipRow className='mb-1.5'>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        selected:
      </Text>
      <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
        {picked.map(labelOf).join(' + ')}
      </Text>
      {clothLine && (
        <Text size='micro' variant='label' component='span' className='shrink-0'>
          {clothLine}
        </Text>
      )}
      {/* ЧИСЛО НА ЧИПЕ РАВНО ТОМУ, ЧТО ОН ДЕЙСТВИТЕЛЬНО ВОЗЬМЁТ, а не размеру выделения: в
          выделении законно лежат съеденные ноды, и передать их в диалог значило бы собрать
          форму, которую сервер отвергнет. Брать нечего — чипа нет вовсе: кнопка, которая молча
          выбросит заполненную форму, хуже отсутствующей кнопки. */}
      {free.length >= 2 && (
        <Chip onClick={() => onCreate('unit')} title='assemble a new unit from the selection'>
          join · {free.length}
        </Chip>
      )}
      {free.length > 0 && (
        <Chip
          dashed
          onClick={() => onCreate('process')}
          title='a step on the selection that assembles nothing'
        >
          processing · {free.length}
        </Chip>
      )}
      <Chip dashed onClick={onClear} title='clear the selection'>
        cancel
      </Chip>
    </ChipRow>
  );
}
