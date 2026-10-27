import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { common_TechCardMachineType } from 'api/proto-http/admin';
import { unitDisplayName } from 'lib/assembly-unit-name';
import { cn } from 'lib/utility';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Text } from 'ui';
import { parseDecimalNumber } from 'utils/decimal';
import { SortableEntity } from '../../hero/components/sortable-entity';
import type { AssemblyBlock } from './assembly-blocks';
import { type FoundPiece } from './nesting/dxf-geometry';
import { operationHeading, seamClassInherits, seamClassLabel } from './operation-options';
import type { WorkCatalog } from './operation-work';
import { pieceRefKey } from './piece-block-refs';
import { PieceRef, useFormPieces } from './piece-picker';
import { PieceSilhouette, SILHOUETTE_INK } from './piece-silhouette';
import { TechCardFormData } from './schema';
import { StepIconCell } from './step-icon-tiles';
import { UnitBlockHeader } from './unit-block';
import { useActiveStepStore, useIsActiveStep, useMapPickNonce } from './assembly-map/active-step';
import type { PieceShapeMap } from './use-piece-shapes';

// РЕЛЬС ПОСЛЕДОВАТЕЛЬНОСТИ — ОДИН МОДУЛЬ НА ДВА ВИДА.
//
// Здесь живёт ровно тот блок, что стоял в `OperationsField`: `DndContext` → `SortableContext` →
// строки шагов с врезанными шапками узлов. Извлечение сделано ради Ф6в, где режим списка
// фулскрина обязан быть ТЕМ ЖЕ рельсом, а не вторым похожим: два списка одних и тех же шагов
// разъезжаются первой же правкой, и «шаг 30» в оверлее перестаёт совпадать с «шагом 30» в инлайне.
//
// НИ ОДНОГО МУТАТОРА И НИ ОДНОГО `useFieldArray` ЗДЕСЬ НЕТ, и это не стилистика. `useFieldArray`
// ('operations') существует в приложении ровно в одном экземпляре — в `OperationsField`; второй
// экземпляр не синхронизируется с первым (мутаторы field array не вещают между экземплярами), и
// рельс смотрел бы на замороженный список. Поэтому `fields` приезжают пропом, а перестановка
// уходит наружу колбэком `onMoveOperation` — вместе с гейтом заморозки и сбросом записи отмены,
// которые стоят у самого мутатора.
//
// Кнопка «+ operation» и `RailTotal` в модуль НЕ переехали: они стоят ПОД рельсом в инлайне, а у
// списка фулскрина «+ operation» уже есть в доке.
//
// ЧТЕНИЕ ФОРМЫ ОСТАЛОСЬ ВНУТРИ СТРОКИ, через контекст. Это несущее свойство для Ф6в: контекст
// проникает в порталы, и рельсу, отрисованному внутри оверлея, ничего не нужно доставлять руками.

// ДВЕ РАЗНЫЕ ВЕЩИ, А НЕ ОДНА В ДВУХ РАЗМЕРАХ.
//
// Там, где деталь ВЫБИРАЮТ (тарелка, состав шага), она — ПЛИТКА: квадрат 56px с формой и именем
// поверх (PieceTile). Имя уехало на картинку, поэтому место, которое раньше занимала подпись
// рядом, целиком отдано форме — при той же занятой полосе.
//
// В рельсе деталь не выбирают, там читают ПОРЯДОК. Силуэты живут во второй строке карточки:
// широкая рельса показывает три, узкая — один, поэтому имя операции всегда получает первую строку.
const RAIL_GLYPH = `size-4 ${SILHOUETTE_INK}`;
const RAIL_GLYPH_LIMIT = 3;

const sequenceCollisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCenter(args);
};

const sequenceDividerId = (at: number) => `sequence-divider:${at}`;

