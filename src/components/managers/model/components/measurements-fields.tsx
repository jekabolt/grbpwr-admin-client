import { cn } from 'lib/utility';
import {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import {
  Button,
  CalloutBox,
  GroupLabel,
  HeaderNote,
  HeaderWarnings,
  Input,
  Text,
  type HeaderWarning,
  ViewSwitch,
} from 'ui';
import { getBodyMeasurementProtocolFieldV1 } from 'lib/cloth/body/measurement-protocol-v1';
import { resolveModelGuidedMeasurementPreviewInputV1 } from './model-guided-measurement-preview-input-v1';
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
  type MeasurementUnit,
  measurementValueInMm,
  MeasurementUnitSwitch,
  useMeasurementUnit,
} from './units';

export type MeasurementEntryModeV1 = 'guided' | 'table';

const MEASUREMENT_ENTRY_MODE_OPTIONS = [
  {
    value: 'guided',
    label: 'guided',
    hint: 'One measurement at a time with the active path on the mannequin.',
  },
  {
    value: 'table',
    label: 'table',
    hint: 'All measurement fields together for rapid entry and review.',
  },
] as const;

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
  onAdvance,
  prominent = false,
  preserveViewportOnFocus = false,
}: {
  name: string;
  findings: readonly ModelMeasurementFieldFindingV1[];
  onAdvance?: () => void;
  prominent?: boolean;
  preserveViewportOnFocus?: boolean;
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
        if (!preserveViewportOnFocus) keepClearOfMobileStrip(event.currentTarget);
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
          if (onAdvance) onAdvance();
          else nextMeasurementInput(event.currentTarget)?.focus();
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
        prominent
          ? 'h-12 w-full py-0 text-right text-statBig tabular-nums'
          : 'h-8 w-full py-0 text-right text-stat tabular-nums',
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

export function MeasurementsHeaderActions({
  showAudit = false,
  mode,
  onModeChange,
}: {
  showAudit?: boolean;
  mode?: MeasurementEntryModeV1;
  onModeChange?: (mode: MeasurementEntryModeV1) => void;
}) {
  const audit = useMeasurementFieldAudit(showAudit);
  const { setFocus } = useSheetMeasurementFocus();
  const warnings = buildMeasurementHeaderWarnings(audit, (name) => {
    setFocus(name);
    window.requestAnimationFrame(() => document.getElementById(measurementInputId(name))?.focus());
  });
  return (
    <div className='flex flex-wrap items-center justify-end gap-2'>
      {mode && onModeChange ? (
        <ViewSwitch<MeasurementEntryModeV1>
          value={mode}
          options={MEASUREMENT_ENTRY_MODE_OPTIONS}
          onChange={onModeChange}
          label='measurement entry view'
          quiet
        />
      ) : null}
      <HeaderWarnings items={warnings} countOnly />
      <HeaderNote
        tone='attention'
        className='hidden sm:inline'
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

export function preferredMeasurementEntryModeV1(viewportWidth: number | undefined) {
  return viewportWidth != null && viewportWidth < 768 ? ('guided' as const) : ('table' as const);
}

function measurementGroupLabel(name: string): string {
  const group = BODY_MEASUREMENT_GROUPS.find(({ measurements }) =>
    measurements.some((measurement) => measurement.name === name),
  );
  return shortMeasurementGroup(group?.title ?? 'measurement');
}

function formatQuizTolerance(toleranceMm: number, unit: MeasurementUnit): string {
  return `${displayMeasurementValue(toleranceMm, unit)} ${unit}`;
}

/**
 * Guided measurement entry keeps exactly one RHF-controlled field mounted. Switching to the table
 * remounts the same field names against the same form owner, so values, dirty state and validation
 * survive the view change without a second draft store.
 */
export function MeasurementsQuiz({
  preview,
  showAudit = false,
  onComplete,
}: {
  preview: ReactNode;
  showAudit?: boolean;
  onComplete: () => void;
}) {
  const values = useMeasurements();
  const audit = useMeasurementFieldAudit(showAudit);
  const { selected, setFocus } = useSheetMeasurementFocus();
  const { unit } = useMeasurementUnit();
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      MODEL_MEASUREMENTS.findIndex((measurement) => measurement.name === selected),
    ),
  );
  const measurement = MODEL_MEASUREMENTS[activeIndex] ?? MODEL_MEASUREMENTS[0];
  const name = measurement?.name as string;
  const findings = audit.byMeasurementName[name] ?? [];
  const field = getBodyMeasurementProtocolFieldV1(name);
  const filled = filledCount(
    values,
    MODEL_MEASUREMENTS.map((item) => item.name as string),
  );
  const atFirst = activeIndex === 0;
  const atLast = activeIndex === MODEL_MEASUREMENTS.length - 1;
  const guidedPreview = resolveModelGuidedMeasurementPreviewInputV1({
    gender: undefined,
    measurements: values,
  });

  useEffect(() => {
    const selectedIndex = MODEL_MEASUREMENTS.findIndex((candidate) => candidate.name === selected);
    if (selectedIndex >= 0 && selectedIndex !== activeIndex) setActiveIndex(selectedIndex);
  }, [activeIndex, selected]);

  const move = (nextIndex: number) => {
    const next = MODEL_MEASUREMENTS[nextIndex];
    if (!next) return;
    setActiveIndex(nextIndex);
    setFocus(next.name);
    window.requestAnimationFrame(() =>
      document.getElementById(measurementInputId(next.name))?.focus({ preventScroll: true }),
    );
  };

  if (!measurement) return null;

  return (
    <div
      className='flex h-[calc(100dvh-9.5rem)] min-h-0 flex-col gap-stack md:h-[min(46rem,calc(100dvh-12rem))] md:min-h-[34rem]'
      data-testid='measurements-guided-entry'
    >
      <div className='flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.7fr)]'>
        <div
          className='min-h-0 flex-1 bg-pageBg md:border-r md:border-borderColor'
          data-testid='measurements-guided-preview'
        >
          {preview}
        </div>

        <div className='flex shrink-0 flex-col gap-2 border-t border-borderColor bg-bgColor p-3 md:min-h-0 md:border-t-0 md:p-4'>
          <div className='flex items-baseline justify-between gap-3 border-b border-borderColor pb-2'>
            <div className='min-w-0'>
              <Text component='p' size='micro' variant='label' className='uppercase'>
                {measurementGroupLabel(name)}
              </Text>
              <Text component='h4' className='truncate font-bold text-textColor'>
                {measurementLabel(name)}
              </Text>
            </div>
            <Text component='span' size='micro' variant='label' className='shrink-0 tabular-nums'>
              {activeIndex + 1}/{MODEL_MEASUREMENTS.length} · {filled} filled
            </Text>
          </div>

          <div className='flex min-w-0 flex-col gap-1'>
            <label htmlFor={measurementInputId(name)}>
              <Text component='span' size='micro' variant='label'>
                value · {unit}
              </Text>
            </label>
            <MeasurementInput
              key={name}
              name={name}
              findings={findings}
              prominent
              preserveViewportOnFocus
              onAdvance={() => (atLast ? onComplete() : move(activeIndex + 1))}
            />
            <MeasurementFindingList name={name} findings={findings} />
          </div>

          {field ? (
            <div
              className='min-h-0 border-t border-hairline pt-2'
              data-testid='measurement-guided-protocol'
            >
              <Text component='p' size='micro' className='leading-tight text-textColor'>
                {field.shortDefinition}
              </Text>
              <Text component='p' size='nano' variant='label' className='mt-1 leading-tight'>
                repeat tolerance {formatQuizTolerance(field.repeatToleranceMm, unit)} · two
                independent readings
              </Text>
            </div>
          ) : null}

          <Text component='p' size='nano' variant='label' className='leading-tight md:mt-auto'>
            when shown, the highlighted path is a visual guide only · follow the written measurement
            protocol
          </Text>

          {guidedPreview.usesReferenceBody ? (
            <Text
              component='p'
              size='nano'
              variant='label'
              className='leading-tight'
              role='status'
              data-testid='measurement-guided-reference-body-status'
              data-reference-required-missing={guidedPreview.missingRequiredNames.length}
            >
              reference body · {guidedPreview.missingRequiredNames.length} required measurements
              missing · entered values replace the reference live
            </Text>
          ) : null}

          <div className='mt-auto grid grid-cols-2 gap-2 border-t border-borderColor pt-2'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              disabled={atFirst}
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
                event.preventDefault()
              }
              onClick={() => move(activeIndex - 1)}
            >
              previous
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
                event.preventDefault()
              }
              onClick={() => (atLast ? onComplete() : move(activeIndex + 1))}
            >
              {atLast ? 'review table' : 'next'}
            </Button>
          </div>
        </div>
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
