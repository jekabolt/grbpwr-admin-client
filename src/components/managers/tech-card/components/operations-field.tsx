import { adminService } from 'api/api';
import { common_TechCardOperation } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useParams, useSearchParams } from 'react-router-dom';
import { Accordion } from 'ui/components/accordion';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { fieldErrorSummary, revealField } from 'utils/field-errors';
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
type BomLine = { lineKey?: string; name?: string; section?: string };

// ── piece tray ───────────────────────────────────────────────────────────────────────────────
// Wiring 14 operations to their pieces used to mean opening 14 popovers. The tray puts every
// DECLARED piece on one sticky strip: drag a chip onto an operation, or — the keyboard and touch
// path, which is not optional — click it and it lands on the operation currently targeted.
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
    <span
      role='button'
      tabIndex={0}
      draggable
      aria-label={`добавить деталь ${piece.name} к выбранной операции`}
      onDragStart={(e: React.DragEvent) => {
        e.dataTransfer.setData(PIECE_DND_TYPE, piece.lineKey);
        e.dataTransfer.setData('text/plain', `${PIECE_DND_PREFIX}${piece.lineKey}`);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onAdd}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd();
        }
      }}
      title={piece.name}
      className={cn(
        'flex size-16 cursor-grab flex-col items-center justify-center gap-0.5 border bg-bgColor p-1 text-center transition-colors hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor active:cursor-grabbing',
        // flashed by clicking an operation's «＋» — pull the eye to the pieces now clickable
        highlighted ? 'animate-pulse border-textColor bg-bgZebra' : 'border-borderColor',
      )}
    >
      <Text
        size='nano'
        variant='label'
        component='span'
        className='line-clamp-3 uppercase leading-tight text-textColor'
      >
        {piece.name}
      </Text>
    </span>
  );
}

function PieceDropTarget({
  targeted,
  onDropKey,
  onActivate,
}: {
  targeted: boolean;
  onDropKey: (lineKey: string) => void;
  onActivate: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      type='button'
      onClick={onActivate}
      onDragEnter={(e: React.DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const raw = e.dataTransfer.getData(PIECE_DND_TYPE) || e.dataTransfer.getData('text/plain');
        const key = raw.startsWith(PIECE_DND_PREFIX) ? raw.slice(PIECE_DND_PREFIX.length) : raw;
        if (key) onDropKey(key);
      }}
      aria-label='добавить деталь — подсветить детали в лотке'
      title='нажмите, чтобы подсветить детали в лотке и выбрать нужную — или перетащите деталь сюда'
      className={cn(
        'flex size-8 items-center justify-center border border-dashed text-control leading-none transition-colors',
        over
          ? 'border-textColor bg-bgZebra text-textColor'
          : targeted
            ? 'border-textColor text-textColor'
            : 'border-borderColor text-labelColor hover:border-textColor hover:text-textColor',
      )}
    >
      <span aria-hidden>＋</span>
    </button>
  );
}

