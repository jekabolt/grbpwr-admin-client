import { cn } from 'lib/utility';
import { ChangeEvent, FocusEvent, KeyboardEvent, useRef, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import {
  CalloutBox,
  GroupLabel,
  HeaderNote,
  HeaderWarnings,
  Input,
  Text,
  type HeaderWarning,
} from 'ui';
import {
  auditModelMeasurementFieldsV1,
  EMPTY_MODEL_MEASUREMENT_FIELD_AUDIT_V1,
  type ModelMeasurementFieldAuditV1,
  type ModelMeasurementFieldFindingV1,
} from './model-measurement-field-audit';
import { MeasurementProtocolGuide } from './measurement-protocol-guide';
import { BODY_MEASUREMENT_GROUPS } from './measurements';
import { ModelFormData } from './schema';
import {
  measurementLabel,
  MOBILE_STRIP_PX,
  MODEL_MEASUREMENTS,
  shortMeasurementGroup,
  useSheetMeasurementFocus,
} from './sheet-measurement-focus';
import {
  displayMeasurementValue,
  measurementValueInMm,
  MeasurementUnitSwitch,
  useMeasurementUnit,
} from './units';

type MeasurementValues = Record<string, number | undefined>;

function useMeasurements(): MeasurementValues {
  const { control } = useFormContext<ModelFormData>();
  return (useWatch({ control, name: 'measurements' }) ?? {}) as MeasurementValues;
}

function filledCount(values: MeasurementValues, names: string[]): number {
  return names.filter((name) => Number(values[name]) > 0).length;
}

function measurementInputId(name: string): string {
  return `model-measurement-${name}`;
}

function measurementFindingListId(name: string): string {
  return `${measurementInputId(name)}-audit`;
}

function cleanMeasurementInput(value: string, unit: 'mm' | 'in'): string {
  const normalized = value.replace(',', '.');
  if (unit === 'mm') return normalized.replace(/[^0-9]/g, '');
  return normalized.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
}

function nextMeasurementInput(current: HTMLInputElement): HTMLInputElement | undefined {
  const inputs = Array.from(
    current.form?.querySelectorAll<HTMLInputElement>('[data-model-measurement]') ?? [],
  );
  return inputs[inputs.indexOf(current) + 1];
}

function MeasurementInput({
  name,
  findings,
}: {
  name: string;
  findings: readonly ModelMeasurementFieldFindingV1[];
}) {
  const { control } = useFormContext<ModelFormData>();
  const { field } = useController({ control, name: `measurements.${name}` });
  const { setFocus, setFocused } = useSheetMeasurementFocus();
  const { unit } = useMeasurementUnit();
  const [draft, setDraft] = useState<string | null>(null);
  const editStart = useRef<{ display: string; valueMm: number | undefined }>({
    display: '',
    valueMm: undefined,
  });
  const empty = !(Number(field.value) > 0);
  const shown = draft ?? displayMeasurementValue(field.value, unit);

  const writeEditedValue = (value: string) => {
    const nextValue =
      value === editStart.current.display
        ? editStart.current.valueMm
        : measurementValueInMm(value, unit);
    if (nextValue !== field.value) field.onChange(nextValue);
  };

  return (
    <Input
      {...field}
      id={measurementInputId(name)}
      data-model-measurement={name}
      data-mm={field.value ?? ''}
      data-unit={unit}
      inputMode={unit === 'mm' ? 'numeric' : 'decimal'}
      pattern={unit === 'mm' ? '[0-9]*' : '[0-9]*[.,]?[0-9]*'}
      enterKeyHint='next'
      autoComplete='off'
      aria-label={measurementLabel(name)}
      aria-invalid={findings.length > 0}
      aria-describedby={findings.length > 0 ? measurementFindingListId(name) : undefined}
      value={shown}
      placeholder='—'
      onFocus={(event: FocusEvent<HTMLInputElement>) => {
        const display = displayMeasurementValue(field.value, unit);
        editStart.current = { display, valueMm: field.value };
        setFocus(name);
        setFocused(name);
        setDraft(display);
        event.currentTarget.select();
        keepClearOfMobileStrip(event.currentTarget);
      }}
      onBlur={() => {
        setDraft(null);
        setFocused(null);
        field.onBlur();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          setDraft(null);
          nextMeasurementInput(event.currentTarget)?.focus();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
        if (/[0-9]/.test(event.key)) return;
        if (unit === 'in' && /[.,]/.test(event.key) && !/[.,]/.test(event.currentTarget.value))
          return;
        event.preventDefault();
      }}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const clean = cleanMeasurementInput(event.target.value, unit);
        setDraft(clean);
        writeEditedValue(clean);
      }}
      className={cn(
        'h-8 w-full py-0 text-right text-stat tabular-nums',
        empty && 'border-dashed border-highlightColor bg-bgColor',
      )}
    />
  );
}

function MeasurementFindingList({
  name,
  findings,
}: {
  name: string;
  findings: readonly ModelMeasurementFieldFindingV1[];
}) {
  if (findings.length === 0) return null;
  return (
    <ul id={measurementFindingListId(name)} className='flex flex-col gap-0.5'>
      {findings.map((finding) => (
        <li key={`${finding.code}:${finding.message}`}>
          <Text component='span' size='micro' variant='errorLabel' className='leading-tight'>
            ! {finding.message}
          </Text>
        </li>
      ))}
    </ul>
  );
}

