import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
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
import { cn } from 'lib/utility';
import { Fragment, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import { SortableEntity } from '../../hero/components/sortable-entity';
import type { AssemblyBlock } from './assembly-blocks';
import { type FoundPiece } from './nesting/dxf-geometry';
import { operationHeading } from './operation-options';
import type { WorkCatalog } from './operation-work';
import { pieceRefKey } from './piece-block-refs';
import { PieceRef, useFormPieces } from './piece-picker';
import { PieceSilhouette, SILHOUETTE_INK } from './piece-silhouette';
import { TechCardFormData } from './schema';
import { UnitBlockHeader } from './unit-block';
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

const NONE_OP_TYPE = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';

// ДВЕ РАЗНЫЕ ВЕЩИ, А НЕ ОДНА В ДВУХ РАЗМЕРАХ.
//
// Там, где деталь ВЫБИРАЮТ (тарелка, состав шага), она — ПЛИТКА: квадрат 56px с формой и именем
// поверх (PieceTile). Имя уехало на картинку, поэтому место, которое раньше занимала подпись
// рядом, целиком отдано форме — при той же занятой полосе.
//
// В рельсе деталь не выбирают, там читают ПОРЯДОК: строка 26px, двадцать строк подряд, и заголовок
// шага уже называет детали словами. Плитке там места нет, поэтому остаётся глиф — но квадратный,
// чтобы полочка и пояс стояли в одной сетке, а не лесенкой.
const RAIL_GLYPH = `mr-0.5 size-4 ${SILHOUETTE_INK}`;
// Шаг может соединять и шесть деталей — тогда от заголовка не осталось бы ничего. Три силуэта
// отвечают на «про какой это узел», остальное досказывает заголовок: он перечисляет их все.
const RAIL_GLYPH_LIMIT = 3;

// ── the sequence rail ────────────────────────────────────────────────────────────────────────
// One 26px line per assembly step, so twenty operations read as an ORDER instead of as twenty
// screens of controls. Drag ⠿ to reorder; the row is a button that opens the step in the editor.
function RailStep({
  uid,
  index,
  selected,
  onSelect,
  hasError,
  assemblyBroken = false,
  activePin,
  activeBom,
  pieceShapes,
  onHoverPin,
  onDropPiece,
  readPieceDrag,
  workCatalog,
}: {
  uid: string;
  index: number;
  selected: boolean;
  onSelect: () => void;
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
   */
  workCatalog?: WorkCatalog;
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
  // The joined pieces, by name, for the composed heading. Resolved through the card's piece list so
  // a rename on the PATTERNS tab reaches every step that references it — which is what the removed
  // PlacementSync was trying to achieve by writing the names into the row.
  const pieceKeys = (useWatch({ control, name: `operations.${index}.inputKeys` }) ??
    []) as string[];
  const allPieces = useFormPieces();
  const linkedPieces = pieceKeys
    .map((k) => allPieces.find((pc) => pc.lineKey === k))
    .filter((p): p is PieceRef => !!p);
  const pieceNames = linkedPieces.map((p) => p.name);
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
  const smvMin = parseDecimalNumber(smv);
  // THE HEADING IS COMPOSED. This is the whole replacement for the removed «УЗЕЛ / ЧТО *»: the step
  // is named by what it does, where, and on which pieces — three controls the operator has already
  // filled — so two cards describing the same step read the same way.
  const label =
    operationHeading({
      operationType: opType as Parameters<typeof operationHeading>[0]['operationType'],
      machineType: machineType as common_TechCardMachineType,
      seamClass,
      work,
      workCatalog,
      zone: zone as Parameters<typeof operationHeading>[0]['zone'],
      pieceNames,
      note,
    }) || 'new step';
  // The cross-highlight mirrors the sketch pin, which fills error-red while it is the active one.
  const linked =
    (!!activePin && activePin > 0 && calloutNumber === activePin) ||
    (!!activeBom && bomLineKeys.includes(activeBom));

  return (
    <SortableEntity uid={uid}>
      {({ setNodeRef, style, dragHandleProps }) => (
        <div
          ref={setNodeRef}
          style={style}
          onMouseEnter={() => onHoverPin(calloutNumber > 0 ? calloutNumber : null)}
          onMouseLeave={() => onHoverPin(null)}
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
            'flex items-center gap-1 border bg-bgColor pr-1.5 transition-colors',
            hasError || assemblyBroken || linked
              ? 'border-error'
              : selected || over
                ? 'border-textColor'
                : 'border-borderColor hover:border-labelColor',
            selected && 'bg-bgZebra',
          )}
        >
          <button
            type='button'
            aria-label={`reorder step ${opNumber}`}
            {...dragHandleProps}
            className='shrink-0 cursor-grab touch-none select-none px-1 py-1 leading-none text-labelColor hover:text-textColor active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
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
            onClick={onSelect}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onSelect();
            }}
            aria-current={selected}
            title={label}
            // ТОЧНАЯ РУЧКА ДЛЯ ПРОБЫ ИМЕНИ. `title` уже несёт заголовок ЦЕЛИКОМ и отдельно от
            // номера, силуэтов и нормы времени, которые лежат в этом же узле; проба читает именно
            // его, потому что textContent строки склеил бы четыре разных факта в одну строку и
            // «имя не то» стало бы неотличимо от «номер не тот».
            data-rail-step={index}
            className='flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
          >
            <Text size='control' component='span' className='w-6 shrink-0 font-bold tabular-nums'>
              {opNumber}
            </Text>
            {glyphs.length > 0 && (
              <span className='flex shrink-0 items-center'>
                {glyphs.map((g) => (
                  <PieceSilhouette key={g.key} found={g.shape} boxClassName={RAIL_GLYPH} />
                ))}
              </span>
            )}
            <Text
              size='control'
              component='span'
              className={cn(
                'min-w-0 flex-1 truncate',
                opType === NONE_OP_TYPE && 'text-labelColor',
              )}
            >
              {label}
            </Text>
            {(hasError || assemblyBroken) && (
              <Text
                size='nano'
                variant='error'
                component='span'
                className='shrink-0 font-bold'
                // Тултип обязан называть ПРИЧИНУ. Раньше он говорил про незаполненное поле и
                // при нарушении сборки — то есть про другое, и уводил искать не туда.
                title={
                  assemblyBroken && !hasError
                    ? 'the step breaks the assembly: an input is not on the table at this step — open the step'
                    : 'the step has an unfilled required field'
                }
              >
                !
              </Text>
            )}
            {calloutNumber > 0 && (
              <Text
                size='nano'
                variant='label'
                component='span'
                className='shrink-0 tabular-nums'
                title={`pin #${calloutNumber} on the sketch`}
              >
                #{calloutNumber}
              </Text>
            )}
            <Text
              size='micro'
              variant='label'
              component='span'
              className='w-8 shrink-0 text-right tabular-nums'
              title='SMV, min'
            >
              {smvMin > 0 ? smvMin.toFixed(1) : '—'}
            </Text>
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
  selectedIndex,
  onSelect,
  errorIndices,
  brokenSteps,
  activePin,
  activeBom,
  pieceShapes,
  onHoverPin,
  onDropPiece,
  onMoveOperation,
  readPieceDrag,
  workCatalog,
}: {
  /**
   * Мета массива строк из `useFieldArray` владельца — СВОЕГО экземпляра здесь нет и быть не может.
   */
  fields: { id: string }[];
  /** Врезать ли шапки узлов: карточка размечена И вид — список. */
  grouped: boolean;
  /** Индекс шага → шапка блока, которую надо врезать ПЕРЕД ним (`useRailGrouping`). */
  headerBefore: Map<number, { block: AssemblyBlock; smv: string; terminal: boolean }>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  errorIndices: ReadonlySet<number>;
  /** Шаги, ломающие сборочный граф. */
  brokenSteps: ReadonlySet<number>;
  activePin: number | null;
  activeBom: string | null;
  pieceShapes: PieceShapeMap;
  onHoverPin: (n: number | null) => void;
  onDropPiece: (index: number, lineKey: string) => void;
  onMoveOperation: (from: number, to: number) => void;
  readPieceDrag: (dt: DataTransfer) => string;
  /** Каталог работ на весь рельс — одна подписка у владельца, отсюда в каждую строку. */
  workCatalog?: WorkCatalog;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    onMoveOperation(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        <div className='flex flex-col gap-0.5'>
          {fields.map((f, index) => (
            <Fragment key={f.id}>
              {grouped && headerBefore.has(index) && (
                <UnitBlockHeader
                  block={headerBefore.get(index)!.block}
                  smv={headerBefore.get(index)!.smv}
                  terminal={headerBefore.get(index)!.terminal}
                />
              )}
              <RailStep
                uid={f.id}
                index={index}
                selected={index === selectedIndex}
                onSelect={() => onSelect(index)}
                hasError={errorIndices.has(index)}
                assemblyBroken={brokenSteps.has(index)}
                activePin={activePin}
                activeBom={activeBom}
                pieceShapes={pieceShapes}
                onHoverPin={onHoverPin}
                onDropPiece={onDropPiece}
                readPieceDrag={readPieceDrag}
                workCatalog={workCatalog}
              />
            </Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
