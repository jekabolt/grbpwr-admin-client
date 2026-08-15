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

  const auto = useMemo(() => assemblyLayout(blocks, steps, res), [blocks, steps, res]);

  const showMessage = useSnackBarStore((st) => st.showMessage);
  /** Человеческое имя ноды: имя детали или код узла. */
  const nameOfNode = (key: string) => (res.units.has(key) ? `▣ ${key}` : pieceNameOf(key));

  const [drag, setDrag] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastClient = useRef<{ x: number; y: number } | null>(null);
  // Клик приходит после перетаскивания — и не должен срабатывать как выбор. Порог разводит
  // жесты по НАМЕРЕНИЮ, а этот флаг гасит уже случившееся эхо.
  const justDragged = useRef(false);
  const [resetOpen, setResetOpen] = useState(false);

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

  const dragHandlers = (key: string, nodeX: number, nodeY: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const p = toLayoutPoint(e);
      if (!p) return;
      lastClient.current = { x: e.clientX, y: e.clientY };
      // Новый жест — старое эхо больше не актуально. Сбрасывать флаг в clickGuard было бы
      // недостаточно: драг, закончившийся не на кликабельном, оставил бы флаг взведённым и
      // проглотил следующий честный клик.
      justDragged.current = false;
      // Захват НЕ берётся здесь: он меняет цель последующего click, и обычный клик по строке
      // шага перестал бы работать. Захват берётся ровно в тот момент, когда жест признан драгом.
      setDrag({
        key,
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
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag || drag.key !== key) return;
      const p = toLayoutPoint(e);
      if (!p) return;
      lastClient.current = { x: e.clientX, y: e.clientY };
      const far = Math.abs(p.x - drag.fromX) > DRAG_THRESHOLD || Math.abs(p.y - drag.fromY) > DRAG_THRESHOLD;
      if (!drag.started && !far) return;
      if (!drag.started) {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // Указатель мог уже уйти — жест продолжится без захвата, это не повод его ронять.
        }
      }
      setDrag({ ...drag, started: true, x: p.x - drag.offX, y: p.y - drag.offY, ptrX: p.x, ptrY: p.y });
    },
    onPointerUp: () => {
      if (!drag || drag.key !== key) return;
      if (drag.started) {
        justDragged.current = true;
        // Перемещение состоялось в любом случае: жест композитен, и «перенёс» не отменяется тем,
        // что «соединить» потом отклонили. Позиция остаётся там, где ноду бросили.
        onMove(key, { x: Math.max(0, drag.x), y: Math.max(0, drag.y) });
        if (verdict && !verdict.ok) {
          // Отказ ДО диалога: открывать форму, которую нельзя отправить, — предлагать заведомый
          // отказ. Причина словами движка.
          showMessage(verdict.reason, 'error');
        } else if (verdict?.ok && target) {
          onCreate({
            inputKeys: [drag.key, target.key],
            absorbInto: verdict.absorbInto,
            intent: verdict.absorbInto ? undefined : 'unit',
          });
        }
      }
      setDrag(null);
    },
    // Срыв жеста — откат транзиента без записи: система забрала указатель, значит намерения
    // подтверждено не было.
    onPointerCancel: () => setDrag(null),
    onLostPointerCapture: () => setDrag(null),
  });

  const clickGuard = (fn: () => void) => () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    fn();
  };

  // ЖЕСТ, НЕ ДОШЕДШИЙ ДО ПОРОГА, обязан кончиться где угодно. До порога захвата ещё нет, и
  // указатель, ушедший с ноды, больше не отдаёт ей событий — без этого сторожа «нажал и увёл»
  // оставляло бы висеть незакрытое состояние жеста.
  useEffect(() => {
    if (!drag || drag.started) return;
    const done = () => setDrag(null);
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
    return () => {
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
    };
  }, [drag]);

  // Escape во время драга — тот же откат: жест отменён, нода возвращается на прежнее место.
  useEffect(() => {
    if (!drag?.started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrag(null);
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
          // Курсор стоит на месте, полотно уехало — значит нода под курсором сместилась на ту же
          // величину. Иначе она отставала бы от руки ровно на прокрутку.
          if (movedX || movedY) setDrag((d) => (d ? { ...d, x: d.x + movedX, y: d.y + movedY } : d));
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

  /** Рамка цели под курсором: чернильная у валидной, ошибочная у отказной. */
  const targetRing = (key: string) =>
    target?.key === key && verdict
      ? verdict.ok
        ? 'outline outline-2 outline-offset-2 outline-textColor'
        : 'outline outline-2 outline-offset-2 outline-error'
      : undefined;

  const manual = Object.keys(positions).length;

  if (layout.tiles.length === 0 && layout.boxes.length === 0) {
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

  const wires: Array<{ d: string; key: string; faint?: boolean }> = [];
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
          d: wire(from.x + from.w, from.y + from.h / 2, to.x, rowY(b.key, i)),
        });
      }
    }
  }
  // Деталь → строка-потребитель, если та не рядом. До Ф7 деталь, взятая двумя блоками, рисовалась
  // двумя стопками, и вторая связь читалась смежностью. Дубли схлопнуты — значит связь обязан
  // сообщить провод, иначе она пропала бы молча. Смежная связь провода не требует и сегодня.
  for (const t of layout.tiles) {
    const home = t.state === 'eaten' ? t.into : null;
    for (const i of t.consumers) {
      const target = blockOfStep.get(i);
      if (target === undefined) continue;
      if (home !== null && target === home) continue;
      const to = boxOf(target);
      if (!to) continue;
      wires.push({
        key: `tile:${t.key}->${target}:${i}`,
        d: wire(t.x + t.w, t.y + t.h / 2, to.x, rowY(target, i)),
        faint: true,
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
      {drag?.started && hint && (
        <Text size='micro' variant='label' className={cn('mb-1.5', verdict && !verdict.ok && 'text-error')}>
          {hint}
        </Text>
      )}
      {manual > 0 && (
        <ChipRow className='mb-1.5'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            раскладка: ручная · {manual}
          </Text>
          <Chip dashed onClick={() => setResetOpen(true)} title='вернуть автоматическую раскладку'>
            авто
          </Chip>
        </ChipRow>
      )}
      <div
        ref={canvasRef}
        className='overflow-auto border border-borderColor bg-bgColor'
        style={{ maxHeight: 640, touchAction: drag ? 'none' : undefined }}
      >
        <div style={{ width: layout.width, height: layout.height, position: 'relative' }}>
          <svg width={layout.width} height={layout.height} className='absolute inset-0' aria-hidden>
            {wires.map((w) => (
              <path
                key={w.key}
                d={w.d}
                fill='none'
                stroke='currentColor'
                strokeWidth={1}
                strokeDasharray={w.faint ? '3 3' : undefined}
                opacity={w.faint ? 0.3 : 0.45}
              />
            ))}
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
                    targetRing(box.key),
                  )}
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  {...dragHandlers(box.key, box.x, box.y)}
                >
                  {/* ШАПКА — PICK-ЗОНА БОКСА. Строки внутри уже кнопки шагов, поэтому выбор узла
                      переехал на заголовок: одна нода — одно место, куда по ней кликают. Кнопка, а
                      не div, ради клавиатуры: Enter на сфокусированной шапке — тот же выбор, и
                      путь «сшить» с клавиатуры не потерян. */}
                  <button
                    type='button'
                    onClick={
                      !frozen && onTable.has(box.key) ? clickGuard(() => toggle(box.key)) : undefined
                    }
                    className={cn(
                      'flex w-full items-baseline gap-1 border-b border-hairline px-1 text-left',
                      !frozen && onTable.has(box.key) && 'hover:bg-bgZebra',
                      picked.includes(box.key) && 'bg-bgZebra',
                    )}
                    style={{ height: HEAD_H }}
                    title={
                      onTable.has(box.key)
                        ? 'узел на столе — кликните, чтобы взять его в следующую сборку'
                        : 'узел уже вошёл в другой — входом его больше не взять'
                    }
                  >
                    <Text size='micro' variant='uppercase' tracking='label' component='span' className='font-bold'>
                      {picked.includes(box.key) ? '✓ ' : ''}▣ {box.key}
                    </Text>
                    {b.name && (
                      <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                        {b.name}
                      </Text>
                    )}
                    <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
                      {terminal ? '✓' : b.absorbedInto ? `→${b.absorbedInto}` : '✕'}
                    </Text>
                  </button>
                  {!frozen && (
                    <div className='absolute -top-4 left-0 flex items-center gap-1'>
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
                  {b.steps.map((i) => (
                    <button
                      key={i}
                      type='button'
                      onClick={clickGuard(() => onPickStep(i))}
                      className='flex w-full items-center px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                      style={{ height: LINE_H }}
                      title='открыть шаг в списке'
                    >
                      <Text size='nano' component='span' className='min-w-0 truncate'>
                        {(i + 1) * 10} · {labelOf(i)}
                      </Text>
                    </button>
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
                targetRing(''),
              )}
              style={{ left: layout.tail.x, top: layout.tail.y, width: layout.tail.w, height: layout.tail.h }}
              {...dragHandlers('', layout.tail.x, layout.tail.y)}
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
                <button
                  key={i}
                  type='button'
                  onClick={clickGuard(() => onPickStep(i))}
                  className='flex w-full items-center px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                  style={{ height: LINE_H }}
                  title='открыть шаг в списке'
                >
                  <Text size='nano' component='span' className='min-w-0 truncate'>
                    {(i + 1) * 10} · {labelOf(i)}
                  </Text>
                </button>
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

              Плитка остаётся <button> и на съеденной детали, хотя действия у той пока нет: клик по
              съеденной уводит к съевшему шагу — это T-32, а фокусируемость нужна уже сейчас, иначе
              клавиатура потеряет половину полотна ровно в тот момент, когда полотно стало полным.

              `aria-disabled` вместо `disabled`: на выпущенной карточке плитку нельзя выбрать, но
              МОЖНО двигать (Р9), а `disabled`-кнопка не получает pointer-событий вовсе. */}
          {layout.tiles.map((t) => (
            <button
              key={`tile:${t.key}`}
              type='button'
              aria-disabled={frozen || undefined}
              onClick={
                t.state === 'free'
                  ? !frozen
                    ? clickGuard(() => toggle(t.key))
                    : undefined
                  : // Съеденную деталь входом не взять — правило 2. Зато главный вопрос читателя о
                    // ней «куда она делась», и клик отвечает: уводит к шагу, который её съел.
                    clickGuard(() => {
                      const eater = res.consumedBy.get(t.key);
                      if (eater !== undefined) onPickStep(eater);
                    })
              }
              className={cn(
                'absolute flex items-center justify-center px-1 text-center',
                t.state === 'free' ? 'border border-dashed border-borderColor' : 'border border-borderColor bg-bgColor',
                picked.includes(t.key) && 'border-solid border-textColor bg-bgZebra',
                drag?.key === t.key && drag.started && 'opacity-70',
                targetRing(t.key),
              )}
              style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
              title={
                t.state === 'free'
                  ? `${pieceNameOf(t.key)} — ещё не вошла ни в один узел; кликните, чтобы взять в сборку`
                  : `${pieceNameOf(t.key)} — уже в узле ▣ ${t.into}; кликните, чтобы открыть шаг, который её съел`
              }
              {...dragHandlers(t.key, t.x, t.y)}
            >
              <Text size='nano' variant='label' component='span' className='line-clamp-2'>
                {pieceNameOf(t.key)}
              </Text>
            </button>
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
