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
  OPERATION_TYPE_PRESETS,
  attachmentOptions,
  machineOptions,
  needleOptions,
  nodeOptions,
  operationTypeOptions,
  seamAllowanceOptions,
  seamTypeOptions,
  stitchDensityOptions,
  threadOptions,
  topstitchWidthOptions,
  zoneOptions,
} from './operation-options';
import { PieceRef, useFormPieces } from './piece-picker';
import { TechCardFormData } from './schema';

const NONE_OP_TYPE = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';
const NONE_ZONE = 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN';

// Drag payload for the piece tray. A private MIME type so a stray text drop from elsewhere can
// never be mistaken for a piece reference; the plain-text mirror (prefixed) is only a fallback for
// browsers that drop custom types, and every drop is validated against the declared pieces anyway.
const PIECE_DND_TYPE = 'application/x-grbpwr-piece';
const PIECE_DND_PREFIX = 'grbpwr-piece:';

// Keep a Radix select from ballooning when its selected option is long: clip the value span (the
// trigger's first child) with an ellipsis instead of letting the text wrap the control taller/wider.
const selectNoGrow = '[&>span:first-child]:min-w-0 [&>span:first-child]:truncate';

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

export const emptyOperation = {
  operationNumber: 0,
  node: '',
  operationType: NONE_OP_TYPE,
  machine: '',
  zone: NONE_ZONE,
  bomLineKey: '', // '' = no material linked
  calloutNumber: 0, // 0 = no sketch pin linked
  seamType: '',
  seamAllowance: '',
  stitchesPerCm: '',
  smv: '',
  topstitchWidth: '',
  needle: '',
  thread: '',
  attachment: '',
  timeNorm: '',
  description: '',
  note: '',
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
    node: o.node?.trim() || '',
    operationType: o.operationType || NONE_OP_TYPE,
    machine: o.machine?.trim() || '',
    zone: o.zone || NONE_ZONE,
    bomLineKey: o.bomLineKey?.trim() || '',
    // The save reads bomLineKeys, not the single key — an AI draft that only filled the legacy
    // field would otherwise lose its material link the moment it was accepted.
    bomLineKeys: o.bomLineKeys?.length
      ? o.bomLineKeys.filter(Boolean)
      : ([o.bomLineKey?.trim()].filter(Boolean) as string[]),
    pieceLineKeys: (o.pieceLineKeys ?? []).filter(Boolean),
    calloutNumber: o.calloutNumber || 0,
    seamType: o.seamType?.trim() || '',
    seamAllowance: o.seamAllowance?.trim() || '',
    stitchesPerCm: decimalToInput(o.stitchesPerCm),
    smv: decimalToInput(o.smv),
    topstitchWidth: o.topstitchWidth?.trim() || '',
    needle: o.needle?.trim() || '',
    thread: o.thread?.trim() || '',
    attachment: o.attachment?.trim() || '',
    timeNorm: decimalToInput(o.timeNorm),
    description: o.description?.trim() || '',
    note: o.note?.trim() || '',
    placement: o.placement?.trim() || '',
  };
}

type PickerOption = { value: number; label: string };
// materialId is the SLOT DEFAULT article. It is read from the form (not from the card read) so an
// article picked on the BOM tab and not yet saved still resolves here.
type BomLine = { lineKey?: string; name?: string; section?: string; materialId?: number };

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

// `placement` is the legacy human label the printed sheet and older rows still read. It is DERIVED
// from the linked pieces rather than typed: a hand-typed "воротник" next to a piece called "collar"
// is exactly what made the operation list and the cut list name the same part differently.
//
// It lives here rather than in the editor because only ONE operation is mounted at a time now: a
// piece renamed on the PATTERNS tab has to reach every operation that references it, not just the one
// currently open.
function PlacementSync() {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as OperationFormValue[];
  const pieces = useFormPieces();
  const firstRun = useRef(true);

  useEffect(() => {
    const nameByKey = new Map(pieces.map((p) => [p.lineKey, p.name]));
    operations.forEach((op, i) => {
      // An operation with no resolvable linked pieces keeps whatever free text it was saved with
      // (older cards, AI drafts): this rule only ever overwrites a label it owns.
      const names = ((op?.pieceLineKeys ?? []) as string[])
        .map((k) => nameByKey.get(k))
        .filter(Boolean) as string[];
      if (names.length === 0) return;
      const derived = names.join(' + ');
      if (getValues(`operations.${i}.placement`) !== derived) {
        // On the first pass, reconcile a stale stored label WITHOUT dirtying: opening a card must
        // not report unsaved changes the user never made (same discipline as the operation-type
        // presets).
        setValue(`operations.${i}.placement`, derived, { shouldDirty: !firstRun.current });
      }
    });
    // The flag is spent on the first pass that actually SEES operations, not on the first render.
    // This component mounts with the tab, which is before the fetched card is reset into the form —
    // spending it on an empty array would make the real reconcile the "second" pass and dirty a
    // card nobody has edited.
    if (operations.length > 0) firstRun.current = false;
  }, [operations, pieces, getValues, setValue]);

  return null;
}