function MeasurementLabel({ name }: { name: string }) {
  const measurements = useMeasurements();
  const empty = !(Number(measurements[name]) > 0);
  return (
    <label htmlFor={measurementInputId(name)}>
      <Text component='span' className={cn('leading-tight text-textColor', empty && 'font-bold')}>
        {measurementLabel(name)}
      </Text>
    </label>
  );
}

function MeasurementCell({
  name,
  findings,
}: {
  name: string;
  findings: readonly ModelMeasurementFieldFindingV1[];
}) {
  const { setHover } = useSheetMeasurementFocus();
  return (
    <div
      onMouseEnter={() => setHover(name)}
      onMouseLeave={() => setHover(null)}
      className='flex min-w-0 flex-col gap-1'
    >
      <MeasurementLabel name={name} />
      <MeasurementInput name={name} findings={findings} />
      <MeasurementFindingList name={name} findings={findings} />
    </div>
  );
}

function MeasurementGroup({
  title,
  measurements,
  audit,
}: {
  title: string;
  measurements: (typeof MODEL_MEASUREMENTS)[number][];
  audit: ModelMeasurementFieldAuditV1;
}) {
  const values = useMeasurements();
  const { unit } = useMeasurementUnit();
  const names = measurements.map((measurement) => measurement.name as string);
  const filled = filledCount(values, names);

  return (
    <div className='min-w-0'>
      <GroupLabel
        flush
        action={
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {filled < names.length ? (
              <span className='text-highlightColor'>
                {filled}/{names.length} ·{' '}
              </span>
            ) : null}
            {unit}
          </Text>
        }
      >
        <span className='text-textColor'>{shortMeasurementGroup(title)}</span>
      </GroupLabel>
      <div className='flex flex-col gap-3 pt-3'>
        {measurements.map((measurement) => (
          <MeasurementCell
            key={measurement.name}
            name={measurement.name}
            findings={audit.byMeasurementName[measurement.name] ?? []}
          />
        ))}
      </div>
    </div>
  );
}

function useMeasurementFieldAudit(showAudit: boolean): ModelMeasurementFieldAuditV1 {
  const values = useMeasurements();
  return showAudit ? auditModelMeasurementFieldsV1(values) : EMPTY_MODEL_MEASUREMENT_FIELD_AUDIT_V1;
}

export function MeasurementsHeaderActions({ showAudit = false }: { showAudit?: boolean }) {
  const audit = useMeasurementFieldAudit(showAudit);
  const { setFocus } = useSheetMeasurementFocus();
  const warnings = buildMeasurementHeaderWarnings(audit, (name) => {
    setFocus(name);
    window.requestAnimationFrame(() => document.getElementById(measurementInputId(name))?.focus());
  });
  return (
    <div className='flex items-center gap-2'>
      <HeaderWarnings items={warnings} countOnly />
      <HeaderNote
        tone='attention'
        title='editing a value clears its source/protocol metadata; repeated readings are not stored'
      >
        protocol v1.1 · readings unrecorded
      </HeaderNote>
      <MeasurementUnitSwitch />
    </div>
  );
}

export function buildMeasurementHeaderWarnings(
  audit: ModelMeasurementFieldAuditV1,
  focusMeasurement: (name: string) => void,
): HeaderWarning[] {
  const warnings: HeaderWarning[] = Object.entries(audit.byMeasurementName).flatMap(
    ([name, findings]) =>
      findings.map((finding) => {
        const label = measurementLabel(name);
        return {
          text: `${label}: ${finding.message}`,
          error: true,
          action: {
            label: `focus ${label}`,
            onClick: () => focusMeasurement(name),
          },
        };
      }),
  );
  if (audit.unassignedErrorCount > 0) {
    warnings.push({ text: 'measurement mapping needs review', error: true });
  }
  return warnings;
}

function MeasurementAuditStatus({ audit }: { audit: ModelMeasurementFieldAuditV1 }) {
  const hasErrors = audit.errorCount > 0;
  const issueLabel = `${audit.errorCount} measurement ${audit.errorCount === 1 ? 'issue' : 'issues'}`;
  return (
    <CalloutBox tone={hasErrors ? 'error' : 'note'}>
      <Text component='span' size='micro'>
        {hasErrors ? (
          <>
            <b>{issueLabel}</b> · review the marked fields before using this profile for a mannequin
          </>
        ) : (
          <>structural checks pass · protocol use is not verified</>
        )}
      </Text>
    </CalloutBox>
  );
}

export function MeasurementsFields({ showAudit = false }: { showAudit?: boolean }) {
  const audit = useMeasurementFieldAudit(showAudit);
  return (
    <div className='flex flex-col gap-4'>
      {showAudit && <MeasurementAuditStatus audit={audit} />}
      <MeasurementProtocolGuide />
      <div className='grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3 xl:grid-cols-5'>
        {BODY_MEASUREMENT_GROUPS.map((group) => (
          <MeasurementGroup
            key={group.title}
            title={group.title}
            measurements={group.measurements}
            audit={audit}
          />
        ))}
      </div>
    </div>
  );
}

// On a phone the hint strip covers the top of the visible viewport; once the keyboard has settled,
// move a field that ended up under it down into view.
function keepClearOfMobileStrip(input: HTMLInputElement) {
  const vv = window.visualViewport;
  if (!vv || window.matchMedia('(min-width: 768px)').matches) return;
  window.setTimeout(() => {
    const top = input.getBoundingClientRect().top - vv.offsetTop;
    const clear = MOBILE_STRIP_PX + 12;
    if (top < clear) window.scrollBy({ top: top - clear });
  }, 300);
}
