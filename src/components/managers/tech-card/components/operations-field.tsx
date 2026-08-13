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
import { adminService } from 'api/api';
import { common_TechCardOperation } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useParams, useSearchParams } from 'react-router-dom';
import { Accordion } from 'ui/components/accordion';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row, RowTotal } from 'ui/components/row';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { fieldErrorSummary, revealField } from 'utils/field-errors';
import { SortableEntity } from '../../hero/components/sortable-entity';
import {
  attachmentOptions,
  operationHeading,
  operationTypeOptions,
  seamClassOptions,
  topstitchModeOptions,
  zoneOptions,
} from './operation-options';
import { OPERATION_TYPE_PREFERRED_KINDS, kindLabel } from './bom-kind';
import { type FoundPiece } from './nesting/dxf-geometry';
import { pieceRefKey } from './piece-block-refs';
import { PieceRef, useFormPieces } from './piece-picker';
import { PieceSilhouette } from './piece-silhouette';
import { TechCardFormData } from './schema';
import type { PieceShapeMap } from './use-piece-shapes';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';

const NONE_OP_TYPE = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';
const NONE_ZONE = 'TECH_CARD_GARMENT_ZONE_UNKNOWN';
const NONE_SEAM_CLASS = 'TECH_CARD_SEAM_CLASS_UNKNOWN';
const NONE_ATTACHMENT = 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN';
const NONE_TOPSTITCH = 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN';

// Drag payload for the piece tray. A private MIME type so a stray text drop from elsewhere can
// never be mistaken for a piece reference; the plain-text mirror (prefixed) is only a fallback for
// browsers that drop custom types, and every drop is validated against the declared pieces anyway.
const PIECE_DND_TYPE = 'application/x-grbpwr-piece';
const PIECE_DND_PREFIX = 'grbpwr-piece:';

// Keep a Radix select from ballooning when its selected option is long: clip the value span (the
// trigger's first child) with an ellipsis instead of letting the text wrap the control taller/wider.
const selectNoGrow = '[&>span:first-child]:min-w-0 [&>span:first-child]:truncate';

// ГЛИФ ДЕТАЛИ — ВЕДУЩАЯ МЕТКА ПРИ ИМЕНИ, а не замена имени, поэтому мерится не «читаемостью
// картинки», а строкой, рядом с которой стоит: 16px по высоте — ровно столько, сколько уже занимает
// сама строка текста, так что ни чип тарелки, ни 26-пиксельная строка рельса не подрастают. Ради
// картинки перестраивать полосу, которую оператор читает как ровный список, нельзя.
//
// `mr-0`: у чипа собственный `gap-1`, и дефолтный отступ силуэта сложился бы с ним в провал.
const CHIP_GLYPH = 'mr-0 h-4 w-6';
// В рельсе глиф ещё и уже: колонка 320px, а ведущие силуэты отъедают ширину у самого заголовка
// шага, который и называет детали словами.
const RAIL_GLYPH = 'mr-0.5 h-4 w-5';
// Шаг может соединять и шесть деталей — тогда от заголовка не осталось бы ничего. Три силуэта
// отвечают на «про какой это узел», остальное досказывает заголовок: он перечисляет их все.
const RAIL_GLYPH_LIMIT = 3;

