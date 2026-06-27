import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import {
  OPERATION_TYPE_PRESETS,
  attachmentOptions,
  colorwayColorSummary,
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

const emptyOperation = {
  operationNumber: 0,
  node: '',
  operationType: NONE_OP_TYPE,
  machine: '',
  zone: NONE_ZONE,
  bomItemIndex: -1, // -1 = no material linked
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
type BomColorwayColor = { colorwayIndex?: number; color?: string; pantone?: string };
type BomLine = { name?: string; section?: string; colorwayColors?: BomColorwayColor[] };

// One assembly operation. The compact line reads like a sentence (№ · verb · node ·
// machine · material · pin); the rare/industrial fields hide behind «детали».
function OperationRow({
  index,
  onRemove,
  bomOptions,
  pinOptions,
  bomLines,
  colorwayLabels,
  activePin,
  onActivePinChange,
  activeBom,
  onActiveBomChange,
}: {
  index: number;
  onRemove: () => void;
  bomOptions: PickerOption[];
  pinOptions: PickerOption[];
  bomLines: BomLine[];
  colorwayLabels: string[];
  activePin?: number | null;
  onActivePinChange?: (n: number | null) => void;
  activeBom?: number | null;
  onActiveBomChange?: (n: number | null) => void;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const [open, setOpen] = useState(false);
  const opType = useWatch({ control, name: `operations.${index}.operationType` }) as string;
  const calloutNumber = (useWatch({ control, name: `operations.${index}.calloutNumber` }) ??
    0) as number;
  const bomItemIndex = (useWatch({ control, name: `operations.${index}.bomItemIndex` }) ??
    -1) as number;
  const linkedMaterial = bomItemIndex >= 0 ? bomLines[bomItemIndex] : undefined;
  const bomOutOfRange = bomItemIndex >= 0 && bomItemIndex >= bomLines.length;
  const materialColorways = colorwayColorSummary(linkedMaterial?.colorwayColors, colorwayLabels);
  const linked =
    (!!activePin && activePin > 0 && calloutNumber === activePin) ||
    (activeBom != null && bomItemIndex >= 0 && bomItemIndex === activeBom);

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
    if (bomItemIndex < 0 || bomItemIndex >= bomLines.length) return;
    const line = bomLines[bomItemIndex];
    if (line?.section === 'TECH_CARD_BOM_SECTION_THREAD' && line.name?.trim()) {
      const cur = getValues(`operations.${index}`);
      if (!cur.thread?.trim()) {
        setValue(`operations.${index}.thread`, line.name, { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bomItemIndex, index, getValues, setValue]);

  return (
    <div
      onMouseEnter={() => {
        onActivePinChange?.(calloutNumber > 0 ? calloutNumber : null);
        onActiveBomChange?.(bomItemIndex >= 0 ? bomItemIndex : null);
      }}
      onMouseLeave={() => {
        onActivePinChange?.(null);
        onActiveBomChange?.(null);
      }}
      className={cn(
        'space-y-3 border p-3 transition-colors',
        linked ? 'border-textColor ring-1 ring-textColor' : 'border-textInactiveColor',
      )}
    >
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <Text variant='uppercase' size='small'>
            operation {index + 1}
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

      {/* compact line */}
      <div className='grid grid-cols-2 items-end gap-3 lg:grid-cols-12'>
        <div className='col-span-2 lg:col-span-1'>
          <InputField
            name={`operations.${index}.operationNumber`}
            type='number'
            valueAsNumber
            label='№'
            placeholder='10'
          />
        </div>
        <div className='col-span-2 lg:col-span-3'>
          <SelectField
            name={`operations.${index}.operationType`}
            label='операция *'
            items={operationTypeOptions}
          />
        </div>
        <div className='col-span-2 lg:col-span-3'>
          <ComboField
            name={`operations.${index}.node`}
            label='узел / что *'
            placeholder='плечевые швы'
            options={nodeOptions}
          />
        </div>
        <div className='col-span-1 lg:col-span-2'>
          <ComboField
            name={`operations.${index}.machine`}
            label='машина'
            options={machineOptions}
          />
        </div>
        <div className='col-span-1 lg:col-span-2'>
          <SelectField
            name={`operations.${index}.bomItemIndex`}
            label='материал'
            items={bomOptions}
            valueAsNumber
          />
        </div>
        <div className='col-span-2 lg:col-span-1'>
          <SelectField
            name={`operations.${index}.calloutNumber`}
            label='пин'
            items={pinOptions}
            valueAsNumber
          />
        </div>
      </div>

      {bomOutOfRange && (
        <Text size='small' className='text-error'>
          материал был удалён или перемещён — перевыберите его
        </Text>
      )}

      {materialColorways && (
        <Text variant='inactive' size='small'>
          цвет по колорвею — {materialColorways}
        </Text>
      )}

      {open && (
        <div className='space-y-3 border-t border-textInactiveColor pt-3'>
          <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
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
            <InputField name={`operations.${index}.timeNorm`} label='SAM (мин)' placeholder='1.8' />
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
}: {
  activePin?: number | null;
  onActivePinChange?: (n: number | null) => void;
  activeBom?: number | null;
  onActiveBomChange?: (n: number | null) => void;
} = {}) {
  const { control, getValues } = useFormContext<TechCardFormData>();
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'operations' });

  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomLine[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as Array<{
    number?: number;
    part?: string;
  }>;
  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    code?: string;
    name?: string;
  }>;
  const colorwayLabels = useMemo(
    () => colorways.map((c, i) => c.code?.trim() || c.name?.trim() || `#${i + 1}`),
    [colorways],
  );

  const bomOptions = useMemo<PickerOption[]>(
    () => [
      { value: -1, label: '— материал —' },
      ...bomItems.map((b, i) => ({
        value: i,
        label: b.name?.trim() ? `${i + 1}. ${b.name}` : `материал ${i + 1}`,
      })),
    ],
    [bomItems],
  );

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

  // Next number on the 10/20/30 grid (gaps leave room to insert a step later).
  const nextNumber = () => {
    const nums = (getValues('operations') ?? []).map((o) => o.operationNumber || 0);
    const max = nums.length ? Math.max(0, ...nums) : 0;
    return max > 0 ? max + 10 : 10;
  };

  const sortByNumber = () => {
    const ops = [...(getValues('operations') ?? [])];
    ops.sort((a, b) => (a.operationNumber || 0) - (b.operationNumber || 0));
    replace(ops);
  };

  return (
    <div className='space-y-3'>
      <Text variant='inactive' size='small'>
        Шаги сборки по порядку. Выберите тип операции — машина и плотность подставятся
        автоматически. «Материал» ссылается на строку BOM (нитка, бейка, клеевая), «пин» — на номер
        выноски с эскиза.
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
              onRemove={() => remove(index)}
              bomOptions={bomOptions}
              pinOptions={pinOptions}
              bomLines={bomItems}
              colorwayLabels={colorwayLabels}
              activePin={activePin}
              onActivePinChange={onActivePinChange}
              activeBom={activeBom}
              onActiveBomChange={onActiveBomChange}
            />
          ))}
        </div>
      )}

      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='main'
          className='uppercase'
          onClick={() => append({ ...emptyOperation, operationNumber: nextNumber() })}
        >
          + операция
        </Button>
        {fields.length > 1 && (
          <Button type='button' variant='secondary' className='uppercase' onClick={sortByNumber}>
            сортировать по №
          </Button>
        )}
      </div>
    </div>
  );
}