// Closing total for the sequence rail: SAM feeds costing, SMV is the machine norm. Blank/garbage
// counts as 0 in both.
function RailTotal() {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as OperationFormValue[];
  const sum = (key: 'timeNorm' | 'smv') =>
    operations.reduce((acc, o) => {
      const n = parseDecimalNumber(o?.[key]);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  const sam = sum('timeNorm');
  const smv = sum('smv');
  return (
    <RowTotal
      label={
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          итого · {operations.length}
        </Text>
      }
      value={
        <Text
          size='micro'
          component='span'
          title={`SAM ${sam.toFixed(1)} мин · SMV ${smv.toFixed(1)}`}
        >
          {`${sam.toFixed(1)} мин`}
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
  onAdd,
  highlighted = false,
}: {
  piece: PieceRef;
  onAdd: () => void;
  highlighted?: boolean;
}) {
  return (
    <Chip
      onClick={onAdd}
      draggable
      title={`${piece.name} — кликните, чтобы добавить к открытому шагу, или перетащите на любой`}
      aria-label={`добавить деталь ${piece.name} к открытому шагу`}
      onDragStart={(e: React.DragEvent) => {
        e.dataTransfer.setData(PIECE_DND_TYPE, piece.lineKey);
        e.dataTransfer.setData('text/plain', `${PIECE_DND_PREFIX}${piece.lineKey}`);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={cn(
        'cursor-grab active:cursor-grabbing',
        // flashed by the editor's «＋ деталь» — pull the eye to the chips now clickable. The border
        // and fill carry the state on their own, so the pulse is pure decoration and is dropped for
        // anyone who asked for less motion.
        highlighted && 'motion-safe:animate-pulse border-textColor bg-bgZebra text-textColor',
      )}
    >
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
  onHoverPin: (n: number | null) => void;
  onDropPiece: (index: number, lineKey: string) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const node = (useWatch({ control, name: `operations.${index}.node` }) ?? '') as string;
  const opType = (useWatch({ control, name: `operations.${index}.operationType` }) ?? '') as string;
  const timeNorm = (useWatch({ control, name: `operations.${index}.timeNorm` }) ?? '') as string;
  const calloutNumber = (useWatch({ control, name: `operations.${index}.calloutNumber` }) ??
    0) as number;
  const bomLineKeys = (useWatch({ control, name: `operations.${index}.bomLineKeys` }) ??
    []) as string[];

  const [over, setOver] = useState(false);
  const opNumber = (index + 1) * 10;
  const sam = parseDecimalNumber(timeNorm);
  const label = node.trim() || opTypeLabel(opType) || 'новый шаг';
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
            aria-label={`переставить шаг ${opNumber}`}
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
            <Text
              size='control'
              component='span'
              className={cn('min-w-0 flex-1 truncate', !node.trim() && 'text-labelColor')}
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
              title='SAM, мин'
            >
              {sam > 0 ? sam.toFixed(1) : '—'}
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
  // Thread articles actually present in this card's BOM — the only ones an operation can really
  // consume.
  const bomThreadOptions = useMemo(
    () =>
      Array.from(
        new Set(
          bomLines
            .filter((b) => b.section === 'TECH_CARD_BOM_SECTION_THREAD')
            .map((b) => b.name?.trim())
            .filter(Boolean) as string[],
        ),
      ),
    [bomLines],
  );
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
  // A key that no longer resolves (its piece was deleted on the PATTERNS tab, or an older card
  // invented one through the removed picker) is SURFACED, not silently dropped — the save would
  // unlink it and nobody would know which operation lost a part.
  const danglingPieces = selectedPieceKeys.filter((k) => !byKey.has(k));
  const removePieceKey = (lineKey: string) => {
    const next = selectedPieceKeys.filter((k) => k !== lineKey);
    setValue(`operations.${index}.pieceLineKeys`, next, { shouldDirty: true });
    // PlacementSync only ever writes a label while at least one link still resolves, so unlinking
    // the LAST piece would otherwise leave the old derived label on the step — a printed sheet
    // still saying «воротник верхний + воротник нижний» for a step that now touches nothing.
    // Rewritten here only when this rule already owned the label (the step had resolvable pieces);
    // a row carrying legacy or AI free text keeps it.
    if (chosenPieces.length > 0) {
      const names = next.map((k) => byKey.get(k)?.name).filter(Boolean) as string[];
      setValue(`operations.${index}.placement`, names.join(' + '), { shouldDirty: true });
    }
  };

  // The legacy single `bomLineKey` is no longer edited: it duplicated the chip row below («мат.
  // напрямую» asked the same question with room for one answer), and the operation genuinely takes
  // several materials. It is still WRITTEN on save, as the first of bomLineKeys, so the older
  // tech_card_operation.bom_item_id column and anything still reading it keep working (0200).
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
  const unlinkedBySection = (() => {
    const groups = new Map<string, BomLine[]>();
    for (const b of unlinkedBoms) {
      const section = b.section ?? '';
      const bucket = groups.get(section);
      if (bucket) bucket.push(b);
      else groups.set(section, [b]);
    }
    return Array.from(groups.entries());
  })();

  // Which article each colourway actually takes for the slots this step consumes. THE reason the
  // link is worth having: the operation names the role and stays colourway-agnostic, so without
  // this a technologist reading the step cannot tell that BLK takes an antique-brass zip where
  // BONE takes silver. Resolution mirrors the server (pin → slot default → none).
  //
  // Not memoised, for the same reason as unlinkedBySection above: linkedMaterials is rebuilt on
  // every render, so a useMemo keyed on it would recompute anyway while claiming a stability it
  // does not have.
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

  // Apply the verb's machine / stitch defaults on a real change (skip the initial mount so
  // opening an existing step never auto-dirties the form), filling only blank fields.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const preset = OPERATION_TYPE_PRESETS[opType];
    if (!preset) return;
    const cur = getValues(`operations.${index}`);
    if (preset.machine && !cur.machine?.trim()) {
      setValue(`operations.${index}.machine`, preset.machine, { shouldDirty: true });
    }
    if (preset.stitchesPerCm && !cur.stitchesPerCm?.trim()) {
      setValue(`operations.${index}.stitchesPerCm`, preset.stitchesPerCm, { shouldDirty: true });
    }
  }, [opType, index, getValues, setValue]);

  // Linking a thread material from the BOM fills the operation's thread when it's still
  // blank (the BOM line is the source of truth for which thread to use).
  const firstBomRun = useRef(true);
  useEffect(() => {
    if (firstBomRun.current) {
      firstBomRun.current = false;
      return;
    }
    const line = linkedMaterials.find((b) => b.section === 'TECH_CARD_BOM_SECTION_THREAD');
    if (line?.name?.trim()) {
      const cur = getValues(`operations.${index}`);
      if (!cur.thread?.trim()) {
        setValue(`operations.${index}.thread`, line.name, { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBomKeys.join(','), index, getValues, setValue]);

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
          {opTypeLabel(opType) || 'без типа'}
        </Text>
        <div className='ml-auto flex shrink-0 items-center gap-1.5'>
          <Button type='button' variant='secondary' size='xs' onClick={onInsertAfter}>
            ＋ шаг ниже
          </Button>
          <Button type='button' variant='secondary' size='xs' onClick={onRemove}>
            удалить шаг
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
        <SelectField
          name={`operations.${index}.operationType`}
          label='операция *'
          items={operationTypeOptions}
          className={selectNoGrow}
        />
        <ComboField
          name={`operations.${index}.node`}
          label='узел / что *'
          placeholder='плечевые швы'
          options={nodeOptions}
        />
        <SelectField
          name={`operations.${index}.zone`}
          label='зона'
          items={zoneOptions}
          className={selectNoGrow}
        />
        <SelectField
          name={`operations.${index}.calloutNumber`}
          label='пин на эскизе'
          items={rowPinOptions}
          valueAsNumber
          className={selectNoGrow}
        />
        {/* SAM feeds costing (it is what the summary above totals); SMV is the machine norm. They
            are the two time fields, so they sit together rather than one here and one three groups
            down among the needles. */}
        <DecimalField name={`operations.${index}.timeNorm`} label='SAM (мин)' placeholder='1.8' />
        <DecimalField
          name={`operations.${index}.smv`}
          label='SMV (мин)'
          placeholder='0.5'
          min={0}
        />
      </div>

      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span'>
            клик по детали в лотке добавит сюда
          </Text>
        }
      >
        детали, которые соединяет шаг
      </GroupLabel>
      <ChipRow>
        {chosenPieces.map((k) => (
          <Chip key={k} title={byKey.get(k)?.name} onRemove={() => removePieceKey(k)}>
            {byKey.get(k)?.name}
          </Chip>
        ))}
        {danglingPieces.map((k) => (
          <Chip
            key={k}
            tone='error'
            title={`деталь ${k} удалена на вкладке patterns — привязка потеряется при сохранении`}
            onRemove={() => removePieceKey(k)}
          >
            {`#${k.slice(-6)} — деталь удалена`}
          </Chip>
        ))}
        <Chip dashed onClick={onFlashPieces} title='выбрать деталь в лотке над списком'>
          ＋ деталь
        </Chip>
      </ChipRow>
      {chosenPieces.length === 0 && danglingPieces.length === 0 && (
        <Text size='micro' variant='label' className='mt-1'>
          шаг ни с чем не связан — кликните деталь в лотке выше или перетащите её сюда
        </Text>
      )}

      <GroupLabel>материалы из BOM, которые расходует шаг</GroupLabel>
      {linkableBoms.length === 0 ? (
        <Text size='micro' variant='label'>
          в BOM нет материалов, которые может расходовать операция — добавьте фурнитуру, нитки,
          клеевые, тесьму, декор или этикетки на вкладке BOM
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
                title={LINKABLE_SECTION_LABEL[b.section ?? ''] ?? undefined}
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
                title='привязать материал из BOM — фурнитуру, нитку, клеевую, тесьму, декор, этикетку'
              >
                {addingMaterial ? '✕ отмена' : '＋ материал'}
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
          материал был удалён или перемещён — перевыберите его
        </Text>
      )}

      <GroupLabel>шов</GroupLabel>
      <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-4'>
        <ComboField
          name={`operations.${index}.seamType`}
          label='тип шва'
          options={seamTypeOptions}
        />
        <ComboField
          name={`operations.${index}.seamAllowance`}
          label='припуск (мм)'
          options={seamAllowanceOptions}
        />
        <ComboField
          name={`operations.${index}.stitchesPerCm`}
          label='стежков / см'
          options={stitchDensityOptions}
        />
        <ComboField
          name={`operations.${index}.topstitchWidth`}
          label='ширина отстрочки'
          options={topstitchWidthOptions}
        />
      </div>

      <GroupLabel>машина и инструмент</GroupLabel>
      <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-4'>
        <ComboField name={`operations.${index}.machine`} label='машина' options={machineOptions} />
        <ComboField name={`operations.${index}.needle`} label='игла' options={needleOptions} />
        {/* Threads are picked from the card's own BOM thread lines, not typed: a free-text
            article is a string nothing can join on, so thread was never actually accounted for
            anywhere. Falls back to the generic vocabulary only while the BOM has no thread
            lines. Selecting the material itself (and so its consumption) is the chip row above;
            this stays the per-operation article note. */}
        <ComboField
          name={`operations.${index}.thread`}
          label='нитки (артикул)'
          options={bomThreadOptions.length > 0 ? bomThreadOptions : threadOptions}
        />
        <ComboField
          name={`operations.${index}.attachment`}
          label='приспособление'
          options={attachmentOptions}
        />
      </div>

      <GroupLabel>текст</GroupLabel>
      <div className='space-y-2'>
        <TextareaField
          name={`operations.${index}.description`}
          label='описание'
          rows={2}
          maxLength={1000}
        />
        <TextareaField
          name={`operations.${index}.note`}
          label='примечание'
          rows={2}
          maxLength={1000}
        />
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
                        {o.node?.trim() || '—'}
                        {o.description?.trim() ? ` — ${o.description.trim()}` : ''}
                      </span>
                    }
                    value={o.machine?.trim() || '—'}
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
  addRequest = null,
  onAdded,
}: {
  activePin?: number | null;
  onActivePinChange?: (n: number | null) => void;
  activeBom?: string | null;
  onActiveBomChange?: (k: string | null) => void;
  colorwayArticles?: ColorwayArticles;
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

  // append here (this field array owns the rendered list) when the panel requests it
  useEffect(() => {
    if (!addRequest) return;
    append({ ...emptyOperation, placement: addRequest.placement, node: addRequest.placement });
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
      timeNorm?: string;
      pieceLineKeys?: string[];
    }[];
    return {
      operations: ops.length,
      sam: ops.filter((o) => (o.timeNorm ?? '').trim()).length,
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

  // Clicking «＋ деталь» in the editor briefly flashes the tray, so the eye is pulled to the chips
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
      <PlacementSync />

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