// 1..4 rows of topstitching; 0 = unset. Past four it is decoration nobody sews and, more to the
// point, a typo that reaches the printed sheet as an instruction.
const TOPSTITCH_ROW_OPTIONS = [
  { value: 0, label: '— rows —' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

// The BOM sections an operation can CONSUME, in picker order. The rule is «чем соединяют», not
// «что соединяют»: roll goods (fabric / lining / insulation) reach a step through pieceLineKeys —
// they ARE the parts being joined — and packaging never reaches the sewing floor, it rides
// packaging_recipe. Interlining is the deliberate exception on the roll-goods side: fusing is
// consumed AT a fusing step.
//
// The store has NEVER filtered this — tech_card_operation_bom (0200) accepts any BOM line of the
// card, resolveBomRef checks nothing but the key, and the CONSTRUCTION digest already hashes
// bomLineKeys. The old thread+interlining pair was a client-side scope, and it was the only reason
// фурнитура / тесьма / декор / этикетки could not be attached to the step that consumes them.
const OPERATION_LINKABLE_SECTIONS = [
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
  'TECH_CARD_BOM_SECTION_LABEL',
];
const LINKABLE_SECTION_INDEX = new Map(OPERATION_LINKABLE_SECTIONS.map((s, i) => [s, i]));

// The lines that SHOULD end up on some step — the picker's set minus labels. A label reaches the
// garment through tech_card_label / the style assembly bill, so a label line attached to no
// operation is normal rather than an omission, and flagging it would train people to ignore the
// whole check.
export const OPERATION_EXPECTED_SECTIONS = new Set(
  OPERATION_LINKABLE_SECTIONS.filter((s) => s !== 'TECH_CARD_BOM_SECTION_LABEL'),
);

// A step whose verb names a material it does not link is almost always an omission. Kept to the two
// unambiguous verbs: BUTTON_ATTACH consumes a fastener, FUSING consumes fusible. BUTTONHOLE is
// deliberately absent — it consumes thread, which nearly every step does, so the check would fire
// as noise and stop being read.
const OPERATION_TYPE_EXPECTS: Record<string, { section: string; what: string }> = {
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: {
    section: 'TECH_CARD_BOM_SECTION_HARDWARE',
    what: 'фурнитуру',
  },
  TECH_CARD_OPERATION_TYPE_FUSING: {
    section: 'TECH_CARD_BOM_SECTION_INTERLINING',
    what: 'клеевую',
  },
};

// Short captions for the grouped picker. techCardBomSectionOptions carries the long disambiguating
// form («hardware (пуговицы / молнии / кнопки)») — right for a select, far too wide for a caption
// sitting above a row of chips.
const LINKABLE_SECTION_LABEL: Record<string, string> = {
  TECH_CARD_BOM_SECTION_HARDWARE: 'фурнитура',
  TECH_CARD_BOM_SECTION_THREAD: 'нитки',
  TECH_CARD_BOM_SECTION_INTERLINING: 'клеевые',
  TECH_CARD_BOM_SECTION_TRIM: 'тесьма / резинка',
  TECH_CARD_BOM_SECTION_DECORATION: 'декор',
  TECH_CARD_BOM_SECTION_LABEL: 'этикетки',
};

// A new step starts EMPTY on every override. Nothing is pre-filled from a preset any more: the
// moment a default is written into the row, «the technologist chose 4 st/cm» becomes
// indistinguishable from «it defaulted to 4», and the card stops being able to say which steps
// genuinely differ.
export const emptyOperation = {
  operationNumber: 0,
  operationType: NONE_OP_TYPE,
  zone: NONE_ZONE,
  calloutNumber: 0, // 0 = no sketch pin linked
  smv: '',
  seamClass: NONE_SEAM_CLASS,
  stitchesPerCm: '',
  seamAllowanceMm: '',
  topstitchMode: NONE_TOPSTITCH,
  topstitchWidthMm: '',
  topstitchRows: 0,
  attachmentKind: NONE_ATTACHMENT,
  attachmentSizeMm: '',
  note: '',
  pieceLineKeys: [] as string[],
  bomLineKeys: [] as string[],
};

type OperationFormValue = NonNullable<TechCardFormData['operations']>[number];

// #66: AI generation is unavailable when the backend has no OPENROUTER_API_KEY configured — the
// RPC reports this as FailedPrecondition (grpc-gateway → HTTP 412, same convention as
// useSamples.ts / useProductionRuns.ts). Shown verbatim so a technologist knows this is an admin
// setup gap, not something wrong with their description.
const AI_NOT_CONFIGURED_MESSAGE =
  "AI generation isn't configured yet — ask an admin to set OPENROUTER_API_KEY";

// The «— тип —» placeholder is an option label, not a name: read back as a heading it says nothing,
// so an untyped operation reports empty and the caller supplies its own wording.
const opTypeLabel = (v: string | undefined) =>
  !v || v === NONE_OP_TYPE ? '' : operationTypeOptions.find((o) => o.value === v)?.label ?? '';

// Maps one AI-drafted operation (GenerateTechCardOperations, #66) into this field array's row
// shape — the same fields the manual «+ операция» row starts from (emptyOperation). Only stages
// the row into the form; operationNumber stays positional (recomputed on save like every other
// row, never trusted from the model) and nothing here is persisted until the technologist accepts
// the draft and saves the card through the normal flow.
function mapGeneratedOperationToForm(o: common_TechCardOperation): OperationFormValue {
  return {
    operationNumber: 0,
    operationType: o.operationType || NONE_OP_TYPE,
    zone: o.zone || NONE_ZONE,
    bomLineKeys: (o.bomLineKeys ?? []).filter(Boolean),
    pieceLineKeys: (o.pieceLineKeys ?? []).filter(Boolean),
    calloutNumber: o.calloutNumber || 0,
    smv: decimalToInput(o.smv),
    seamClass: o.seamClass || NONE_SEAM_CLASS,
    stitchesPerCm: decimalToInput(o.stitchesPerCm),
    seamAllowanceMm: decimalToInput(o.seamAllowanceMm),
    topstitchMode: o.topstitch?.mode || NONE_TOPSTITCH,
    topstitchWidthMm: decimalToInput(o.topstitch?.widthMm),
    topstitchRows: o.topstitch?.rows || 0,
    attachmentKind: o.attachmentKind || NONE_ATTACHMENT,
    attachmentSizeMm: decimalToInput(o.attachmentSizeMm),
    note: o.note?.trim() || '',
  };
}

type PickerOption = { value: number; label: string };
// materialId is the SLOT DEFAULT article. It is read from the form (not from the card read) so an
// article picked on the BOM tab and not yet saved still resolves here.
type BomLine = {
  lineKey?: string;
  name?: string;
  section?: string;
  materialId?: number;
  kind?: string;
};

// What each colourway actually takes for a slot. The operation links the SLOT («основная молния»);
// the article is per colourway, so this is the read-side join that makes «в разных колорвеях разная
// фурнитура» visible on the step instead of only on the colorways tab.
export type ColorwayArticles = {
  // one entry per live colourway, in card order
  colorways: {
    label: string;
    // BOM line_key → the pins on that colourway's usages of the slot (0 / absent = inherit the
    // slot default). A key MISSING from the map means this colourway's recipe does not use the
    // slot at all — a different statement from «uses it with no article», and shown as such.
    pinsByLineKey: Map<string, number[]>;
  }[];
  materialNameById: Map<number, string>;
};

// Mirrors the server's entity.EffectiveMaterialId (internal/entity/techcard.go): the colourway pin
// wins, else the slot default, else 0 = no article at all. Same rule as colorway-recipe.tsx's
// effectiveMaterialId, which resolves it over that file's own draft/slot types — deliberately not
// shared, because importing the recipe editor's types into the construction tab would couple a
// read-only display to an editor's staging model. If one of the two changes, both must.
function effectiveArticleId(pin: number, slotDefault: number): number {
  return pin > 0 ? pin : slotDefault > 0 ? slotDefault : 0;
}

// One colourway's answer for a slot, as it reads on the step. A colourway can carry BOTH a resolved
// article and a hole (two usages of the same slot, one pinned and one with no article anywhere), so
// the two are printed together rather than the hole hiding the article or the reverse.
function colorwayArticleText(c: {
  inRecipe: boolean;
  missing: boolean;
  articles: string[];
}): string {
  if (!c.inRecipe) return 'не в рецепте';
  if (!c.missing) return c.articles.join(' / ');
  return c.articles.length > 0 ? `${c.articles.join(' / ')} + нет артикула` : 'нет артикула';
}

// Reads a drag payload back as a piece lineKey — the private MIME type first, the prefixed
// text/plain mirror as the fallback. Returns '' for anything that isn't ours.
function readPieceDrag(dt: DataTransfer): string {
  const raw = dt.getData(PIECE_DND_TYPE) || dt.getData('text/plain');
  if (!raw) return '';
  return raw.startsWith(PIECE_DND_PREFIX) ? raw.slice(PIECE_DND_PREFIX.length) : raw;
}

// ── derived-state leaves ─────────────────────────────────────────────────────────────────────
// Both of these watch the WHOLE operations array, which changes on every keystroke anywhere in the
// section. They render nothing (or one line), so the re-render stops at them instead of running
// through the rail and the editor — the same discipline readReplaceImpact uses.

// PlacementSync lived here and is gone with the column it fed. It derived `placement` from the
// linked piece names and WROTE IT INTO THE ROW — a computed value stored as a fact, hashed into a
// signed digest, and printed beside the very pieces it was derived from. The zone dictionary now
// answers «where», and the piece chips answer «on what».

function RailTotal() {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as OperationFormValue[];
  // ONE total, because there is one time column. The rail used to sum SAM and SMV separately and
  // then explain, under both, that they legitimately differ — an explanation only needed because
  // the form asked for the same fact twice.
  const total = operations.reduce((acc, o) => {
    const n = parseDecimalNumber(o?.smv);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  return (
    <RowTotal
      label={
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          total · {operations.length}
        </Text>
      }
      value={
        <Text size='micro' component='span' title='sum of SMV across the assembly order'>
          {`${total.toFixed(1)} min`}
        </Text>
      }
    />
  );
}

// ── piece tray ───────────────────────────────────────────────────────────────────────────────
// Wiring 14 operations to their pieces used to mean opening 14 popovers. The tray puts every
// DECLARED piece on one strip: drag a chip onto a step in the rail, or — the keyboard and touch
// path, which is not optional — click it and it lands on the step currently open in the editor.
function TrayChip({
  piece,
  shape,
  onAdd,
  highlighted = false,
}: {
  piece: PieceRef;
  /** Контур детали из общего разбора; null — привязки нет, кэш холодный или разбор не заказан. */
  shape: FoundPiece | null;
  onAdd: () => void;
  highlighted?: boolean;
}) {
  return (
    <Chip
      onClick={onAdd}
      draggable
      title={`${piece.name} — кликните, чтобы добавить к открытому шагу, или перетащите на любой`}
      aria-label={`add piece ${piece.name} to the open step`}
      onDragStart={(e: React.DragEvent) => {
        e.dataTransfer.setData(PIECE_DND_TYPE, piece.lineKey);
        e.dataTransfer.setData('text/plain', `${PIECE_DND_PREFIX}${piece.lineKey}`);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={cn(
        'cursor-grab active:cursor-grabbing',
        // flashed by the editor's «＋ piece» — pull the eye to the chips now clickable. The border
        // and fill carry the state on their own, so the pulse is pure decoration and is dropped for
        // anyone who asked for less motion.
        highlighted && 'motion-safe:animate-pulse border-textColor bg-bgZebra text-textColor',
      )}
    >
      <PieceSilhouette found={shape} boxClassName={CHIP_GLYPH} />
      {piece.name}
    </Chip>
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
  hasError,
  activePin,
  activeBom,
  pieceShapes,
  onHoverPin,
  onDropPiece,
}: {
  uid: string;
  index: number;
  selected: boolean;
  onSelect: () => void;
  hasError: boolean;
  activePin?: number | null;
  activeBom?: string | null;
  /** Контуры деталей карточки, одной стабильной картой на весь рельс (см. use-piece-shapes). */
  pieceShapes: PieceShapeMap;
  onHoverPin: (n: number | null) => void;
  onDropPiece: (index: number, lineKey: string) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const opType = (useWatch({ control, name: `operations.${index}.operationType` }) ?? '') as string;
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
  const pieceKeys = (useWatch({ control, name: `operations.${index}.pieceLineKeys` }) ??
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
            hasError || linked
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
          <button
            type='button'
            onClick={onSelect}
            aria-current={selected}
            title={label}
            className='flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
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
            {hasError && (
              <Text
                size='nano'
                variant='error'
                component='span'
                className='shrink-0 font-bold'
                title='в шаге есть незаполненное обязательное поле'
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
                title={`пин #${calloutNumber} на эскизе`}
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
          </button>
        </div>
      )}
    </SortableEntity>
  );
}

// ── the step editor ──────────────────────────────────────────────────────────────────────────
// The whole sewing spec for ONE step. Remounted (keyed on the field id) whenever the selection
// moves, so the "skip the first run" guards below start clean and selecting a step never dirties
// the form.
function OperationEditor({
  index,
  bomLines,
  pieces,
  pieceShapes,
  pinOptions,
  colorwayArticles,
  onInsertAfter,
  onRemove,
  onFlashPieces,
  onActiveBomChange,
  onDropPiece,
}: {
  index: number;
  bomLines: BomLine[];
  pieces: PieceRef[];
  /** Контуры деталей карточки — та же карта, что у рельса и у тарелки. */
  pieceShapes: PieceShapeMap;
  pinOptions: PickerOption[];
  colorwayArticles?: ColorwayArticles;
  onInsertAfter: () => void;
  onRemove: () => void;
  onFlashPieces: () => void;
  onActiveBomChange?: (k: string | null) => void;
  onDropPiece: (index: number, lineKey: string) => void;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const opNumber = (index + 1) * 10;
  const opType = (useWatch({ control, name: `operations.${index}.operationType` }) ?? '') as string;
  const calloutNumber = (useWatch({ control, name: `operations.${index}.calloutNumber` }) ??
    0) as number;
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [over, setOver] = useState(false);

  // The overrides fold. Open when the step already differs — a folded panel hiding a value the
  // operator set is worse than an open one showing nothing.
  const zoneValue = (useWatch({ control, name: `operations.${index}.zone` }) ?? '') as string;
  const noteValue = (useWatch({ control, name: `operations.${index}.note` }) ?? '') as string;
  const seamClass = (useWatch({ control, name: `operations.${index}.seamClass` }) ??
    NONE_SEAM_CLASS) as string;
  const seamAllowanceMm = (useWatch({ control, name: `operations.${index}.seamAllowanceMm` }) ??
    '') as string;
  const stitchesPerCm = (useWatch({ control, name: `operations.${index}.stitchesPerCm` }) ??
    '') as string;
  const topstitchMode = (useWatch({ control, name: `operations.${index}.topstitchMode` }) ??
    NONE_TOPSTITCH) as string;
  const attachmentKind = (useWatch({ control, name: `operations.${index}.attachmentKind` }) ??
    NONE_ATTACHMENT) as string;
  const overrideCount = [
    seamClass !== NONE_SEAM_CLASS,
    seamAllowanceMm.trim() !== '',
    stitchesPerCm.trim() !== '',
    topstitchMode !== NONE_TOPSTITCH,
    attachmentKind !== NONE_ATTACHMENT,
  ].filter(Boolean).length;
  const [overridesOpen, setOverridesOpen] = useState(overrideCount > 0);

  // HIDING A CONTROL MUST ALSO CLEAR IT. Both fields below are rendered conditionally, and the save
  // rejects a value that its owner no longer admits — a width beside «edge», a size with no
  // attachment. Without this, typing a width and then switching to «edge» leaves the number in the
  // form, hides the input that holds it, and blocks the save demanding the operator clear a field
  // that is not on screen.
  useEffect(() => {
    if (topstitchMode !== 'TECH_CARD_TOPSTITCH_MODE_WIDTH') {
      if ((getValues(`operations.${index}.topstitchWidthMm`) ?? '') !== '') {
        setValue(`operations.${index}.topstitchWidthMm`, '', { shouldDirty: true });
      }
      if (getValues(`operations.${index}.topstitchRows`)) {
        setValue(`operations.${index}.topstitchRows`, 0, { shouldDirty: true });
      }
    }
  }, [topstitchMode, index, getValues, setValue]);

  useEffect(() => {
    if (
      attachmentKind === NONE_ATTACHMENT &&
      (getValues(`operations.${index}.attachmentSizeMm`) ?? '') !== ''
    ) {
      setValue(`operations.${index}.attachmentSizeMm`, '', { shouldDirty: true });
    }
  }, [attachmentKind, index, getValues, setValue]);

  // WHAT THIS STEP WOULD INHERIT, and from where — shown as a placeholder, stored nowhere. The
  // card's own standard wins over the workshop's, exactly as the server resolves it.
  const cardAllowanceMm = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? '') as string;
  const cardStitchDensity = (useWatch({ control, name: 'construction.defaultStitchesPerCm' }) ??
    '') as string;
  const { data: workshop } = useWorkshopSettings();
  const shopAllowanceMm = decimalToInput(workshop?.settings?.defaultSeamAllowanceMm).trim();
  const inherited = {
    seamAllowance: cardAllowanceMm.trim()
      ? `${cardAllowanceMm.trim()} (card)`
      : shopAllowanceMm
        ? `${shopAllowanceMm} (workshop)`
        : 'not set',
    stitchDensity: cardStitchDensity.trim() ? `${cardStitchDensity.trim()} (card)` : 'not set',
  };

  // The off-part materials this operation consumes. Multi, because one operation genuinely joins
  // several — «втачать молнию» takes the zip AND the thread. Scoped to the sections that can be
  // consumed BY a step (see OPERATION_LINKABLE_SECTIONS), sorted into that same order so фурнитура
  // leads and the list reads as a spec rather than as the BOM's own ordering.
  const selectedBomKeys = (useWatch({
    control,
    name: `operations.${index}.bomLineKeys`,
  }) ?? []) as string[];
  const linkableBoms = useMemo(
    () =>
      bomLines
        .filter((b) => LINKABLE_SECTION_INDEX.has(b.section ?? ''))
        .sort(
          (a, b) =>
            (LINKABLE_SECTION_INDEX.get(a.section ?? '') ?? 0) -
            (LINKABLE_SECTION_INDEX.get(b.section ?? '') ?? 0),
        ),
    [bomLines],
  );
  // The BOM thread list that used to live here fed a «нитки (артикул)» combo. Both are gone: the
  // thread an operation consumes IS the material chip, and the combo was a second answer that the
  // printed sheet then had to subtract from the first.
  const toggleBom = (key: string) => {
    const next = selectedBomKeys.includes(key)
      ? selectedBomKeys.filter((k) => k !== key)
      : [...selectedBomKeys, key];
    setValue(`operations.${index}.bomLineKeys`, next, { shouldDirty: true });
  };

  const selectedPieceKeys = (useWatch({
    control,
    name: `operations.${index}.pieceLineKeys`,
  }) ?? []) as string[];
  const byKey = useMemo(() => new Map(pieces.map((p) => [p.lineKey, p])), [pieces]);
  const chosenPieces = selectedPieceKeys.filter((k) => byKey.has(k));
  // The same composed heading the rail shows, so the open step and its row in the list are named
  // identically — they used to differ, because the rail fell back to the type while the editor
  // header printed only the type and the row printed `node`.
  const editorHeading =
    operationHeading({
      operationType: opType as Parameters<typeof operationHeading>[0]['operationType'],
      zone: zoneValue as Parameters<typeof operationHeading>[0]['zone'],
      pieceNames: chosenPieces.map((k) => byKey.get(k)?.name ?? '').filter(Boolean),
      note: noteValue,
    }) || 'new step';
  // A key that no longer resolves (its piece was deleted on the PATTERNS tab, or an older card
  // invented one through the removed picker) is SURFACED, not silently dropped — the save would
  // unlink it and nobody would know which operation lost a part.
  const danglingPieces = selectedPieceKeys.filter((k) => !byKey.has(k));
  const removePieceKey = (lineKey: string) => {
    const next = selectedPieceKeys.filter((k) => k !== lineKey);
    setValue(`operations.${index}.pieceLineKeys`, next, { shouldDirty: true });
  };

  // The chip row IS the material link. The legacy single `bomLineKey` went with the break — it
  // asked the same question with room for one answer, and an operation genuinely takes several.
  const linkedMaterials = selectedBomKeys
    .map((k) => bomLines.find((b) => b.lineKey === k))
    .filter(Boolean) as BomLine[];
  const bomOutOfRange = selectedBomKeys.length > linkedMaterials.length;
  const unlinkedBoms = linkableBoms.filter((b) => !selectedBomKeys.includes(b.lineKey ?? ''));
  // Grouped for the reveal: six sections in one flat pile would read as undifferentiated, and
  // «нитки основных швов» sitting next to «основная молния» invites the wrong pick. linkableBoms is
  // already sorted into section order, so a Map keeps the groups in that order too. Not memoised on
  // purpose — unlinkedBoms is a fresh array every render, so a useMemo over it would recompute
  // anyway while costing a dependency that lies about being stable.
  //
  // Within that, ЧТО ЭТО ЗА ПОЗИЦИЯ (0278) does the actual suggesting: a BUTTON_ATTACH step offers
  // buttons and snaps before the rest of the фурнитура, and the group holding them leads. This only
  // ever REORDERS — never filters — so a step that genuinely takes something unexpected is one
  // glance further down rather than unreachable, and a card whose lines carry no kind yet reads
  // exactly as it did before.
  const preferredKinds = new Set<string>(OPERATION_TYPE_PREFERRED_KINDS[opType] ?? []);
  const isPreferred = (b: BomLine) => !!b.kind && preferredKinds.has(b.kind);
  const unlinkedBySection = (() => {
    const groups = new Map<string, BomLine[]>();
    for (const b of unlinkedBoms) {
      const section = b.section ?? '';
      const bucket = groups.get(section);
      if (bucket) bucket.push(b);
      else groups.set(section, [b]);
    }
    for (const lines of groups.values()) {
      lines.sort((a, b) => Number(isPreferred(b)) - Number(isPreferred(a)));
    }
    return Array.from(groups.entries()).sort(
      ([, a], [, b]) => Number(b.some(isPreferred)) - Number(a.some(isPreferred)),
    );
  })();

  // Which article each colourway actually takes for the slots this step consumes. THE reason the
  // link is worth having: the operation names the role and stays colourway-agnostic, so without
  // this a technologist reading the step cannot tell that BLK takes an antique-brass zip where
  // BONE takes silver. Resolution mirrors the server (pin → slot default → none).
  //
  // Not memoised, for the same reason as unlinkedBySection above: linkedMaterials is rebuilt on
  // every render, so a useMemo keyed on it would recompute anyway while claiming a stability it
  // does not have.
  // «Пришить кнопки», у которых не привязана ни одна кнопка. Checked against the LINKED lines, so
  // it clears the moment the operator picks one.
  const expects = OPERATION_TYPE_EXPECTS[opType];
  const expectsMaterial =
    expects && !linkedMaterials.some((b) => b.section === expects.section) ? expects : null;

  const colorways = colorwayArticles?.colorways ?? [];
  // No usage on ANY colourway means there is no recipe to report — not that every slot is unused.
  // A card read that is still refetching looks exactly like this, and printing «не используется ни
  // в одном рецепте» from it would be a confident negative asserted from missing data.
  const hasRecipeData = colorways.some((cw) => cw.pinsByLineKey.size > 0);
  const slotArticles = !hasRecipeData
    ? []
    : linkedMaterials.map((line) => {
        const key = line.lineKey ?? '';
        const slotDefault = line.materialId ?? 0;
        const articleName = (id: number) => colorwayArticles?.materialNameById.get(id) ?? `#${id}`;
        const perColorway = colorways.map((cw) => {
          const pins = cw.pinsByLineKey.get(key);
          // No usage at all ≠ a usage with no article. The first says this colourway's recipe never
          // asks for the slot, the second is a production blocker; conflating them would either
          // invent a missing article or hide a real one.
          if (!pins) {
            return { label: cw.label, ids: [] as number[], inRecipe: false, missing: false };
          }
          const ids = Array.from(new Set(pins.map((pin) => effectiveArticleId(pin, slotDefault))));
          return {
            label: cw.label,
            ids: ids.filter((id) => id > 0),
            inRecipe: true,
            missing: ids.some((id) => id === 0),
          };
        });
        const inRecipe = perColorway.filter((c) => c.inRecipe);
        // Compared by ID, never by name: two catalog articles can legitimately share a name (the
        // same zip stocked from two suppliers), and folding them together would assert that two
        // colourways take the same physical article when they do not.
        const distinctIds = new Set(inRecipe.flatMap((c) => c.ids));
        return {
          lineKey: key,
          name: line.name?.trim() || 'unnamed',
          perColorway: perColorway.map((c) => ({ ...c, articles: c.ids.map(articleName) })),
          usedAnywhere: inRecipe.length > 0,
          // «Same everywhere» has to mean EVERY colourway, not merely every colourway that happens
          // to carry the slot. A zip that exists only in BLK's recipe is the single most important
          // thing this line can say, and collapsing it to «основная молния → YKK» says the opposite
          // — that all three colourways take it — while nothing is bought for the other two.
          uniform:
            inRecipe.length === colorways.length &&
            distinctIds.size === 1 &&
            !inRecipe.some((c) => c.missing),
          uniformArticle: distinctIds.size === 1 ? articleName(Array.from(distinctIds)[0]) : '',
        };
      });

  // A pin that no longer resolves (its callout was deleted on the sketch tab) keeps a visible,
  // re-selectable option instead of reading as «— пин —» — the same defensive fallback the issues
  // list uses for a removed operation.
  const rowPinOptions = useMemo(() => {
    if (!calloutNumber || pinOptions.some((o) => o.value === calloutNumber)) return pinOptions;
    return [
      ...pinOptions,
      { value: calloutNumber, label: `#${calloutNumber} — not found (removed?)` },
    ];
  }, [pinOptions, calloutNumber]);

  // THE PRESET EFFECT AND THE THREAD AUTO-FILL BOTH LIVED HERE, and both are gone.
  //
  // One wrote the operation type's machine and stitch density into the row whenever those were
  // blank; the other copied the linked BOM line's name into `thread`. Between them they are why the
  // printed tech pack had to SUBTRACT the thread from the material list to stop printing it twice,
  // and why nobody could tell a density the technologist chose from one that simply appeared.
  //
  // What replaces them is a PLACEHOLDER: the inherited value is shown, never stored.

  return (
    <div
      onDragEnter={(e: React.DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
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
        'min-w-0 flex-1 border bg-bgColor p-3 transition-colors',
        over ? 'border-textColor' : 'border-borderColor',
      )}
    >
      <div className='mb-2.5 flex flex-wrap items-center gap-2 border-b border-borderColor pb-1'>
        <Text size='default' component='h4' className='font-bold tabular-nums'>
          {opNumber}
        </Text>
        <Text size='control' variant='uppercase' tracking='label' component='span'>
          {editorHeading}
        </Text>
        <div className='ml-auto flex shrink-0 items-center gap-1.5'>
          <Button type='button' variant='secondary' size='xs' onClick={onInsertAfter}>
            ＋ step below
          </Button>
          <Button type='button' variant='secondary' size='xs' onClick={onRemove}>
            remove step
          </Button>
        </div>
      </div>

      {/* THE CORE, and it is all of it: what the step does, where, and how long it takes. Six
          controls where there were eighteen. The pieces and materials below are the other half of
          «with what»; everything else is an override that stays folded away until it differs. */}
      <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
        <SelectField
          name={`operations.${index}.operationType`}
          label='operation *'
          items={operationTypeOptions}
          className={selectNoGrow}
        />
        <SelectField
          name={`operations.${index}.zone`}
          label='zone *'
          items={zoneOptions}
          className={selectNoGrow}
        />
        <DecimalField
          name={`operations.${index}.smv`}
          label='time, min'
          placeholder='1.8'
          min={0}
        />
        <SelectField
          name={`operations.${index}.calloutNumber`}
          label='sketch pin'
          items={rowPinOptions}
          valueAsNumber
          className={selectNoGrow}
        />
      </div>

      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span'>
            click a piece in the tray to add it
          </Text>
        }
      >
        pieces this step joins
      </GroupLabel>
      <ChipRow>
        {chosenPieces.map((k) => (
          <Chip key={k} title={byKey.get(k)?.name} onRemove={() => removePieceKey(k)}>
            <PieceSilhouette
              found={pieceShapes?.get(pieceRefKey(k)) ?? null}
              boxClassName={CHIP_GLYPH}
            />
            {byKey.get(k)?.name}
          </Chip>
        ))}
        {/* Сирота (деталь удалили на PATTERNS) остаётся ТОЛЬКО красным чипом: рисовать ей силуэт
            значило бы показать живую форму у ссылки, которая на сохранении оборвётся. */}
        {danglingPieces.map((k) => (
          <Chip
            key={k}
            tone='error'
            title={`piece ${k} was deleted on the patterns tab — the link is lost on save`}
            onRemove={() => removePieceKey(k)}
          >
            {`#${k.slice(-6)} — piece deleted`}
          </Chip>
        ))}
        <Chip dashed onClick={onFlashPieces} title='pick a piece from the tray above the list'>
          ＋ piece
        </Chip>
      </ChipRow>
      {chosenPieces.length === 0 && danglingPieces.length === 0 && (
        <Text size='micro' variant='label' className='mt-1'>
          not linked to any piece — click one in the tray above, or drag it here
        </Text>
      )}

      <GroupLabel>materials this step consumes</GroupLabel>
      {linkableBoms.length === 0 ? (
        <Text size='micro' variant='label'>
          the BOM has no materials a step could consume — add hardware, thread, fusing, tape, trim
          or labels on the BOM tab
        </Text>
      ) : (
        <>
          <ChipRow>
            {/* These are what IS linked, not a choice inside a set, so they read as plain chips
                with a remove — an ink fill here would claim a selection state nothing contrasts
                against. */}
            {linkedMaterials.map((b) => (
              <Chip
                key={b.lineKey}
                // The kind when the line carries one — «молния» says more than «фурнитура» — and the
                // section as the fallback for every line not classified yet.
                title={kindLabel(b.kind) ?? LINKABLE_SECTION_LABEL[b.section ?? ''] ?? undefined}
                onRemove={() => toggleBom(b.lineKey ?? '')}
                onMouseEnter={() => onActiveBomChange?.(b.lineKey ?? null)}
                onMouseLeave={() => onActiveBomChange?.(null)}
              >
                {b.name?.trim() || 'unnamed'}
              </Chip>
            ))}
            {unlinkedBoms.length > 0 && (
              <Chip
                dashed
                pressed={addingMaterial}
                onClick={() => setAddingMaterial((v) => !v)}
                title='link a BOM material — hardware, thread, fusing, tape, trim, label'
              >
                {addingMaterial ? '✕ cancel' : '＋ material'}
              </Chip>
            )}
          </ChipRow>
          {/* The article each colourway resolves the slot to. Printed under the chips rather than
              inside them: the chip is the ROLE (the durable thing the step links), and folding a
              per-colourway article into it would claim the operation itself is colourway-specific. */}
          {slotArticles.map((slot, i) => (
            // Indexed key: toggleBom dedupes, but the AI-accept path and the save mapper do not, so
            // a persisted duplicate line key would otherwise collide here.
            <Text key={`${slot.lineKey}:${i}`} size='micro' variant='label' className='mt-1'>
              {slot.name} →{' '}
              {!slot.usedAnywhere
                ? 'слот не используется ни в одном рецепте колорвея'
                : slot.uniform
                  ? slot.uniformArticle
                  : slot.perColorway
                      .map((c) => `${c.label}: ${colorwayArticleText(c)}`)
                      .join(' · ')}
            </Text>
          ))}
          {addingMaterial && unlinkedBySection.length > 0 && (
            <div className='mt-1.5 space-y-1.5'>
              {unlinkedBySection.map(([section, lines]) => (
                <div key={section}>
                  <Text size='micro' variant='label'>
                    {LINKABLE_SECTION_LABEL[section] ?? section}
                  </Text>
                  <ChipRow>
                    {lines.map((b) => (
                      <Chip
                        key={b.lineKey}
                        onClick={() => {
                          toggleBom(b.lineKey ?? '');
                          if (unlinkedBoms.length === 1) setAddingMaterial(false);
                        }}
                      >
                        {b.name?.trim() || 'unnamed'}
                      </Chip>
                    ))}
                  </ChipRow>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {bomOutOfRange && (
        <Text size='micro' variant='error' className='mt-1'>
          the material was removed or moved — pick it again
        </Text>
      )}
      {/* Advisory, never a form error: a step CAN legitimately be drafted before its material
          exists in the BOM, and blocking the save would make the check the operator's enemy. */}
      {expectsMaterial && (
        <Text size='micro' variant='label' className='mt-1'>
          a step of this type usually consumes {expectsMaterial.what} — none is linked
        </Text>
      )}

      {/* DIFFERS FROM STANDARD — folded away, and empty on most steps. Everything in here inherits
          from the card when left blank, and the placeholder states WHAT it would inherit and FROM
          WHERE. The inherited value is never written into the field: that is the whole difference
          between «the technologist chose 4 st/cm» and «it defaulted to 4», and the old preset
          effect destroyed it on every row it touched. */}
      <Accordion
        open={overridesOpen}
        onOpenChange={setOverridesOpen}
        title={
          <Text size='control' variant='uppercase' tracking='label' component='span'>
            differs from standard
          </Text>
        }
        meta={
          overrideCount > 0 ? (
            <Pill tone='attention'>{overrideCount}</Pill>
          ) : (
            <Text size='micro' variant='label' component='span'>
              inherits everything
            </Text>
          )
        }
      >
        <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
          <SelectField
            name={`operations.${index}.seamClass`}
            label='seam class'
            items={seamClassOptions}
            className={selectNoGrow}
          />
          <DecimalField
            name={`operations.${index}.seamAllowanceMm`}
            label='seam allowance, mm'
            maxDecimals={1}
            placeholder={inherited.seamAllowance}
          />
          <DecimalField
            name={`operations.${index}.stitchesPerCm`}
            label='stitches / cm'
            placeholder={inherited.stitchDensity}
          />
          <SelectField
            name={`operations.${index}.topstitchMode`}
            label='topstitch'
            items={topstitchModeOptions}
            className={selectNoGrow}
          />
          {/* The width belongs to «at width» and nowhere else — beside «edge» it is a shadow value
              the server refuses anyway, so the control simply is not there. */}
          {topstitchMode === 'TECH_CARD_TOPSTITCH_MODE_WIDTH' && (
            <>
              <DecimalField
                name={`operations.${index}.topstitchWidthMm`}
                label='topstitch width, mm'
                maxDecimals={1}
                placeholder='6'
              />
              <SelectField
                name={`operations.${index}.topstitchRows`}
                label='rows'
                items={TOPSTITCH_ROW_OPTIONS}
                valueAsNumber
                className={selectNoGrow}
              />
            </>
          )}
          <SelectField
            name={`operations.${index}.attachmentKind`}
            label='attachment'
            items={attachmentOptions}
            className={selectNoGrow}
          />
          {attachmentKind !== NONE_ATTACHMENT && (
            <DecimalField
              name={`operations.${index}.attachmentSizeMm`}
              label='attachment size, mm'
              maxDecimals={1}
              placeholder='8'
            />
          )}
        </div>
      </Accordion>

      {/* ONE free-text box, not two. `description` and `note` used to sit side by side with no rule
          saying which was which, so two cards filled them the opposite way round. */}
      <div className='mt-2'>
        <TextareaField name={`operations.${index}.note`} label='note' rows={2} maxLength={1000} />
      </div>
    </div>
  );
}

type ReplaceImpact = { operations: number; sam: number; pieceLinks: number };

// #66: draft assembly operations from a plain-language description — «мы описываем все операции
// словами (у нас есть знания о деталях/BOM), через OpenRouter генерируем структурированные
// операции, технолог проверит». Collapsed by default: an optional accelerant next to the manual
// «+ операция» flow, not a replacement for it. Never persists on its own — a successful generation
// only stages a DRAFT for review; the technologist explicitly appends or replaces it into the
// real (editable) operations list below, then saves through the normal tech-card save.
//
// «заменить весь список» now states its price before it is paid: the pick kept this panel, it did
// not ask to keep it dangerous.
function GenerateOperationsPanel({
  techCardId,
  hasExistingOperations,
  readReplaceImpact,
  onAccept,
}: {
  techCardId?: number;
  hasExistingOperations: boolean;
  // Counted at the moment the button is pressed rather than watched continuously — this panel does
  // not need to re-render on every keystroke in the 14 operations above it.
  readReplaceImpact: () => ReplaceImpact;
  onAccept: (operations: common_TechCardOperation[], mode: 'append' | 'replace') => void;
}) {
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [impact, setImpact] = useState<ReplaceImpact | null>(null);
  const [draft, setDraft] = useState<{
    operations: common_TechCardOperation[];
    model?: string;
    notes?: string;
  } | null>(null);

  const generate = async () => {
    if (!techCardId || !description.trim() || generating) return;
    setGenerating(true);
    setError('');
    setDraft(null);
    try {
      const res = await adminService.GenerateTechCardOperations({
        techCardId,
        description: description.trim(),
      });
      const operations = res.operations ?? [];
      if (operations.length === 0) {
        setError('AI не вернул ни одной операции — уточните описание и попробуйте снова');
      } else {
        setDraft({ operations, model: res.model, notes: res.notes });
      }
    } catch (e) {
      const status = (e as { status?: number } | undefined)?.status;
      setError(
        status === 412
          ? AI_NOT_CONFIGURED_MESSAGE
          : fieldErrorSummary(e, 'Не удалось сгенерировать операции'),
      );
    } finally {
      setGenerating(false);
    }
  };

  const accept = (mode: 'append' | 'replace') => {
    if (!draft) return;
    onAccept(draft.operations, mode);
    setDraft(null);
    setDescription('');
  };

  return (
    <>
      <Accordion
        title={
          <Text size='control' variant='uppercase' tracking='label' component='span'>
            generate operations from description (ai)
          </Text>
        }
        meta={
          draft ? (
            <Pill tone='attention'>{`draft: ${draft.operations.length}`}</Pill>
          ) : (
            <Text size='micro' variant='label' component='span'>
              черновик
            </Text>
          )
        }
      >
        <div className='space-y-2'>
          <Text size='micro' variant='label'>
            Опишите конструкцию своими словами — узлы, детали, материалы, порядок сборки. AI
            предложит структурированные операции по этому описанию и данным карты (детали, BOM) —
            это ЧЕРНОВИК, технолог должен проверить его перед сохранением.
          </Text>

          {!techCardId ? (
            <Text size='micro' variant='label'>
              сначала сохраните тех.карту — генерация использует уже сохранённые детали и BOM как
              контекст
            </Text>
          ) : (
            <>
              <Textarea
                name='ai-operations-description'
                variant='secondary'
                placeholder='например: втачать рукав в открытую пройму, боковые швы стачать оверлоком 4 нитки, низ подогнуть 2 см и настрочить в край…'
                className='mb-0 min-h-24 border border-borderColor'
                maxLength={4000}
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDescription(e.target.value)
                }
                disabled={generating}
              />
              <Button
                type='button'
                variant='main'
                size='sm'
                loading={generating}
                disabled={generating || !description.trim()}
                onClick={generate}
              >
                сгенерировать операции
              </Button>
            </>
          )}

          {error && (
            <Text size='micro' variant='error'>
              {error}
            </Text>
          )}

          {draft && (
            <div className='space-y-1.5 border-t border-hairline pt-2'>
              <GroupLabel
                action={
                  <Text size='micro' variant='label' component='span'>
                    операций: {draft.operations.length}
                    {draft.model ? ` · ${draft.model}` : ''}
                  </Text>
                }
              >
                ai draft — review before saving
              </GroupLabel>
              {draft.notes?.trim() && (
                <Text size='micro' variant='label'>
                  {draft.notes.trim()}
                </Text>
              )}
              <div className='max-h-64 overflow-y-auto'>
                {draft.operations.map((o, i) => (
                  <Row
                    key={i}
                    label={
                      <span>
                        <span className='text-labelColor tabular-nums'>{(i + 1) * 10}.</span>{' '}
                        {operationHeading({
                          operationType: o.operationType,
                          zone: o.zone,
                          pieceNames: [],
                          note: o.note,
                        })}
                      </span>
                    }
                    value={o.smv?.value ? `${o.smv.value} min` : '—'}
                  />
                ))}
              </div>
              <div className='flex flex-wrap gap-1.5'>
                {hasExistingOperations && (
                  <Button type='button' variant='main' size='sm' onClick={() => accept('append')}>
                    добавить к списку
                  </Button>
                )}
                <Button
                  type='button'
                  variant={hasExistingOperations ? 'secondary' : 'main'}
                  size='sm'
                  onClick={() =>
                    hasExistingOperations ? setImpact(readReplaceImpact()) : accept('append')
                  }
                >
                  {hasExistingOperations ? 'заменить весь список' : 'принять в список'}
                </Button>
                <Button type='button' variant='secondary' size='sm' onClick={() => setDraft(null)}>
                  отклонить черновик
                </Button>
              </div>
            </div>
          )}
        </div>
      </Accordion>

      <ConfirmationModal
        open={impact != null}
        onOpenChange={(next) => !next && setImpact(null)}
        title='заменить весь список операций'
        width='sm'
        confirmLabel='заменить'
        cancelLabel='отмена'
        onConfirm={() => accept('replace')}
      >
        <div className='space-y-1.5'>
          <CalloutBox tone='error'>
            <Text size='micro'>
              будет удалено <b>{impact?.operations ?? 0}</b> операций: SAM у{' '}
              <b>{impact?.sam ?? 0}</b> из них и привязки деталей у <b>{impact?.pieceLinks ?? 0}</b>
              . Ссылки дефектов на номера операций тоже будут сброшены.
            </Text>
          </CalloutBox>
          <Text size='micro' variant='label'>
            вместо этого можно «добавить к списку» — черновик встанет после существующих операций.
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}

// Per-node sewing operations (Sheet «Обработка», lower block). Operations are an ordered
// assembly sequence (№ 10, 20, 30…); the backend returns them sorted by number.
//
// Layout is a rail + editor, the same grammar the hero and archive block editors use: the whole
// sequence stays on one screen as 26px lines (which is what makes it read as an ORDER), and the
// step you are on opens beside it as a full sewing spec.
export function OperationsField({
  activePin = null,
  onActivePinChange,
  activeBom = null,
  onActiveBomChange,
  colorwayArticles,
  pieceShapes = null,
  addRequest = null,
  onAdded,
}: {
  activePin?: number | null;
  onActivePinChange?: (n: number | null) => void;
  activeBom?: string | null;
  onActiveBomChange?: (k: string | null) => void;
  colorwayArticles?: ColorwayArticles;
  // Контуры деталей, посчитанные ОДИН раз на вкладке и стабильные по ссылке. Приходят пропом, а не
  // своим хуком: здесь их читают тарелка, каждый чип открытого шага и каждая строка рельса, а этот
  // компонент перерисовывается на каждый символ — считать карту заново на каждый рендер значило бы
  // обнулять memo у PieceShape во всех двадцати строках сразу.
  pieceShapes?: PieceShapeMap;
  // request from the construction panel to append an operation for a part (nonce dedupes)
  addRequest?: { placement: string; nonce: number } | null;
  onAdded?: () => void;
} = {}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove, replace, insert, move } = useFieldArray({
    control,
    name: 'operations',
  });
  // #66: the AI-generation RPC needs the card's numeric id for grounding context (its saved
  // pieces/BOM/type). This component isn't given one via props — read it off the route instead
  // (this field only ever renders under /tech-cards/:id or /add-tech-card, same as the `numId`
  // every sibling section derives in index.tsx). Undefined on an unsaved card — the panel below
  // shows a "save first" hint instead of the generator in that case.
  const { id: routeId } = useParams<{ id: string }>();
  const techCardId = routeId ? parseInt(routeId, 10) : undefined;
  const [params, setParams] = useSearchParams();

  // Which step the editor is showing. Clamped rather than reset, so deleting the last step keeps
  // the editor on a real row instead of blanking.
  const [selected, setSelected] = useState(0);
  const selectedIndex = fields.length === 0 ? -1 : Math.min(selected, fields.length - 1);

  // Operation numbers are POSITIONAL — the mapper re-stamps (i+1)*10 on every save — so any edit
  // that moves a row renumbers the ones after it. issues[].operationNumber references operations BY
  // NUMBER, so the same edit has to remap them (same class as nf05-01, laundered through the
  // number) or an issue flagged on op 20 silently points at the WRONG operation on the factory
  // sheet. `mapIndex` returns the row's new index, or null when it is going away.
  // Always called BEFORE the array is edited, so getValues() still reports the pre-edit positions.
  const remapIssues = useCallback(
    (mapIndex: (oldIndex: number) => number | null) => {
      const issues = getValues('issues') ?? [];
      const count = (getValues('operations') ?? []).length;
      issues.forEach((iss, ii) => {
        const n = iss.operationNumber ?? 0;
        if (!n) return;
        // Only a reference this editor could have minted is positional: an exact multiple of ten
        // inside the current range. Anything else is ALREADY dangling, and shifting it would
        // launder it into a valid number pointing at an operation it was never about — a stray 15
        // becoming a clean 10 is worse than a stray 15.
        if (n % 10 !== 0) return;
        const oldIndex = n / 10 - 1;
        if (oldIndex < 0 || oldIndex >= count) return;
        const nextIndex = mapIndex(oldIndex);
        const next = nextIndex == null ? 0 : (nextIndex + 1) * 10;
        if (next !== n) setValue(`issues.${ii}.operationNumber`, next, { shouldDirty: true });
      });
    },
    [getValues, setValue],
  );

  // Every operation number in the card is about to become meaningless (AI replace). Unlinks
  // dangling references too, which remapIssues deliberately leaves alone.
  const clearIssueOperationRefs = useCallback(() => {
    const issues = getValues('issues') ?? [];
    issues.forEach((iss, ii) => {
      if ((iss.operationNumber ?? 0) > 0) {
        setValue(`issues.${ii}.operationNumber`, 0, { shouldDirty: true });
      }
    });
  }, [getValues, setValue]);

  const removeOperation = (index: number) => {
    remapIssues((old) => (old === index ? null : old > index ? old - 1 : old));
    remove(index);
    // Clamp the STORED index, not just the rendered one: deleting the open last row leaves
    // `selected` past the end, and the next reorder would then compute the selection from a
    // position that no longer exists and open the wrong step.
    const lastAfter = Math.max(0, fields.length - 2);
    setSelected((s) => Math.min(s > index ? s - 1 : s, lastAfter));
  };

  const insertAfter = (index: number) => {
    remapIssues((old) => (old > index ? old + 1 : old));
    insert(index + 1, { ...emptyOperation });
    setSelected(index + 1);
  };

  const moveOperation = (from: number, to: number) => {
    if (from === to) return;
    remapIssues((old) => {
      if (old === from) return to;
      if (from < to) return old > from && old <= to ? old - 1 : old;
      return old >= to && old < from ? old + 1 : old;
    });
    move(from, to);
    setSelected((s) => {
      if (s === from) return to;
      if (from < s && s <= to) return s - 1;
      if (to <= s && s < from) return s + 1;
      return s;
    });
  };

  // append here (this field array owns the rendered list) when the panel requests it. The request
  // no longer carries a step title: there is no title to carry, and the two fields it used to
  // pre-fill (`node`, `placement`) were the same piece name written twice.
  useEffect(() => {
    if (!addRequest) return;
    append({ ...emptyOperation });
    setSelected(fields.length);
    onAdded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest?.nonce]);

  // Accept an AI-drafted batch (#66) into the real, editable field array — nothing above this
  // point has touched form state; the technologist still saves via the normal tech-card save.
  // Append leaves existing rows (and their operation numbers) untouched. Replace swaps the whole
  // list, so every old operation number an issue[].operationNumber pointed at is now meaningless —
  // unlink it rather than let it silently point at a DIFFERENT new operation that happens to land
  // on the same position (same discipline as removeOperation above).
  const acceptGeneratedOperations = (
    generated: common_TechCardOperation[],
    mode: 'append' | 'replace',
  ) => {
    const mapped = generated.map(mapGeneratedOperationToForm);
    if (mode === 'replace') {
      clearIssueOperationRefs();
      replace(mapped);
      setSelected(0);
    } else {
      setSelected(fields.length);
      append(mapped);
    }
  };

  // What «заменить весь список» would destroy, read at press time off form state — watching the
  // whole operations array here would re-render every row on every keystroke.
  const readReplaceImpact = (): ReplaceImpact => {
    const ops = (getValues('operations') ?? []) as {
      smv?: string;
      pieceLineKeys?: string[];
    }[];
    return {
      operations: ops.length,
      sam: ops.filter((o) => (o.smv ?? '').trim()).length,
      pieceLinks: ops.filter((o) => (o.pieceLineKeys ?? []).length > 0).length,
    };
  };

  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomLine[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as Array<{
    number?: number;
    part?: string;
  }>;
  // Only DECLARED pieces reach the tray. Inventing a piece from inside an operation is what
  // produced dangling codes in the first place, so that path is gone: «+ new piece» walks to the
  // PATTERNS tab, where a piece also gets its cut data instead of just a name.
  const pieces = useFormPieces();

  const pinOptions = useMemo<PickerOption[]>(
    () => [
      { value: 0, label: '— пин —' },
      ...callouts
        .filter((c) => (c.number ?? 0) > 0)
        .map((c) => ({
          value: c.number as number,
          label: `#${c.number}${c.part?.trim() ? ` ${c.part}` : ''}`,
        })),
    ],
    [callouts],
  );

  // A blocking error must never hide behind a step that isn't open (`node` is required), and only
  // ONE step is mounted now, so the editor has to walk to the failing one itself.
  const { errors, submitCount } = useFormState({ control });
  const opErrors = errors.operations as unknown as (unknown | undefined)[] | undefined;
  const errorIndices = useMemo(() => {
    const set = new Set<number>();
    if (Array.isArray(opErrors)) {
      opErrors.forEach((e, i) => {
        if (e) set.add(i);
      });
    }
    return set;
  }, [opErrors]);
  const firstErrorIndex = errorIndices.size ? Math.min(...errorIndices) : -1;
  const prevSubmit = useRef(submitCount);
  const prevErrorCount = useRef(errorIndices.size);
  useEffect(() => {
    const submitted = submitCount !== prevSubmit.current;
    const appeared = errorIndices.size > prevErrorCount.current;
    prevSubmit.current = submitCount;
    prevErrorCount.current = errorIndices.size;
    if (firstErrorIndex < 0) return;
    // A save attempt ALWAYS lands on the first failing step, because that is the one the tech-card
    // error router focuses and calls revealField() on — its field has to be mounted for the reveal
    // to find it, and revealField retries for a few frames, which is exactly long enough.
    //
    // Between saves (a server-pinned violation) only move when a NEW error appeared and the open
    // step is clean: reordering rows shifts which index is "first" without anything having gone
    // wrong, and that must not yank the editor out from under a drag.
    if (submitted || (appeared && !errorIndices.has(selectedIndex))) setSelected(firstErrorIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount, errorIndices]);

  // The sketch cross-highlight stays a HOVER preview on both sides. Lighting the open step's pin
  // permanently was tried and reverted: the pin fills error-red while it is the active one, so the
  // step you are editing read as the step that is broken.

  // Clicking «＋ piece» in the editor briefly flashes the tray, so the eye is pulled to the chips
  // now clickable. A short pulse, not a persisted mode — the chips stay clickable regardless.
  const [highlightPieces, setHighlightPieces] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const flashPieces = () => {
    trayRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setHighlightPieces(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setHighlightPieces(false), 2600);
  };
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const addPieceToOperation = (index: number, lineKey: string) => {
    if (index < 0 || !pieces.some((p) => p.lineKey === lineKey)) return;
    const cur = (getValues(`operations.${index}.pieceLineKeys`) ?? []) as string[];
    if (cur.includes(lineKey)) return;
    setValue(`operations.${index}.pieceLineKeys`, [...cur, lineKey], { shouldDirty: true });
  };

  // Cut pieces are a section of the PATTERNS tab (they used to have their own, then sat on
  // colorways). One target for every card shape — an auxiliary card has no colorways tab.
  const goToPiecesTab = () => {
    const next = new URLSearchParams(params);
    next.set('tab', 'patterns');
    setParams(next, { replace: true });
    // that tab is a sibling `hidden` panel, so it is already mounted — one frame is enough
    window.setTimeout(() => revealField('pieces.add'), 120);
  };

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
    moveOperation(from, to);
  };

  const addOperation = () => {
    setSelected(fields.length);
    append({ ...emptyOperation });
  };

  return (
    <div className='space-y-2.5'>
      <Text size='micro' variant='label'>
        Шаги сборки по порядку — слева вся последовательность, справа открытый шаг целиком. Номера
        (10/20/30) проставляются по позиции: перетащите <b>⠿</b>, чтобы поменять порядок. Выберите
        тип операции — машина и плотность подставятся автоматически.
      </Text>

      {/* piece tray — click a chip to add it to the open step, or drag it onto any step. Hidden
          while the sequence is empty: with nothing to attach a piece TO, every chip in it is a
          dead end and the strip only reports «нет операций». */}
      <div ref={trayRef} className={cn(fields.length === 0 && 'hidden')}>
        <Toolbar sticky>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            детали:
          </Text>
          {pieces.length === 0 ? (
            <Text size='micro' variant='label' component='span'>
              деталей ещё нет
            </Text>
          ) : (
            pieces.map((p) => (
              <TrayChip
                key={p.lineKey}
                piece={p}
                shape={pieceShapes?.get(pieceRefKey(p.lineKey)) ?? null}
                highlighted={highlightPieces}
                onAdd={() => addPieceToOperation(selectedIndex, p.lineKey)}
              />
            ))
          )}
          <Chip dashed onClick={goToPiecesTab} title='создать деталь на вкладке PATTERNS'>
            + new piece
          </Chip>
          <ToolbarSpacer />
          <Text
            size='micro'
            variant='label'
            component='span'
            className={cn(highlightPieces && 'font-bold text-textColor')}
          >
            {highlightPieces
              ? `кликните деталь → шаг ${(selectedIndex + 1) * 10}`
              : `клик → шаг ${(selectedIndex + 1) * 10}`}
          </Text>
        </Toolbar>
      </div>

      {fields.length === 0 ? (
        <div className='flex flex-col items-center gap-2 border border-dashed border-borderColor px-3 py-8 text-center'>
          <Text size='micro' variant='label'>
            последовательность сборки пока пуста. Добавьте первый шаг — или опишите конструкцию
            словами и сгенерируйте черновик ниже.
          </Text>
          <Button type='button' variant='main' size='sm' onClick={addOperation}>
            + операция
          </Button>
        </div>
      ) : (
        <div className='flex flex-col gap-3 lg:flex-row lg:items-start'>
          <div className='w-full lg:sticky lg:top-36 lg:w-[320px] lg:shrink-0'>
            <GroupLabel
              flush
              action={
                <Text size='micro' variant='label' component='span'>
                  ⠿ перетащить
                </Text>
              }
            >
              последовательность
            </GroupLabel>
            <div className='lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto'>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={fields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className='flex flex-col gap-0.5'>
                    {fields.map((f, index) => (
                      <RailStep
                        key={f.id}
                        uid={f.id}
                        index={index}
                        selected={index === selectedIndex}
                        onSelect={() => setSelected(index)}
                        hasError={errorIndices.has(index)}
                        activePin={activePin}
                        activeBom={activeBom}
                        pieceShapes={pieceShapes}
                        onHoverPin={(n) => onActivePinChange?.(n)}
                        onDropPiece={addPieceToOperation}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            <button
              type='button'
              onClick={addOperation}
              className='mt-0.5 w-full border border-dashed border-borderColor py-1 text-labelColor transition-colors hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='control' variant='uppercase' tracking='label' component='span'>
                + операция
              </Text>
            </button>
            <RailTotal />
          </div>

          {selectedIndex >= 0 && (
            <OperationEditor
              // Keyed on the row's identity AND its position: both of the editor's "skip the first
              // run" guards are keyed to a mount, and their effects depend on `index`. Reordering
              // the open step changes the index without remounting, which would fire the
              // operation-type preset and the thread-from-BOM fill as if the user had just picked
              // them — quietly writing into blank machine / stitch / thread fields on a drag.
              key={`${fields[selectedIndex]?.id ?? 'op'}:${selectedIndex}`}
              index={selectedIndex}
              bomLines={bomItems}
              pieces={pieces}
              pieceShapes={pieceShapes}
              pinOptions={pinOptions}
              colorwayArticles={colorwayArticles}
              onInsertAfter={() => insertAfter(selectedIndex)}
              onRemove={() => removeOperation(selectedIndex)}
              onFlashPieces={flashPieces}
              onActiveBomChange={onActiveBomChange}
              onDropPiece={addPieceToOperation}
            />
          )}
        </div>
      )}

      <GenerateOperationsPanel
        techCardId={techCardId}
        hasExistingOperations={fields.length > 0}
        readReplaceImpact={readReplaceImpact}
        onAccept={acceptGeneratedOperations}
      />
    </div>
  );
}