// One assembly operation. Closed, the card reads like the assembly order — number · node · the
// pieces it joins · SAM. Open («детали»), it is the full sewing spec. The piece chips and the drop
// target stay on the header precisely so the tray can wire a whole card list without opening one.
function OperationRow({
  index,
  onRemove,
  pinOptions,
  bomLines,
  pieces,
  activePin,
  onActivePinChange,
  activeBom,
  onActiveBomChange,
  targeted,
  onTarget,
  onFlashPieces,
}: {
  index: number;
  onRemove: () => void;
  pinOptions: PickerOption[];
  bomLines: BomLine[];
  pieces: PieceRef[];
  activePin?: number | null;
  onActivePinChange?: (n: number | null) => void;
  activeBom?: string | null;
  onActiveBomChange?: (k: string | null) => void;
  targeted: boolean;
  onTarget: () => void;
  onFlashPieces: () => void;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const opNumber = (index + 1) * 10;
  const opType = useWatch({ control, name: `operations.${index}.operationType` }) as string;
  const node = (useWatch({ control, name: `operations.${index}.node` }) ?? '') as string;
  const calloutNumber = (useWatch({ control, name: `operations.${index}.calloutNumber` }) ??
    0) as number;
  // операция · узел/что · зона · пин are edited inline in the header (row A); every other field is
  // «детали». opType is still watched to drive the machine/stitch presets below.

  // A blocking error must never hide behind a collapsed card (`node` is required), so the row
  // opens itself when its own subtree reports one — and a brand-new row opens because it is empty.
  const { errors } = useFormState({ control, name: `operations.${index}` as never });
  const rowError = !!(errors.operations as unknown as unknown[] | undefined)?.[index];
  const [open, setOpen] = useState(() => !node.trim());
  useEffect(() => {
    if (rowError) setOpen(true);
  }, [rowError]);

  // The off-part materials this operation consumes (thread / fusing). Multi, because one operation
  // can join several. Scoped to the same sections the single picker was, so the list stays the
  // materials an operation plausibly consumes rather than every BOM article.
  const selectedBomKeys = (useWatch({
    control,
    name: `operations.${index}.bomLineKeys`,
  }) ?? []) as string[];
  const linkableBoms = useMemo(
    () =>
      bomLines.filter(
        (b) =>
          b.section === 'TECH_CARD_BOM_SECTION_THREAD' ||
          b.section === 'TECH_CARD_BOM_SECTION_INTERLINING',
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
  // A key that no longer resolves (its piece was deleted on the PIECES tab, or an older card
  // invented one through the removed picker) is SURFACED, not silently dropped — the save would
  // unlink it and nobody would know which operation lost a part.
  const danglingPieces = selectedPieceKeys.filter((k) => !byKey.has(k));
  const removePieceKey = (lineKey: string) =>
    setValue(
      `operations.${index}.pieceLineKeys`,
      selectedPieceKeys.filter((k) => k !== lineKey),
      { shouldDirty: true },
    );

  // `placement` is the legacy human label the printed sheet and older rows still read. It is now
  // DERIVED from the linked pieces rather than typed: a hand-typed "воротник" next to a piece called
  // "collar" is exactly what made the operation list and the cut list name the same part
  // differently. Kept in an effect (not in the setter) so it also follows a piece being renamed on
  // the PIECES tab.
  const derivedPlacement = chosenPieces
    .map((k) => byKey.get(k)?.name)
    .filter(Boolean)
    .join(' + ');
  const firstPlacementRun = useRef(true);
  useEffect(() => {
    // Only ever overwrite a label this rule owns: an operation with no linked pieces keeps whatever
    // free text it was saved with (older cards, AI drafts), so nothing is silently erased.
    if (!chosenPieces.length) {
      firstPlacementRun.current = false;
      return;
    }
    if (getValues(`operations.${index}.placement`) !== derivedPlacement) {
      // On mount, reconcile a stale stored label WITHOUT dirtying: opening a card must not report
      // unsaved changes the user never made (same discipline as the operation-type presets below).
      setValue(`operations.${index}.placement`, derivedPlacement, {
        shouldDirty: !firstPlacementRun.current,
      });
    }
    firstPlacementRun.current = false;
  }, [derivedPlacement, chosenPieces.length, index, getValues, setValue]);

  // The legacy single `bomLineKey` is no longer edited: it duplicated the chip row below («мат.
  // напрямую» asked the same question with room for one answer), and the operation genuinely takes
  // several materials. It is still WRITTEN on save, as the first of bomLineKeys, so the older
  // tech_card_operation.bom_item_id column and anything still reading it keep working (0200).
  const linkedMaterials = selectedBomKeys
    .map((k) => bomLines.find((b) => b.lineKey === k))
    .filter(Boolean) as BomLine[];
  const bomOutOfRange = selectedBomKeys.length > linkedMaterials.length;
  const linked =
    (!!activePin && activePin > 0 && calloutNumber === activePin) ||
    (activeBom != null && selectedBomKeys.includes(activeBom));

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
  // loading an existing card never auto-dirties the form), filling only blank fields.
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

  const addPieceKey = (lineKey: string) => {
    if (!byKey.has(lineKey) || selectedPieceKeys.includes(lineKey)) return;
    setValue(`operations.${index}.pieceLineKeys`, [...selectedPieceKeys, lineKey], {
      shouldDirty: true,
    });
  };

  return (
    <div
      onMouseEnter={() => {
        onActivePinChange?.(calloutNumber > 0 ? calloutNumber : null);
        onActiveBomChange?.(selectedBomKeys[0] || null);
      }}
      onMouseLeave={() => {
        onActivePinChange?.(null);
        onActiveBomChange?.(null);
      }}
      onFocusCapture={onTarget}
      className={cn(
        'border bg-bgColor transition-colors',
        // the cross-highlight mirrors the sketch pin (which fills error-red when active); the
        // tray's current target carries the ink border, so a click in the tray is never a guess
        linked ? 'border-error' : targeted ? 'border-textColor' : 'border-borderColor',
      )}
    >
      {/* header — операция · узел · зона · пин are edited inline here (row A); the pieces this
          operation joins are the square tiles + drop zone (row B), so the tray can wire a whole
          card without opening a single «детали» body. */}
      <div
        onClick={onTarget}
        className='flex flex-col gap-2 border-b border-hairline bg-bgZebra px-2 py-2'
      >
        {/* row A — the four key fields, always editable and visible */}
        <div className='flex flex-wrap items-end gap-1.5'>
          <Text size='control' component='span' className='self-center font-bold tabular-nums'>
            {opNumber}
          </Text>
          <div className='min-w-[130px] flex-1'>
            <SelectField
              name={`operations.${index}.operationType`}
              label='операция *'
              items={operationTypeOptions}
            />
          </div>
          <div className='min-w-[130px] flex-1'>
            <ComboField
              name={`operations.${index}.node`}
              label='узел / что *'
              placeholder='плечевые швы'
              options={nodeOptions}
            />
          </div>
          <div className='min-w-[110px]'>
            <SelectField name={`operations.${index}.zone`} label='зона' items={zoneOptions} />
          </div>
          <div className='min-w-[92px]'>
            <SelectField
              name={`operations.${index}.calloutNumber`}
              label='пин'
              items={rowPinOptions}
              valueAsNumber
            />
          </div>
          <div className='ml-auto flex shrink-0 items-center gap-1.5'>
            <Button type='button' variant='secondary' size='xs' onClick={() => setOpen((o) => !o)}>
              {open ? 'детали ▴' : 'детали ▾'}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              aria-label='remove operation'
              onClick={onRemove}
            >
              ✕
            </Button>
          </div>
        </div>

        {/* row B — pieces this operation joins: equal square tiles matching the tray + a square
            drop target */}
        <div className='flex flex-wrap items-start gap-2'>
          {chosenPieces.map((k) => (
            <div
              key={k}
              title={byKey.get(k)?.name}
              className='relative flex size-16 flex-col items-center justify-center border border-borderColor bg-bgColor p-1 text-center'
            >
              <Text
                size='nano'
                variant='label'
                component='span'
                className='line-clamp-3 uppercase leading-tight text-textColor'
              >
                {byKey.get(k)?.name}
              </Text>
              <button
                type='button'
                aria-label='remove piece'
                onClick={() => removePieceKey(k)}
                className='absolute right-0.5 top-0.5 leading-none text-labelColor transition-colors hover:text-textColor'
              >
                ✕
              </button>
            </div>
          ))}
          {danglingPieces.map((k) => (
            <div
              key={k}
              title={k}
              className='relative flex size-16 flex-col items-center justify-center border border-error bg-bgColor p-1 text-center'
            >
              <Text
                size='nano'
                variant='error'
                component='span'
                className='line-clamp-3 leading-tight'
              >
                {`#${k.slice(-6)} — not found`}
              </Text>
              <button
                type='button'
                aria-label='remove piece'
                onClick={() => removePieceKey(k)}
                className='absolute right-0.5 top-0.5 leading-none text-error transition-colors hover:text-textColor'
              >
                ✕
              </button>
            </div>
          ))}
          <PieceDropTarget
            targeted={targeted}
            onDropKey={addPieceKey}
            onActivate={() => {
              onTarget();
              onFlashPieces();
            }}
          />
        </div>
      </div>

      {open && (
        <div className='space-y-2 p-2'>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3'>
            <ComboField
              name={`operations.${index}.machine`}
              label='машина'
              options={machineOptions}
            />
            <div className='space-y-px'>
              <DecimalField
                name={`operations.${index}.smv`}
                label='SMV'
                placeholder='0.5'
                min={0}
              />
              <Text size='micro' variant='label'>
                standard minutes
              </Text>
            </div>
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
            <ComboField name={`operations.${index}.needle`} label='игла' options={needleOptions} />
            {/* Threads are picked from the card's own BOM thread lines, not typed: a free-text
                article is a string nothing can join on, so thread was never actually accounted for
                anywhere. Falls back to the generic vocabulary only while the BOM has no thread
                lines. Selecting the material itself (and so its consumption) is the chip row below;
                this stays the per-operation article note. */}
            <ComboField
              name={`operations.${index}.thread`}
              label='нитки'
              options={bomThreadOptions.length > 0 ? bomThreadOptions : threadOptions}
            />
            <ComboField
              name={`operations.${index}.attachment`}
              label='приспособление'
              options={attachmentOptions}
            />
            <DecimalField
              name={`operations.${index}.timeNorm`}
              label='SAM (мин)'
              placeholder='1.8'
            />
          </div>

          <GroupLabel>материалы операции — нитки / клеевые</GroupLabel>
          {linkableBoms.length === 0 ? (
            <Text size='micro' variant='label'>
              в BOM ещё нет ниток и клеевых — добавьте их на вкладке BOM, и они появятся здесь
            </Text>
          ) : (
            <ChipRow>
              {linkableBoms.map((b) => {
                const key = b.lineKey ?? '';
                const on = selectedBomKeys.includes(key);
                return (
                  <Chip key={key} selected={on} pressed={on} onClick={() => toggleBom(key)}>
                    {b.name?.trim() || 'unnamed'}
                  </Chip>
                );
              })}
            </ChipRow>
          )}

          {bomOutOfRange && (
            <Text size='micro' variant='error'>
              материал был удалён или перемещён — перевыберите его
            </Text>
          )}

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
      )}
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

// Live roll-up of the operations list: how many operations, and their total SMV (standard minute
// value, summed across rows — blank/garbage counts as 0). Kept in its own component so watching the
// whole operations array re-renders only this footer on each keystroke, not every OperationRow
// (same discipline as readReplaceImpact reading impact off form state instead of watching).
function OperationsSummary() {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as OperationFormValue[];
  const smvTotal = operations.reduce((sum, o) => {
    const n = parseDecimalNumber(o?.smv);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  return (
    <Text size='micro' variant='label' component='span' className='tabular-nums'>
      {`${operations.length} ops · ${smvTotal.toFixed(1)} SMV`}
    </Text>
  );
}

// Per-node sewing operations (Sheet «Обработка», lower block). Operations are an ordered
// assembly sequence (№ 10, 20, 30…); the backend returns them sorted by number.
export function OperationsField({
  activePin = null,
  onActivePinChange,
  activeBom = null,
  onActiveBomChange,
  addRequest = null,
  onAdded,
}: {
  activePin?: number | null;
  onActivePinChange?: (n: number | null) => void;
  activeBom?: string | null;
  onActiveBomChange?: (k: string | null) => void;
  // request from the construction panel to append an operation for a part (nonce dedupes)
  addRequest?: { placement: string; nonce: number } | null;
  onAdded?: () => void;
} = {}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'operations' });
  // #66: the AI-generation RPC needs the card's numeric id for grounding context (its saved
  // pieces/BOM/type). This component isn't given one via props — read it off the route instead
  // (this field only ever renders under /tech-cards/:id or /add-tech-card, same as the `numId`
  // every sibling section derives in index.tsx). Undefined on an unsaved card — the panel below
  // shows a "save first" hint instead of the generator in that case.
  const { id: routeId } = useParams<{ id: string }>();
  const techCardId = routeId ? parseInt(routeId, 10) : undefined;
  const [params, setParams] = useSearchParams();

  // append here (this field array owns the rendered list) when the panel requests it
  useEffect(() => {
    if (!addRequest) return;
    append({ ...emptyOperation, placement: addRequest.placement, node: addRequest.placement });
    onAdded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest?.nonce]);

  // Operation numbers are positional — the mapper re-stamps (i+1)*10 on every save — so
  // removing op k renumbers everything after it. issues[].operationNumber references ops BY
  // NUMBER: remap them in the same edit (same class as nf05-01, laundered through the number),
  // or an issue flagged on op 20 silently points at the WRONG operation on the factory sheet.
  const removeOperation = (index: number) => {
    const removedNumber = (index + 1) * 10;
    remove(index);
    const issues = getValues('issues') ?? [];
    issues.forEach((iss, ii) => {
      const n = iss.operationNumber ?? 0;
      if (!n) return;
      if (n === removedNumber) setValue(`issues.${ii}.operationNumber`, 0, { shouldDirty: true });
      else if (n > removedNumber)
        setValue(`issues.${ii}.operationNumber`, n - 10, { shouldDirty: true });
    });
  };

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
      const issues = getValues('issues') ?? [];
      issues.forEach((iss, ii) => {
        if ((iss.operationNumber ?? 0) > 0) {
          setValue(`issues.${ii}.operationNumber`, 0, { shouldDirty: true });
        }
      });
      replace(mapped);
    } else {
      append(mapped);
    }
  };

  // What «заменить весь список» would destroy, read at press time off form state — watching the
  // whole operations array here would re-render every card on every keystroke.
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
  // PIECES tab, where a piece also gets its cut data instead of just a name.
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

  // Which operation a tray click lands on. Defaults to the first row so the click path never
  // dead-ends; the tray always names the target, and the targeted card carries an ink border.
  const [targetIndex, setTargetIndex] = useState(0);
  const effectiveTarget = fields.length === 0 ? -1 : Math.min(targetIndex, fields.length - 1);

  // Clicking an operation's «＋» targets it AND briefly flashes the tray, so the eye is pulled to
  // the pieces now clickable. A short pulse, not a persisted mode — the pieces stay clickable
  // regardless; the flash is only the "выберите деталь" cue that answers the small «＋».
  const [highlightPieces, setHighlightPieces] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const flashPieces = () => {
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
    if (index < 0) return;
    const cur = (getValues(`operations.${index}.pieceLineKeys`) ?? []) as string[];
    if (cur.includes(lineKey)) return;
    setValue(`operations.${index}.pieceLineKeys`, [...cur, lineKey], { shouldDirty: true });
  };

  const goToPiecesTab = () => {
    const next = new URLSearchParams(params);
    next.set('tab', 'pieces');
    setParams(next, { replace: true });
    // the pieces tab is a sibling `hidden` panel, so it is already mounted — one frame is enough
    window.setTimeout(() => revealField('pieces.add'), 120);
  };

  return (
    <div className='space-y-2.5'>
      <Text size='micro' variant='label'>
        Шаги сборки по порядку (оп. 10/20/30 — нумеруются автоматически по позиции). Выберите тип
        операции — машина и плотность подставятся автоматически. «пин» — номер выноски с эскиза.
      </Text>

      {/* piece tray — drag onto an operation, or click to add it to the targeted one */}
      <Toolbar sticky className='z-[var(--z-sticky)] lg:sticky lg:top-36'>
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
              onAdd={() => addPieceToOperation(effectiveTarget, p.lineKey)}
            />
          ))
        )}
        <Chip dashed onClick={goToPiecesTab} title='создать деталь на вкладке PIECES'>
          + new piece
        </Chip>
        <ToolbarSpacer />
        <Text
          size='micro'
          variant='label'
          component='span'
          className={cn(highlightPieces && 'font-bold text-textColor')}
        >
          {effectiveTarget < 0
            ? 'нет операций'
            : highlightPieces
              ? `кликните деталь → оп. ${(effectiveTarget + 1) * 10}`
              : `→ оп. ${(effectiveTarget + 1) * 10}`}
        </Text>
      </Toolbar>

      {fields.length === 0 ? (
        <Text size='micro' variant='label'>
          пока нет операций — добавьте первую
        </Text>
      ) : (
        <div className='space-y-1.5'>
          {fields.map((f, index) => (
            <OperationRow
              key={f.id}
              index={index}
              onRemove={() => removeOperation(index)}
              pinOptions={pinOptions}
              bomLines={bomItems}
              pieces={pieces}
              activePin={activePin}
              onActivePinChange={onActivePinChange}
              activeBom={activeBom}
              onActiveBomChange={onActiveBomChange}
              targeted={index === effectiveTarget}
              onTarget={() => setTargetIndex(index)}
              onFlashPieces={flashPieces}
            />
          ))}
          <div className='flex justify-end border-t border-hairline pt-1.5'>
            <OperationsSummary />
          </div>
        </div>
      )}

      <GenerateOperationsPanel
        techCardId={techCardId}
        hasExistingOperations={fields.length > 0}
        readReplaceImpact={readReplaceImpact}
        onAccept={acceptGeneratedOperations}
      />

      <Button
        type='button'
        variant='main'
        size='sm'
        onClick={() => {
          append({ ...emptyOperation });
          setTargetIndex(fields.length);
        }}
      >
        + операция
      </Button>
    </div>
  );
}
