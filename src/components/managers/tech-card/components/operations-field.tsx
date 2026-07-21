import { adminService } from 'api/api';
import { common_TechCardOperation } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput } from 'utils/decimal';
import { fieldErrorSummary } from 'utils/field-errors';
import { BomLinePicker } from './bom-line-picker';
import { PieceMultiPicker, useCreatePiece, useFormPieces } from './piece-picker';
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
import { TechCardFormData } from './schema';

const NONE_OP_TYPE = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';
const NONE_ZONE = 'TECH_CARD_CONSTRUCTION_ZONE_UNKNOWN';

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
      : [o.bomLineKey?.trim()].filter(Boolean) as string[],
    pieceLineKeys: (o.pieceLineKeys ?? []).filter(Boolean),
    calloutNumber: o.calloutNumber || 0,
    seamType: o.seamType?.trim() || '',
    seamAllowance: o.seamAllowance?.trim() || '',
    stitchesPerCm: decimalToInput(o.stitchesPerCm),
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

// One assembly operation. The compact line reads like a sentence (verb · node · part ·
// machine · material · pin); the rare/industrial fields hide behind «детали». The op number
// is positional (оп. 10/20/30 — server-assigned), shown read-only.
function OperationRow({
  index,
  onRemove,
  pinOptions,
  bomLines,
  activePin,
  onActivePinChange,
  activeBom,
  onActiveBomChange,
}: {
  index: number;
  onRemove: () => void;
  pinOptions: PickerOption[];
  bomLines: BomLine[];
  activePin?: number | null;
  onActivePinChange?: (n: number | null) => void;
  activeBom?: string | null;
  onActiveBomChange?: (k: string | null) => void;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const [open, setOpen] = useState(false);
  const opNumber = (index + 1) * 10;
  const opType = useWatch({ control, name: `operations.${index}.operationType` }) as string;
  const calloutNumber = (useWatch({ control, name: `operations.${index}.calloutNumber` }) ??
    0) as number;
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
  const setPieceKeys = (next: string[]) =>
    setValue(`operations.${index}.pieceLineKeys`, next, { shouldDirty: true });
  // `placement` is the legacy human label the printed sheet and older rows still read. It is now
  // DERIVED from the linked pieces rather than typed: a hand-typed "воротник" next to a piece called
  // "collar" is exactly what made the operation list and the cut list name the same part
  // differently. Kept in an effect (not in the setter) so it also follows a piece being renamed on
  // the PIECES tab, and so a piece created inside the picker — which lands in form state in the same
  // tick as the link — still makes it into the label.
  const pieces = useFormPieces();
  const createPiece = useCreatePiece();
  const derivedPlacement = selectedPieceKeys
    .map((k) => pieces.find((p) => p.lineKey === k)?.name)
    .filter(Boolean)
    .join(' + ');
  const firstPlacementRun = useRef(true);
  useEffect(() => {
    // Only ever overwrite a label this rule owns: an operation with no linked pieces keeps whatever
    // free text it was saved with (older cards, AI drafts), so nothing is silently erased.
    if (!selectedPieceKeys.length) {
      firstPlacementRun.current = false;
      return;
    }
    if (getValues(`operations.${index}.placement`) !== derivedPlacement) {
      // On mount, reconcile a stale stored label WITHOUT dirtying: opening a card must not report
      // unsaved changes the user never made (same discipline as the operation-type presets above).
      setValue(`operations.${index}.placement`, derivedPlacement, {
        shouldDirty: !firstPlacementRun.current,
      });
    }
    firstPlacementRun.current = false;
  }, [derivedPlacement, selectedPieceKeys.length, index, getValues, setValue]);
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
      className={cn(
        'space-y-4 border p-4 transition-colors',
        linked ? 'border-textInactiveColor ring-1 ring-textColor' : 'border-textInactiveColor',
      )}
    >
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <Text variant='uppercase' size='small'>
            операция {index + 1} · оп. {opNumber}
          </Text>
          {linkedMaterials.length > 0 && (
            <Text variant='inactive' size='small' className='truncate lowercase'>
              · 🧵 {linkedMaterials.map((b) => b.name?.trim() || 'unnamed').join(', ')}
            </Text>
          )}
        </div>
        <div className='flex gap-2'>
          <Button type='button' variant='secondary' onClick={() => setOpen((o) => !o)}>
            {open ? 'детали ▴' : 'детали ▾'}
          </Button>
          <Button
            type='button'
            variant='secondary'
            aria-label='remove operation'
            onClick={onRemove}
          >
            ✕
          </Button>
        </div>
      </div>

      {/* compact line — the operation «sentence»: what · where · with-what.
          Two rows of three (equal width) so nothing gets crushed in the narrow column. */}
      <div className='grid grid-cols-2 items-end gap-x-3 gap-y-4 sm:grid-cols-3'>
        <SelectField
          name={`operations.${index}.operationType`}
          label='операция *'
          items={operationTypeOptions}
        />
        <ComboField
          name={`operations.${index}.node`}
          label='узел / что *'
          placeholder='плечевые швы'
          options={nodeOptions}
        />
        {/* Which CUT PIECES this operation joins — the real reference (the server resolves each key
            to a tech_card_piece FK). Multi, because an assembly operation IS the joining of several
            parts: a shoulder seam takes the front and the back. That is why this is a picker over a
            set and not the recipe's single-piece select. Distinct from «мат. напрямую» below, which
            is the off-part material the operation itself consumes (thread / fusing) — the two used
            to answer the same free-text field. Always rendered, never gated on pieces existing: a
            card with no cut pieces yet is the common case, and the picker is where you create the
            first one. */}
        <div className='col-span-2 sm:col-span-3'>
          <PieceMultiPicker
            pieces={pieces}
            onCreate={createPiece}
            value={selectedPieceKeys}
            onChange={setPieceKeys}
            label='детали, которые соединяет операция'
            hint='одна операция может соединять несколько деталей — отметьте все; можно создать новую прямо здесь'
          />
        </div>
        <div className='col-span-2 flex flex-col gap-1 sm:col-span-3'>
            <Text variant='label' size='small'>
              материалы операции — нитки / клеевые
            </Text>
            {linkableBoms.length === 0 ? (
              <Text variant='inactive' size='small'>
                в BOM ещё нет ниток и клеевых — добавьте их на вкладке BOM, и они появятся здесь
              </Text>
            ) : (
            <div className='flex flex-wrap gap-1.5'>
              {linkableBoms.map((b) => {
                const key = b.lineKey ?? '';
                const on = selectedBomKeys.includes(key);
                return (
                  <button
                    key={key}
                    type='button'
                    aria-pressed={on}
                    onClick={() => toggleBom(key)}
                    className={cn(
                      'border px-2 py-0.5 text-textBaseSize uppercase',
                      on
                        ? 'border-textColor bg-textColor text-bgColor'
                        : 'border-textInactiveColor text-labelColor hover:text-text',
                    )}
                  >
                    {b.name?.trim() || 'unnamed'}
                  </button>
                );
              })}
            </div>
            )}
        </div>
        <ComboField name={`operations.${index}.machine`} label='машина' options={machineOptions} />
        <SelectField
          name={`operations.${index}.calloutNumber`}
          label='пин'
          items={pinOptions}
          valueAsNumber
        />
      </div>

      <Text variant='inactive' size='small'>
        «детали» — что операция соединяет (реальная ссылка на детали кроя; подпись на листе
        собирается из их названий). «материалы операции» — артикулы, которые тратит сама операция, а
        не деталь: нитки и клеевые.
      </Text>

      {bomOutOfRange && (
        <Text size='small' className='text-error'>
          материал был удалён или перемещён — перевыберите его
        </Text>
      )}

      {open && (
        <div className='space-y-4 border-t border-textInactiveColor pt-4'>
          <div className='grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4'>
            <SelectField name={`operations.${index}.zone`} label='зона' items={zoneOptions} />
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
                lines. Selecting the material itself (and so its consumption) is the chip row above;
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

// #66: draft assembly operations from a plain-language description — «мы описываем все операции
// словами (у нас есть знания о деталях/BOM), через OpenRouter генерируем структурированные
// операции, технолог проверит». Collapsed by default: an optional accelerant next to the manual
// «+ операция» flow, not a replacement for it. Never persists on its own — a successful generation
// only stages a DRAFT for review; the technologist explicitly appends or replaces it into the
// real (editable) operations list below, then saves through the normal tech-card save.
function GenerateOperationsPanel({
  techCardId,
  hasExistingOperations,
  onAccept,
}: {
  techCardId?: number;
  hasExistingOperations: boolean;
  onAccept: (operations: common_TechCardOperation[], mode: 'append' | 'replace') => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
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
    setOpen(false);
  };

  return (
    <div className='space-y-3 border border-textInactiveColor p-4'>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          generate operations from description (ai)
        </Text>
        <Button type='button' variant='secondary' onClick={() => setOpen((o) => !o)}>
          {open ? 'свернуть ▴' : 'развернуть ▾'}
        </Button>
      </div>

      {open && (
        <div className='space-y-3'>
          <Text variant='inactive' size='small'>
            Опишите конструкцию своими словами — узлы, детали, материалы, порядок сборки. AI
            предложит структурированные операции по этому описанию и данным карты (детали, BOM) —
            это ЧЕРНОВИК, технолог должен проверить его перед сохранением.
          </Text>

          {!techCardId ? (
            <Text variant='inactive' size='small'>
              сначала сохраните тех.карту — генерация использует уже сохранённые детали и BOM как
              контекст
            </Text>
          ) : (
            <>
              <Textarea
                name='ai-operations-description'
                variant='secondary'
                placeholder='например: втачать рукав в открытую пройму, боковые швы стачать оверлоком 4 нитки, низ подогнуть 2 см и настрочить в край…'
                className='mb-0 min-h-24 border border-textInactiveColor'
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
                className='uppercase'
                loading={generating}
                disabled={generating || !description.trim()}
                onClick={generate}
              >
                сгенерировать операции
              </Button>
            </>
          )}

          {error && (
            <Text size='small' className='text-error'>
              {error}
            </Text>
          )}

          {draft && (
            <div className='space-y-2 border-t border-textInactiveColor pt-3'>
              <div className='flex flex-wrap items-center gap-x-2'>
                <Text variant='uppercase' size='small' className='text-warning'>
                  AI draft — review before saving
                </Text>
                <Text variant='inactive' size='small'>
                  операций: {draft.operations.length}
                  {draft.model ? ` · ${draft.model}` : ''}
                </Text>
              </div>
              {draft.notes?.trim() && (
                <Text variant='inactive' size='small'>
                  {draft.notes.trim()}
                </Text>
              )}
              <ol className='max-h-64 space-y-1 overflow-y-auto'>
                {draft.operations.map((o, i) => (
                  <li key={i} className='border border-textInactiveColor/50 px-2 py-1'>
                    <Text size='small'>
                      <span className='text-textInactiveColor'>{(i + 1) * 10}.</span>{' '}
                      {o.node?.trim() || '—'}
                      {o.machine?.trim() ? ` · ${o.machine.trim()}` : ''}
                      {o.description?.trim() ? ` — ${o.description.trim()}` : ''}
                    </Text>
                  </li>
                ))}
              </ol>
              <div className='flex flex-wrap gap-2'>
                {hasExistingOperations && (
                  <Button
                    type='button'
                    variant='main'
                    className='uppercase'
                    onClick={() => accept('append')}
                  >
                    добавить к списку
                  </Button>
                )}
                <Button
                  type='button'
                  variant={hasExistingOperations ? 'secondary' : 'main'}
                  className='uppercase'
                  onClick={() => accept(hasExistingOperations ? 'replace' : 'append')}
                >
                  {hasExistingOperations ? 'заменить весь список' : 'принять в список'}
                </Button>
                <Button type='button' variant='secondary' onClick={() => setDraft(null)}>
                  отклонить черновик
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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

  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomLine[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as Array<{
    number?: number;
    part?: string;
  }>;

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

  return (
    <div className='space-y-3'>
      <Text variant='inactive' size='small'>
        Шаги сборки по порядку (оп. 10/20/30 — нумеруются автоматически по позиции). Выберите тип
        операции — машина и плотность подставятся автоматически. «часть» — где на изделии
        (справочно), «материал» — прямая ссылка на артикул, «пин» — номер выноски с эскиза.
      </Text>

      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          пока нет операций — добавьте первую
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <OperationRow
              key={f.id}
              index={index}
              onRemove={() => removeOperation(index)}
              pinOptions={pinOptions}
              bomLines={bomItems}
              activePin={activePin}
              onActivePinChange={onActivePinChange}
              activeBom={activeBom}
              onActiveBomChange={onActiveBomChange}
            />
          ))}
        </div>
      )}

      <GenerateOperationsPanel
        techCardId={techCardId}
        hasExistingOperations={fields.length > 0}
        onAccept={acceptGeneratedOperations}
      />

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyOperation })}
      >
        + операция
      </Button>
    </div>
  );
}
