import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { BomLinePicker } from './bom-line-picker';
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
import { placementOptions } from './tech-card-options';

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
  const bomLineKey = (useWatch({ control, name: `operations.${index}.bomLineKey` }) ??
    '') as string;
  const linkedMaterial = bomLineKey ? bomLines.find((b) => b.lineKey === bomLineKey) : undefined;
  const bomOutOfRange = !!bomLineKey && !linkedMaterial;
  const linked =
    (!!activePin && activePin > 0 && calloutNumber === activePin) ||
    (activeBom != null && !!bomLineKey && bomLineKey === activeBom);

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
    if (!bomLineKey) return;
    const line = bomLines.find((b) => b.lineKey === bomLineKey);
    if (line?.section === 'TECH_CARD_BOM_SECTION_THREAD' && line.name?.trim()) {
      const cur = getValues(`operations.${index}`);
      if (!cur.thread?.trim()) {
        setValue(`operations.${index}.thread`, line.name, { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bomLineKey, index, getValues, setValue]);

  return (
    <div
      onMouseEnter={() => {
        onActivePinChange?.(calloutNumber > 0 ? calloutNumber : null);
        onActiveBomChange?.(bomLineKey || null);
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
          {linkedMaterial?.name?.trim() && (
            <Text variant='inactive' size='small' className='truncate lowercase'>
              · 🧵 {linkedMaterial.name}
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
        <ComboField
          name={`operations.${index}.placement`}
          label='часть'
          placeholder='collar / sleeve…'
          options={placementOptions}
        />
        <ComboField name={`operations.${index}.machine`} label='машина' options={machineOptions} />
        <BomLinePicker
          name={`operations.${index}.bomLineKey`}
          label='мат. напрямую'
          noneLabel='— материал —'
          // #64: this field is for a direct off-part material (thread / fusing), per the hint below —
          // scope the picker to those sections instead of listing every BOM article.
          sections={['TECH_CARD_BOM_SECTION_THREAD', 'TECH_CARD_BOM_SECTION_INTERLINING']}
        />
        <SelectField
          name={`operations.${index}.calloutNumber`}
          label='пин'
          items={pinOptions}
          valueAsNumber
        />
      </div>

      <Text variant='inactive' size='small'>
        «часть» — где на изделии эта операция (справочно). «материал» — прямая ссылка на артикул вне
        части (нитка, клеевая).
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
            <ComboField name={`operations.${index}.thread`} label='нитки' options={threadOptions} />
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
  const { fields, append, remove } = useFieldArray({ control, name: 'operations' });

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
