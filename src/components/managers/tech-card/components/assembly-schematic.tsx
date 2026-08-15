import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyResult, AssemblyStep } from './assembly-frontier';
import { assemblyLayout, SCHEMATIC_METRICS } from './assembly-layout';
import type { CreatePrefill } from './assembly-create-dialog';
import { applyOverrides, combineVerdict, hitNode, type PosOverrides } from './assembly-positions';
import { pieceRefKey } from './piece-block-refs';
import { PieceTile } from './piece-silhouette';
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
/**
 * Ноды не отдают палец прокрутке.
 *
 * Объявляется ЗАРАНЕЕ и на самой ноде: браузер выбирает поведение жеста в момент касания, и
 * запрет, выставленный после `pointerdown`, уже ничего не решает — палец уводит страницу в
 * прокрутку, прилетает `pointercancel`, нода возвращается назад. Полотно при этом остаётся
 * прокручиваемым: касание мимо нод ведёт себя как обычно.
 */
const NODE_TOUCH = 'none' as const;

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
  positions,
  onMove,
  onResetPositions,
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
  /** Ручные позиции нод. Живут выше схемы: схема размонтируется при смене режима. */
  positions: PosOverrides;
  onMove: (key: string, at: { x: number; y: number }) => void;
  onResetPositions: () => void;
  /** Карточка выпущена: схема остаётся читаемой и раскладываемой, но не редактируемой. */
  frozen?: boolean;
}) {
  // Выбор — то, из чего собирается следующий узел. Живёт в схеме, потому что это состояние
  // ЖЕСТА, а не данных: уход с экрана его обнуляет, и правильно.
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (key: string) =>
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const onTable = new Set(res.frontier);
  const { LINE_H, HEAD_H } = SCHEMATIC_METRICS;
  const looseSteps = blocks.find((b) => b.key === '')?.steps ?? [];

  // ВЫБОР ЖИВЁТ ДО ТЕХ ПОР, ПОКА ЖИВЫ ЕГО КЛЮЧИ. Деталь, попавшая в узел соседним жестом, входом
  // больше не годится, а чип «выбрано: A» продолжал бы предлагать её — и «обработка · 1» родила бы
  // шаг со съеденным входом, то есть ровно ту невалидность, ради устранения которой затевался
  // диалог.
  useEffect(() => {
    setPicked((cur) => {
      const live = cur.filter((k) => res.frontier.includes(k));
      return live.length === cur.length ? cur : live;
    });
  }, [res]);

  const auto = useMemo(() => assemblyLayout(blocks, steps, res), [blocks, steps, res]);

  const showMessage = useSnackBarStore((st) => st.showMessage);
  /** Человеческое имя ноды: имя детали или код узла. */
  const nameOfNode = (key: string) => (res.units.has(key) ? `▣ ${key}` : pieceNameOf(key));

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
  const activate = (fn?: () => void) =>
    fn
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: fn,
          // Клавиатура зовёт действие НАПРЯМУЮ, минуя защиту от клик-эха: эхо бывает только у
          // указателя, и общий сторож съедал бы первый Enter после отменённого жеста.
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
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
    if (verdict.absorbInto) return `отпустите: дособрать ▣ ${verdict.absorbInto}`;
    return `отпустите: сшить ${nameOfNode(drag!.key)} + ${nameOfNode(target!.key)}`;
  })();

  /**
   * Рамка ноды: цель жеста сильнее наведения.
   *
   * Обе рисуются outline'ом, и если бы они складывались, у цели под курсором получилась бы каша
   * из двух рамок. Цель жеста — утверждение о том, что произойдёт по отпусканию, и оно важнее
   * ответа на «что с этим связано».
   */
  const nodeRing = (key: string) => {
    if (target?.key === key && verdict) {
      return verdict.ok
        ? 'outline outline-2 outline-offset-2 outline-textColor'
        : 'outline outline-2 outline-offset-2 outline-error';
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
          деталей ещё нет — схеме нечего рисовать
        </Text>
        <Text size='micro' variant='label'>
          детали приходят из выкроек; появятся здесь плитками, и сборка начнётся с них
        </Text>
      </div>
    );
  }

  // Шаг → блок, которому он принадлежит (включая хвостовой с пустым ключом).
  const blockOfStep = new Map<number, string>();
  for (const b of blocks) for (const i of b.steps) blockOfStep.set(i, b.key);

  // ЧТО УЗЕЛ БЕРЁТ — его ПРЯМЫЕ входы, а не замыкание по деталям.
  //
  // Разница принципиальна. Замыкание (`block.leaves`) для готового изделия — это ВСЕ детали
  // карточки, и сводка выродилась бы в список из пятнадцати имён ровно на том узле, ради
  // которого схему открывают. Прямые входы отвечают на настоящий вопрос — «из чего собран
  // именно этот узел»: у корпуса это полочка и спинка, у изделия — ▣ SHELL и ▣ HOOD.
  //
  // Собственный ключ отбрасывается: в поглощении `GARMENT + HEM → GARMENT` узел входит сам в
  // себя, и «берёт: ▣ GARMENT» не сообщает ничего.
  const directInputsOf = new Map<string, string[]>();
  for (const b of blocks) {
    const seen = new Set<string>();
    const acc: string[] = [];
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (!input.key || input.key === b.key || seen.has(input.key)) continue;
        seen.add(input.key);
        acc.push(input.key);
      }
    }
    directInputsOf.set(b.key, acc);
  }

  const boxOf = (blockKey: string) => (blockKey === '' ? layout.tail : layout.byKey.get(blockKey));

  // Строка бокса → её y. Нужна проводам: они целятся в строку, а не в бокс.
  const rowY = (blockKey: string, stepIndex: number): number => {
    const box = boxOf(blockKey);
    if (!box) return 0;
    const b = blocks.find((x) => x.key === blockKey);
    const pos = b ? b.steps.indexOf(stepIndex) : -1;
    if (pos < 0) return box.y + HEAD_H / 2;
    return box.y + HEAD_H + 2 + pos * LINE_H + LINE_H / 2;
  };

  const wire = (x1: number, y1: number, x2: number, y2: number) => {
    const mid = (x1 + x2) / 2;
    return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
  };

  // Провод помнит СВОИ КОНЦЫ: без этого «подсветить всё, что входит и выходит из ноды»
  // выродилось бы в разбор строки пути.
  const wires: Array<{ d: string; key: string; from: string; to: string; faint?: boolean }> = [];
  /** Маркер-стрелка: провод обязан говорить НАПРАВЛЕНИЕ, а не только факт связи. */
  const ARROW = 'url(#assembly-arrow)';
  // Узел → строка-потребитель.
  for (const b of blocks) {
    if (b.key === '') continue;
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (input.kind !== 'unit' || input.key === b.key) continue;
        const from = layout.byKey.get(input.key);
        const to = layout.byKey.get(b.key);
        if (!from || !to) continue;
        wires.push({
          key: `${input.key}->${b.key}:${i}`,
          from: input.key,
          to: b.key,
          d: wire(from.x + from.w, from.y + from.h / 2, to.x, rowY(b.key, i)),
        });
      }
    }
  }
  // ДЕТАЛЬ → СТРОКА-ПОТРЕБИТЕЛЬ, ВСЕГДА, включая её собственный узел.
  //
  // Раньше смежная связь провода не получала: плитка стоит вплотную к своему боксу, и считалось,
  // что соседство само за себя говорит. Не говорит. Соседство показывает, ЧТО деталь относится к
  // узлу, но не показывает, на КАКОМ ШАГЕ она в него вошла, — а это главный вопрос к схеме; и
  // стоит ноду подвинуть рукой, как соседство исчезает, не оставив вместо себя ничего.
  for (const t of layout.tiles) {
    for (const i of t.consumers) {
      const target = blockOfStep.get(i);
      if (target === undefined) continue;
      const to = boxOf(target);
      if (!to) continue;
      const eatenHere = t.state === 'eaten' && t.into === target;
      wires.push({
        key: `tile:${t.key}->${target}:${i}`,
        from: t.key,
        to: target,
        d: wire(t.x + t.w, t.y + t.h / 2, to.x, rowY(target, i)),
        // Вошла в узел — полный провод; просто обработана этим шагом — бледный пунктир: связь
        // есть, но деталь осталась на столе, и путать одно с другим нельзя.
        faint: !eatenHere,
      });
    }
  }

  return (
    <>
      {!frozen && (
        <ActionPanel
          picked={picked}
          labelOf={pieceNameOf}
          onCreate={(intent) => {
            onCreate({ inputKeys: picked, intent });
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
            раскладка: ручная · {manual}
          </Text>
          {/* nonForm по той же причине, что у переключателя режима: сброс раскладки не меняет
              данных, но под внешним `<fieldset disabled>` настоящая кнопка мертва — и сбросить
              чужую расстановку на выпущенной карточке было бы нечем. */}
          <Chip nonForm dashed onClick={() => setResetOpen(true)} title='вернуть автоматическую раскладку'>
            авто
          </Chip>
        </ChipRow>
      )}
      <div
        ref={canvasRef}
        className='overflow-auto border border-borderColor bg-bgColor'
        style={{ maxHeight: 640 }}
      >
        <div style={{ width: layout.width, height: layout.height, position: 'relative' }}>
          <svg width={layout.width} height={layout.height} className='absolute inset-0' aria-hidden>
            <defs>
              <marker
                id='assembly-arrow'
                viewBox='0 0 8 8'
                refX={7}
                refY={4}
                markerWidth={5}
                markerHeight={5}
                orient='auto-start-reverse'
              >
                <path d='M0,1 L7,4 L0,7 z' fill='currentColor' />
              </marker>
            </defs>
            {wires.map((w) => {
              // Провод «этой ноды» — тот, у которого она на любом конце: вопрос читателя звучит
              // как «что с ней связано», а не «что из неё выходит».
              const lit = hovered !== null && (w.from === hovered || w.to === hovered);
              // Пока что-то наведено, остальные провода УХОДЯТ НА ЗАДНИЙ ПЛАН, а не остаются как
              // были: подсветить связи, не приглушив прочее, значит не ответить на вопрос — на
              // плотной схеме жирная линия теряется среди двух десятков таких же.
              const dimmed = hovered !== null && !lit;
              return (
                <path
                  key={w.key}
                  d={w.d}
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={lit ? 2 : 1}
                  strokeDasharray={w.faint ? '3 3' : undefined}
                  markerEnd={ARROW}
                  opacity={lit ? 0.9 : dimmed ? 0.12 : w.faint ? 0.3 : 0.45}
                />
              );
            })}
          </svg>

          {layout.boxes.map((box) => {
            const b = blocks.find((x) => x.key === box.key);
            if (!b) return null;
            const terminal = res.frontier.includes(box.key) && res.units.has(box.key);
            return (
              <div key={box.key}>
                <div
                  className={cn(
                    'absolute border-2 border-textColor bg-bgColor',
                    drag?.key === box.key && drag.started && 'opacity-70',
                    nodeRing(box.key),
                  )}
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h, touchAction: NODE_TOUCH }}
                  {...dragHandlers(box.key, box.x, box.y)}
                  {...hoverHandlers(box.key)}
                >
                  {/* ШАПКА — PICK-ЗОНА БОКСА. Строки внутри уже кнопки шагов, поэтому выбор узла
                      переехал на заголовок: одна нода — одно место, куда по ней кликают. Кнопка, а
                      не div, ради клавиатуры: Enter на сфокусированной шапке — тот же выбор, и
                      путь «сшить» с клавиатуры не потерян. */}
                  <div
                    {...activate(
                      !frozen && onTable.has(box.key)
                        ? clickGuard(() => toggle(box.key))
                        : // Съеденный узел входом не взять, зато вопрос «куда он делся» законен —
                          // и шапка на него отвечает, как отвечает плитка съеденной детали.
                          (() => {
                            const eater = res.consumedBy.get(box.key);
                            return eater === undefined ? undefined : clickGuard(() => onPickStep(eater));
                          })(),
                    )}
                    className={cn(
                      // `overflow-hidden` на самой шапке — последняя преграда: высота бокса
                      // посчитана раскладкой, и вторая строка текста, куда бы она ни взялась,
                      // ляжет поверх первой строки шага.
                      'flex w-full items-baseline gap-1 overflow-hidden border-b border-hairline px-1 text-left',
                      !frozen && onTable.has(box.key) && 'hover:bg-bgZebra',
                      picked.includes(box.key) && 'bg-bgZebra',
                    )}
                    style={{ height: HEAD_H }}
                    // Полный текст шапки — в подсказке: ключ и имя узла обрезаются по ширине, и
                    // прочесть их целиком иначе было бы негде.
                    title={`▣ ${box.key}${b.name ? ` · ${b.name}` : ''}${
                      terminal ? ' · готовое изделие' : b.absorbedInto ? ` · уходит в ▣ ${b.absorbedInto}` : ' · разрыв'
                    }\n${
                      onTable.has(box.key)
                        ? 'узел на столе — кликните, чтобы взять его в следующую сборку'
                        : 'узел уже вошёл в другой; кликните, чтобы открыть шаг, который его съел'
                    }`}
                  >
                    {/* КЛЮЧ НЕ ПЕРЕНОСИТСЯ. Он был единственным текстом шапки без ограничения
                        ширины: имя узла усекалось, статус справа не сжимался, а ключ рос — и
                        двухсловный «ДВА РУКАВА» уезжал второй строкой поверх первого шага.
                        Многоточие честнее: шапка высотой в строку и обязана быть в одну строку. */}
                    <Text
                      size='micro'
                      variant='uppercase'
                      tracking='label'
                      component='span'
                      className='min-w-0 shrink truncate font-bold'
                    >
                      {picked.includes(box.key) ? '✓ ' : ''}▣ {box.key}
                    </Text>
                    {b.name && (
                      <Text size='nano' variant='label' component='span' className='min-w-0 shrink truncate'>
                        {b.name}
                      </Text>
                    )}
                    {/* Статус тоже усекается: `→ключ съевшего узла` — текст произвольной длины, и
                        несжимаемым он отбирал ширину у самого ключа. Порог в 45% оставляет ему
                        достаточно, чтобы прочесть начало, но не даёт съесть шапку целиком. */}
                    <Text
                      size='nano'
                      variant='label'
                      component='span'
                      className='ml-auto max-w-[45%] shrink-0 truncate'
                    >
                      {terminal ? '✓' : b.absorbedInto ? `→${b.absorbedInto}` : '✕'}
                    </Text>
                  </div>
                  {/* ДЕЙСТВИЯ УЗЛА ПОКАЗЫВАЮТСЯ ПО НАВЕДЕНИЮ. Постоянно висящие чипы над каждым
                      боксом — это два лишних объекта на узел, и на схеме из десяти узлов их
                      двадцать: полотно читается как панель кнопок, а не как карта сборки.
                      Пропасть между боксом и чипами не возникает: чипы — потомки бокса в DOM, а
                      pointerenter/leave считают вложенность, а не нарисованные границы, поэтому
                      увести курсор на чип, не потеряв наведение, можно. */}
                  {!frozen && hovered === box.key && (
                    // ПОЗИЦИЯ СЧИТАЕТСЯ ОТ КРАЯ БОКСА, А НЕ ПОДБИРАЕТСЯ ЧИСЛОМ. `-top-4` было
                    // магическими шестнадцатью пикселями: чуть выше строка чипа — и она залезала
                    // на сам бокс, чуть ниже — отрывалась от него. `bottom-full` ставит нижний
                    // край полосы ровно на верхний край бокса при любом кегле.
                    //
                    // `pb-1` внутри — МОСТИК: без него между чипами и боксом остаётся пустота, и
                    // провести через неё курсор, не потеряв наведение, нельзя — чипы исчезали бы
                    // ровно на пути к ним.
                    //
                    // Фон и `z-10` — потому что полоса живёт в зазоре между колонками и рядами, и
                    // соседняя нода там же. Прозрачная полоса поверх чужого бокса читается как
                    // наезд; непрозрачная и заведомо верхняя — как то, чем она и является:
                    // временный слой над схемой.
                    <div className='absolute bottom-full left-0 z-10 flex max-w-full items-center gap-1 bg-bgColor pb-1'>
                      <Chip
                        dashed
                        onClick={clickGuard(() => onCreate({ inputKeys: [box.key], intent: 'process' }))}
                        title='добавить обработку по этому узлу'
                      >
                        + операция
                      </Chip>
                      <Chip
                        dashed
                        onClick={clickGuard(() => onDissolve(b.producedAt))}
                        title='шаг перестанет собирать узел; входы вернутся на стол следующим шагам'
                      >
                        растворить
                      </Chip>
                    </div>
                  )}
                  {/* СОСТАВ УЗЛА — по наведению и ОВЕРЛЕЕМ, а не строкой внутри бокса. Строкой
                      он изменил бы высоту, которую считает чистая раскладка, то есть сдвинул бы
                      всю схему ради подписи; а постоянной он превратил бы полотно в таблицу —
                      ровно то, из-за чего действия узла уехали на наведение. */}
                  {hovered === box.key && (directInputsOf.get(box.key) ?? []).length > 0 && (
                    <div
                      className='absolute top-full left-0 z-10 flex w-full items-center bg-bgColor pt-1'
                      title={`берёт: ${(directInputsOf.get(box.key) ?? []).map(nameOfNode).join(' + ')}`}
                    >
                      <Text size='nano' variant='label' component='span' className='truncate'>
                        ← {(directInputsOf.get(box.key) ?? []).map(nameOfNode).join(' + ')}
                      </Text>
                    </div>
                  )}
                  {b.steps.map((i) => (
                    <div
                      key={i}
                      {...activate(clickGuard(() => onPickStep(i)))}
                      className='flex w-full items-center px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                      style={{ height: LINE_H }}
                      title='открыть шаг в списке'
                    >
                      <Text size='nano' component='span' className='min-w-0 truncate'>
                        {(i + 1) * 10} · {labelOf(i)}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* ХВОСТОВОЙ БОКС: шаги, не достигающие ни одного узла. До Ф7 их на полотне не было
              вовсе — неразмеченная карточка показывала пустоту вместо существующего маршрута.
              Пунктир и лексикон те же, что у врезки рельса, чтобы две вьюшки называли одно
              одинаково. */}
          {layout.tail && (
            <div
              className={cn(
                'absolute border-2 border-dashed border-borderColor bg-bgColor',
                drag?.key === '' && drag.started && 'opacity-70',
                nodeRing(''),
              )}
              style={{
                left: layout.tail.x,
                top: layout.tail.y,
                width: layout.tail.w,
                height: layout.tail.h,
                touchAction: NODE_TOUCH,
              }}
              {...dragHandlers('', layout.tail.x, layout.tail.y)}
              {...hoverHandlers('')}
            >
              <div className='flex items-baseline gap-1 border-b border-hairline px-1' style={{ height: HEAD_H }}>
                <Text size='micro' variant='uppercase' tracking='label' component='span' className='font-bold'>
                  ◌ вне узлов
                </Text>
                <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
                  цель шага — не узел
                </Text>
              </div>
              {looseSteps.map((i) => (
                <div
                  key={i}
                  {...activate(clickGuard(() => onPickStep(i)))}
                  className='flex w-full items-center px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                  style={{ height: LINE_H }}
                  title='открыть шаг в списке'
                >
                  <Text size='nano' component='span' className='min-w-0 truncate'>
                    {(i + 1) * 10} · {labelOf(i)}
                  </Text>
                </div>
              ))}
            </div>
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
            <div
              key={`tile:${t.key}`}
              {...activate(
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
              className={cn(
                'absolute flex items-center justify-center overflow-hidden border',
                t.state === 'free' ? 'border-dashed border-borderColor' : 'border-borderColor',
                picked.includes(t.key) && 'border-solid border-textColor',
                drag?.key === t.key && drag.started && 'opacity-70',
                nodeRing(t.key),
              )}
              style={{ left: t.x, top: t.y, width: t.w, height: t.h, touchAction: NODE_TOUCH }}
              title={
                t.state === 'free'
                  ? `${pieceNameOf(t.key)} — ещё не вошла ни в один узел; кликните, чтобы взять в сборку`
                  : `${pieceNameOf(t.key)} — уже в узле ▣ ${t.into}; кликните, чтобы открыть шаг, который её съел`
              }
              {...dragHandlers(t.key, t.x, t.y)}
              {...hoverHandlers(t.key)}
            >
              <PieceTile
                found={pieceShapes?.get(pieceRefKey(t.key)) ?? null}
                name={pieceNameOf(t.key)}
                className='size-full'
              />
            </div>
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
        title='вернуть автоматическую раскладку'
        confirmLabel='сбросить'
        cancelLabel='оставить'
        width='sm'
      >
        <Text size='micro' variant='label'>
          все ручные позиции этой карточки будут забыты, и схема снова расставит узлы сама. Данные
          карточки не изменятся: позиции — только способ смотреть.
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
  labelOf,
  onCreate,
  onClear,
}: {
  picked: string[];
  labelOf: (k: string) => string;
  onCreate: (intent: 'unit' | 'process') => void;
  onClear: () => void;
}) {
  if (picked.length === 0) return null;
  return (
    <ChipRow className='mb-1.5'>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        выбрано:
      </Text>
      <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
        {picked.map(labelOf).join(' + ')}
      </Text>
      {picked.length >= 2 && (
        <Chip onClick={() => onCreate('unit')} title='собрать из выбранного новый узел'>
          сшить · {picked.length}
        </Chip>
      )}
      <Chip dashed onClick={() => onCreate('process')} title='шаг по выбранному, ничего не собирающий'>
        обработка · {picked.length}
      </Chip>
      <Chip dashed onClick={onClear} title='снять выбор'>
        отменить
      </Chip>
    </ChipRow>
  );
}