// Разделитель — отдельная цель, а не сортируемая строка. Строка означает «поставить рядом»;
// разделитель означает «поставить сюда И снять со сборочного графа». Смешать их одним id значило
// бы снова сделать принадлежность к узлу случайным побочным эффектом позиции.
function SequenceDivider({ at, visible = false }: { at: number; visible?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: sequenceDividerId(at),
    data: { sequenceDividerAt: at },
  });

  return (
    <div
      ref={setNodeRef}
      aria-hidden='true'
      data-sequence-divider={at}
      data-drop-active={isOver ? '1' : undefined}
      className='relative h-1.5 shrink-0'
    >
      <span
        className={cn(
          'pointer-events-none absolute inset-x-0 top-1/2 border-t border-textColor opacity-0 transition-opacity motion-reduce:transition-none',
          visible && 'opacity-100',
          isOver && 'border-t-2',
          isOver && 'opacity-100',
        )}
      />
    </div>
  );
}

// ── the sequence rail ────────────────────────────────────────────────────────────────────────
// One 26px line per assembly step, so twenty operations read as an ORDER instead of as twenty
// screens of controls. Drag ⠿ to reorder; the row is a button that opens the step in the editor.
function RailStep({
  uid,
  index,
  selected,
  onSelect,
  onNavigate,
  ruleBelow,
  hasError,
  assemblyBroken = false,
  activePin,
  activeBom,
  pieceShapes,
  onHoverPin,
  onDropPiece,
  readPieceDrag,
  workCatalog,
  draft = false,
}: {
  uid: string;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onNavigate: (index: number) => void;
  /** Hairline between adjacent rows in the same run. */
  ruleBelow: boolean;
  hasError: boolean;
  /** Шаг ломает сборочный граф: вход не на фронтире, дубль, невалидный джойн. */
  assemblyBroken?: boolean;
  activePin?: number | null;
  activeBom?: string | null;
  /** Контуры деталей карточки, одной стабильной картой на весь рельс (см. use-piece-shapes). */
  pieceShapes: PieceShapeMap;
  onHoverPin: (n: number | null) => void;
  onDropPiece: (index: number, lineKey: string) => void;
  /**
   * Разбор перетаскиваемой полезной нагрузки в lineKey детали. ПРИХОДИТ ПРОПОМ, а не импортом:
   * `readPieceDrag` живёт в `operations-field.tsx` вместе с двумя константами протокола, которые
   * пишет тарелка деталей и читает редактор шага, — то есть используется не только рельсом. Тащить
   * функцию сюда значило бы увезти протокол в лист графа, а импортировать её отсюда — завести цикл
   * между двумя модулями, которого в этом дереве сегодня нет ни одного.
   */
  readPieceDrag: (dt: DataTransfer) => string;
  /**
   * Каталог работ — ПРОПОМ, одной подпиской на весь рельс (R8). Хук в строке означал бы сто
   * двадцать шесть подписок на карточке свалки ради одного и того же справочника; не приехал —
   * имя деградирует до сегодняшней деривации, а не до пустоты.
   *
   * ОБЯЗАТЕЛЬНЫЙ ТЕМ ЖЕ ПРИЁМОМ, что аргументы композитора: необязательный проп позволил бы
   * будущему вызывателю молча забыть каталог — и работы, знакомые каталогу, поехали бы токенами
   * на одном экране из семи. `undefined` пишется вслух.
   */
  workCatalog: WorkCatalog | undefined;
  /**
   * Шаг записал каркас сборки, и его ещё никто не проверил — поле шага `draft` (0410): переживает
   * перезагрузку и видно всей команде.
   */
  draft?: boolean;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const opType = (useWatch({ control, name: `operations.${index}.operationType` }) ?? '') as string;
  // The verb of a machine step comes from its machine, not from the word MACHINE — without this the
  // whole rail reads «machine · …» twenty times over.
  const machineType = (useWatch({ control, name: `operations.${index}.machineType` }) ??
    '') as string;
  // Класс шва — ЯКОРЬ ВИДА, и рельсу он нужен по той же причине, по какой нужен машинный тип:
  // без него отстрочка на одноигольной читалась бы «join» в списке и «Topstitch» в открытом шаге.
  const seamClass = (useWatch({ control, name: `operations.${index}.seamClass` }) ?? '') as string;
  const topstitchMode = (useWatch({
    control,
    name: `operations.${index}.topstitchMode`,
  }) ?? '') as Parameters<typeof operationHeading>[0]['topstitchMode'];
  // РАБОТА — НАЗВАННОЕ ИМЯ ШАГА, и оно бьёт обе выведенные лестницы выше. Без этой подписки шаг,
  // которому назначили работу, продолжал бы зваться в рельсе выведенным словом, пока пикер в
  // открытом редакторе называет его выбранным, — тот самый остаток, ради которого R8 и заведена.
  const work = (useWatch({ control, name: `operations.${index}.work` }) ?? '') as string;
  const zone = (useWatch({ control, name: `operations.${index}.zone` }) ?? '') as string;
  const note = (useWatch({ control, name: `operations.${index}.note` }) ?? '') as string;
  const calloutNumber = (useWatch({ control, name: `operations.${index}.calloutNumber` }) ??
    0) as number;
  const bomLineKeys = (useWatch({ control, name: `operations.${index}.bomLineKeys` }) ??
    []) as string[];
  const smv = (useWatch({ control, name: `operations.${index}.smv` }) ?? '') as string;
  const review = (useWatch({ control, name: `operations.${index}.review` }) ?? '') as string;
  const marked = review.trim() !== '';
  // The joined pieces, by name, for the composed heading. Resolved through the card's piece list so
  // a rename on the PATTERNS tab reaches every step that references it — which is what the removed
  // PlacementSync was trying to achieve by writing the names into the row.
  const pieceKeys = (useWatch({ control, name: `operations.${index}.inputKeys` }) ??
    []) as string[];
  const allPieces = useFormPieces();
  const linkedPieces = pieceKeys
    .map((k) => allPieces.find((pc) => pc.lineKey === k))
    .filter((p): p is PieceRef => !!p);
  // ВЕДУЩИЕ ГЛИФЫ СТРОКИ. Заголовок шага — готовая СТРОКА из operationHeading (она же едет в
  // title и в редактор), и класть картинки внутрь неё нечем; поэтому силуэты стоят рядом с ней
  // отдельными узлами, слева. Только у живых деталей и только там, где контур нашёлся: нет
  // контура — нет и спана, то же правило, что в рецепте, иначе строка обрастает пустыми боксами.
  const glyphs = linkedPieces
    .map((p) => ({ key: p.lineKey, shape: pieceShapes?.get(pieceRefKey(p.lineKey)) ?? null }))
    .filter((g): g is { key: string; shape: FoundPiece } => !!g.shape)
    .slice(0, RAIL_GLYPH_LIMIT);

  const [over, setOver] = useState(false);
  const opNumber = (index + 1) * 10;
  // КАРТА СБОРКИ (assembly-map/active-step): строка ставит наведение и липкий выбор, светится, когда
  // карта показывает её шаг, и открывает себя, когда шаг выбрали на карте. Без провайдера — молчит.
  const mapStore = useActiveStepStore();
  const mapLit = useIsActiveStep(index);
  const mapPick = useMapPickNonce(index);
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mapPick) return;
    onSelect();
    rowRef.current?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPick]);
  const smvMin = parseDecimalNumber(smv);
  // THE HEADING IS COMPOSED. This is the whole replacement for the removed «УЗЕЛ / ЧТО *»: the step
  // is named by what it does, where, and on which pieces — three controls the operator has already
  // filled — so two cards describing the same step read the same way.
  const label =
    operationHeading({
      operationType: opType as Parameters<typeof operationHeading>[0]['operationType'],
      machineType: machineType as common_TechCardMachineType,
      seamClass,
      topstitchMode,
      work,
      workCatalog,
      zone: zone as Parameters<typeof operationHeading>[0]['zone'],
      pieceNames: [],
      note,
    }) || 'new step';
  // The cross-highlight mirrors the sketch pin, which fills error-red while it is the active one.
  const linked =
    (!!activePin && activePin > 0 && calloutNumber === activePin) ||
    (!!activeBom && bomLineKeys.includes(activeBom));
  const seamCode = seamClassInherits(seamClass) ? '' : seamClassLabel(seamClass).split(' — ')[0];
  const status = hasError
    ? 'missing'
    : assemblyBroken
      ? 'broken'
      : marked
        ? 'review'
        : draft
          ? 'draft'
          : '';
  const problem = status !== '' && status !== 'draft';

  return (
    <SortableEntity uid={uid}>
      {({ setNodeRef, style, dragHandleProps }) => (
        <div
          ref={(el) => {
            setNodeRef(el);
            rowRef.current = el;
          }}
          style={style}
          data-map-lit={mapLit ? '1' : undefined}
          onMouseEnter={() => {
            onHoverPin(calloutNumber > 0 ? calloutNumber : null);
            mapStore?.hover(index);
          }}
          onMouseLeave={() => {
            onHoverPin(null);
            mapStore?.hover(null);
          }}
          onDragEnter={(e: React.DragEvent) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragOver={(e: React.DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          // dragleave also fires crossing into a child, so the row would flicker out of its drop
          // state while the cursor is still over it.
          onDragLeave={(e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(e: React.DragEvent) => {
            e.preventDefault();
            setOver(false);
            const key = readPieceDrag(e.dataTransfer);
            if (key) onDropPiece(index, key);
          }}
          className={cn(
            'grid min-h-14 grid-cols-[auto_minmax(0,1fr)] items-center bg-bgColor px-1 transition-colors',
            ruleBelow && 'border-b border-hairline',
            selected && 'outline outline-1 -outline-offset-1 outline-textColor',
            over && 'bg-pageBg',
          )}
        >
          <button
            type='button'
            aria-label={`reorder step ${opNumber}`}
            {...dragHandleProps}
            className='col-start-1 row-start-1 shrink-0 cursor-grab touch-none select-none px-1.5 py-1 leading-none text-labelColor hover:text-textColor active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
          >
            ⠿
          </button>
          {/* НЕ `<button>`: открыть шаг — ЧТЕНИЕ, а нативная кнопка внутри `<fieldset disabled>`
              выпущенной карточки клика не получает. Получалось, что на подписанной карточке
              открывался только первый шаг (он выбран по умолчанию), а остальные двенадцать
              прочитать было нельзя вовсе — при том что строка подсвечивалась на наведении и
              выглядела нажимаемой. Перетаскивание строки рядом остаётся кнопкой: это правка. */}
          <span
            role='button'
            tabIndex={0}
            onClick={() => {
              onSelect();
              mapStore?.select(index);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = index + (e.key === 'ArrowUp' ? -1 : 1);
                onNavigate(next);
                const rail = e.currentTarget.closest('[data-sequence-rail]');
                requestAnimationFrame(() => {
                  const row = rail?.querySelector<HTMLElement>(`[data-rail-step="${next}"]`);
                  if (row) {
                    row.focus();
                    mapStore?.select(next);
                  }
                });
                return;
              }
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onSelect();
              mapStore?.select(index);
            }}
            aria-current={selected}
            data-rail-step={index}
            className='col-start-2 row-start-1 grid min-w-0 cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
          >
            <StepIconCell index={index} />
            <Text size='control' component='span' className='w-6 shrink-0 tabular-nums'>
              {opNumber}
            </Text>
            <span className='grid min-w-0 grid-rows-2 content-center'>
              <Text
                size='control'
                component='span'
                title={label}
                className={cn(
                  'min-w-0 truncate',
                  problem && 'text-error',
                  (linked || mapLit) && 'underline underline-offset-2',
                )}
              >
                {label}
              </Text>
              <span className='flex min-h-4 min-w-0 items-center gap-2'>
                {glyphs.length > 0 && (
                  <span className='flex shrink-0 items-center gap-0.5'>
                    {glyphs.map((g, glyphIndex) => (
                      <PieceSilhouette
                        key={g.key}
                        found={g.shape}
                        boxClassName={cn(RAIL_GLYPH, glyphIndex > 0 && '@max-[28rem]:hidden')}
                        boxPx={{ w: 16, h: 16 }}
                      />
                    ))}
                  </span>
                )}
                {seamCode && (
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='shrink-0 uppercase'
                  >
                    {seamCode}
                  </Text>
                )}
                {smvMin > 0 && (
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='shrink-0 tabular-nums'
                    title='SMV, min'
                  >
                    {smvMin.toFixed(1)}
                  </Text>
                )}
                {status && (
                  <Text
                    size='micro'
                    variant={problem ? 'error' : 'label'}
                    component='span'
                    className='shrink-0 uppercase'
                  >
                    {status}
                  </Text>
                )}
              </span>
            </span>
          </span>
        </div>
      )}
    </SortableEntity>
  );
}

// Полный блок рельса: контекст перетаскивания, сортируемый список и строки с шапками узлов.
//
// `handleDragEnd` и сенсоры переехали сюда целиком — в `OperationsField` их не звал больше никто.
// Перестановку рельс НЕ делает сам: `onMoveOperation` — это `moveOperation` поля операций, где
// стоят гейт `frozen`, ремап ссылок дефектов и сброс записи отмены (3/9).
export function SequenceRail({
  fields,
  grouped,
  headerBefore,
  looseSteps,
  standaloneSteps,
  selectedIndex,
  onSelect,
  errorIndices,
  brokenSteps,
  problemIndices,
  activePin,
  activeBom,
  pieceShapes,
  onHoverPin,
  onDropPiece,
  onMoveOperation,
  readPieceDrag,
  workCatalog,
  draftIds,
}: {
  /**
   * Мета массива строк из `useFieldArray` владельца — СВОЕГО экземпляра здесь нет и быть не может.
   */
  fields: { id: string }[];
  /** Врезать ли шапки узлов: карточка размечена И вид — список. */
  grouped: boolean;
  /** Индекс шага → шапка блока, которую надо врезать ПЕРЕД ним (`useRailGrouping`). */
  headerBefore: Map<number, { block: AssemblyBlock; smv: string; terminal: boolean }>;
  /** Индексы шагов вне узлов: поздний отдельный прогон закрывает предыдущий блок своей чертой. */
  looseSteps: ReadonlySet<number>;
  /** Stored outside-block rows. A run starts behind the same closing rule as a loose run. */
  standaloneSteps: ReadonlySet<number>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  errorIndices: ReadonlySet<number>;
  /** Шаги, ломающие сборочный граф. */
  brokenSteps: ReadonlySet<number>;
  /** Missing, broken, or review steps counted in unit and block headers. */
  problemIndices: ReadonlySet<number>;
  activePin: number | null;
  activeBom: string | null;
  pieceShapes: PieceShapeMap;
  onHoverPin: (n: number | null) => void;
  onDropPiece: (index: number, lineKey: string) => void;
  onMoveOperation: (from: number, to: number, standalone?: boolean) => void;
  readPieceDrag: (dt: DataTransfer) => string;
  /** Каталог работ на весь рельс — одна подписка у владельца, отсюда в каждую строку. Обязателен,
   * как аргументы композитора: «рельс без каталога» — решение вызывателя, а не забытый проп. */
  workCatalog: WorkCatalog | undefined;
  /** Id строк (`fields[i].id`), чьё поле `draft` поднято: каркас записал, никто не проверил. */
  draftIds?: ReadonlySet<string>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const from = fields.findIndex((f) => f.id === active.id);
    if (from < 0) return;
    const dividerAt = over.data.current?.sequenceDividerAt;
    if (typeof dividerAt === 'number') {
      // `dividerAt` — адрес ДО удаления исходной строки. Если она стоит выше цели, удаление
      // сдвигает адрес на один; тот же расчёт держит края 0 / length настоящими целями.
      const to = Math.min(fields.length - 1, Math.max(0, dividerAt - (from < dividerAt ? 1 : 0)));
      onMoveOperation(from, to, true);
      return;
    }
    if (active.id === over.id) return;
    const to = fields.findIndex((f) => f.id === over.id);
    if (to < 0) return;
    onMoveOperation(from, to);
  };
  const unitNameByKey = new Map(
    [...headerBefore.values()].map(({ block }) => [
      block.key,
      unitDisplayName({ key: block.key, outputUnitName: block.name }),
    ]),
  );

  const startsUnheadedLooseRun = (index: number) =>
    grouped &&
    index > 0 &&
    looseSteps.has(index) &&
    !looseSteps.has(index - 1) &&
    !headerBefore.has(index);
  const startsStandaloneRun = (index: number) =>
    grouped && standaloneSteps.has(index) && (index === 0 || !standaloneSteps.has(index - 1));
  const hasDividerBefore = (index: number) =>
    grouped &&
    (index === 0 ||
      headerBefore.has(index) ||
      startsUnheadedLooseRun(index) ||
      startsStandaloneRun(index));
  // Разделители входят в геометрию сортировки, хотя сами не перетаскиваются. Иначе при наведении
  // на их id `SortableContext` получал `overIndex = -1`, снимал все transform и строки ниже
  // схлопывались обратно прямо под перетаскиваемым шагом.
  const sortableItems = fields.flatMap((field, index) =>
    hasDividerBefore(index) ? [sequenceDividerId(index), field.id] : [field.id],
  );
  if (grouped) sortableItems.push(sequenceDividerId(fields.length));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sequenceCollisionDetection}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
        <div className='@container flex flex-col' data-sequence-rail='1'>
          {fields.map((f, index) => {
            // У свободных шагов один псевдоблок, поэтому шапка стоит только у их первого прогона.
            // Каждый следующий прогон всё равно обязан закрыть чертой предыдущий настоящий блок.
            const startsLooseRun = startsUnheadedLooseRun(index);
            const startsStandalone = startsStandaloneRun(index);
            return (
              <Fragment key={f.id}>
                {hasDividerBefore(index) && (
                  <SequenceDivider at={index} visible={startsLooseRun || startsStandalone} />
                )}
                {grouped && headerBefore.has(index) && (
                  <UnitBlockHeader
                    block={headerBefore.get(index)!.block}
                    smv={headerBefore.get(index)!.smv}
                    terminal={headerBefore.get(index)!.terminal}
                    problemCount={
                      headerBefore
                        .get(index)!
                        .block.steps.filter((stepIndex) => problemIndices.has(stepIndex)).length
                    }
                    className='mt-0'
                    unitNameOf={(key) => unitNameByKey.get(key) ?? unitDisplayName({ key })}
                  />
                )}
                <RailStep
                  uid={f.id}
                  index={index}
                  selected={index === selectedIndex}
                  onSelect={() => onSelect(index)}
                  onNavigate={(nextIndex) => {
                    const next = Math.max(0, Math.min(fields.length - 1, nextIndex));
                    onSelect(next);
                  }}
                  ruleBelow={index < fields.length - 1 && !hasDividerBefore(index + 1)}
                  hasError={errorIndices.has(index)}
                  assemblyBroken={brokenSteps.has(index)}
                  activePin={activePin}
                  activeBom={activeBom}
                  pieceShapes={pieceShapes}
                  onHoverPin={onHoverPin}
                  onDropPiece={onDropPiece}
                  readPieceDrag={readPieceDrag}
                  workCatalog={workCatalog}
                  draft={draftIds?.has(f.id) ?? false}
                />
              </Fragment>
            );
          })}
          {grouped && <SequenceDivider at={fields.length} />}
        </div>
      </SortableContext>
    </DndContext>
  );
}
