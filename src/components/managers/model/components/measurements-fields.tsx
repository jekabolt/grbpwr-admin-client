import { measurementSurfaceGuideIsApproximateV1 } from 'components/shared/measurement-surface-guide-precision-v1';
import { cn } from 'lib/utility';
import {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useController, useFormContext, useFormState, useWatch } from 'react-hook-form';
import {
  Button,
  CalloutBox,
  GroupLabel,
  HeaderWarnings,
  Input,
  Text,
  type HeaderWarning,
  ViewSwitch,
} from 'ui';
import {
  auditModelMeasurementFieldsV1,
  EMPTY_MODEL_MEASUREMENT_FIELD_AUDIT_V1,
  type ModelMeasurementFieldAuditV1,
  type ModelMeasurementFieldFindingV1,
} from './model-measurement-field-audit';
import { BODY_MEASUREMENT_GROUPS } from './measurements';
import { ModelFormData } from './schema';
import { StaticMeasurementGuide } from './static-measurement-guide';
import {
  measurementLabel,
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
    hint: 'One measurement at a time with a matching visual guide.',
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

// iOS Safari offers contact AutoFill on a field whose id reads like a person's details: the proto
// enum carries the word NAME, so the DOM id is the bare field (`mq-hps-height`), never the enum.
function measurementInputId(name: string): string {
  return `mq-${name.replace('BODY_MEASUREMENT_NAME_', '').toLowerCase().replace(/_/g, '-')}`;
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
}: {
  name: string;
  findings: readonly ModelMeasurementFieldFindingV1[];
  onAdvance?: () => void;
  prominent?: boolean;
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
      inputMode='decimal'
      pattern={unit === 'mm' ? '[0-9]*' : '[0-9]*[.,]?[0-9]*'}
      enterKeyHint='next'
      autoComplete='off'
      autoCorrect='off'
      autoCapitalize='off'
      spellCheck={false}
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

/** `approx.` beside a field whose line on the mannequin is an approximate picture. */
function ApproxMark({ name }: { name: string }) {
  if (!measurementSurfaceGuideIsApproximateV1(name)) return null;
  return (
    <Text
      component='span'
      size='micro'
      variant='label'
      className='shrink-0'
      data-testid='measurement-approx'
    >
      approx.
    </Text>
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
  extraWarnings = [],
}: {
  showAudit?: boolean;
  mode?: MeasurementEntryModeV1;
  onModeChange?: (mode: MeasurementEntryModeV1) => void;
  /** Warnings of a block merged into this header (the phone mannequin): one `! N` per block. */
  extraWarnings?: readonly HeaderWarning[];
}) {
  const audit = useMeasurementFieldAudit(showAudit);
  const { setFocus } = useSheetMeasurementFocus();
  const warnings = [
    ...buildMeasurementHeaderWarnings(audit, (name) => {
      setFocus(name);
      window.requestAnimationFrame(() =>
        document.getElementById(measurementInputId(name))?.focus(),
      );
    }),
    ...extraWarnings,
  ];
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

// The group switch has eight segments in two rows of four; the two long group names are cut to one
// word there (approved mockup). The guided view and the narrow table keep their own short names.
const GROUP_SWITCH_LABEL: Record<string, string> = {
  'shoulder / armscye': 'shoulder',
  'bust landmarks': 'bust',
};

function groupSwitchLabel(title: string): string {
  return GROUP_SWITCH_LABEL[title] ?? shortMeasurementGroup(title);
}

function measurementGroupIndex(name: string | null | undefined): number {
  if (!name) return -1;
  return BODY_MEASUREMENT_GROUPS.findIndex(({ measurements }) =>
    measurements.some((measurement) => measurement.name === name),
  );
}

/** Where Tab / Shift+Tab leaves a field of the grouped table; null = the browser's own move. */
export function measurementGroupTabTargetV1(
  groupIndex: number,
  name: string,
  shiftKey: boolean,
): { groupIndex: number; name: string } | null {
  const group = BODY_MEASUREMENT_GROUPS[groupIndex];
  if (!group) return null;
  const names = group.measurements.map((measurement) => measurement.name as string);
  if (!shiftKey && name === names[names.length - 1]) {
    const next = BODY_MEASUREMENT_GROUPS[groupIndex + 1];
    const first = next?.measurements[0]?.name;
    return first ? { groupIndex: groupIndex + 1, name: first } : null;
  }
  if (shiftKey && name === names[0]) {
    const previous = BODY_MEASUREMENT_GROUPS[groupIndex - 1];
    const last = previous?.measurements[previous.measurements.length - 1]?.name;
    return last ? { groupIndex: groupIndex - 1, name: last } : null;
  }
  return null;
}

/** The counter of one group-switch segment: error beats incomplete beats done. */
export function measurementGroupCountV1(
  values: MeasurementValues,
  names: readonly string[],
  hasError: (name: string) => boolean,
): { text: string; tone: 'mut' | 'attention' | 'error' } {
  const filled = filledCount(values, [...names]);
  return {
    text: `${filled}/${names.length}`,
    tone: names.some(hasError) ? 'error' : filled < names.length ? 'attention' : 'mut',
  };
}

/** First field (form order) holding an error — the group a submit opens. */
export function firstMeasurementWithErrorV1(
  hasError: (name: string) => boolean,
): { groupIndex: number; name: string } | null {
  const first = MODEL_MEASUREMENTS.find((measurement) => hasError(measurement.name));
  return first ? { groupIndex: measurementGroupIndex(first.name), name: first.name } : null;
}

/** The field the phone bar's ‹ / › moves to, across group boundaries; null past either end. */
export function measurementStepV1(
  name: string,
  direction: -1 | 1,
): { groupIndex: number; name: string } | null {
  const index = MODEL_MEASUREMENTS.findIndex((measurement) => measurement.name === name);
  if (index < 0) return null;
  const next = MODEL_MEASUREMENTS[index + direction];
  return next ? { groupIndex: measurementGroupIndex(next.name), name: next.name } : null;
}

/** `torso · 1/6`: the group as the group switch names it, and the field's place in that group. */
export function measurementDockGroupLabelV1(name: string): string {
  const group = BODY_MEASUREMENT_GROUPS[measurementGroupIndex(name)];
  if (!group) return '';
  const position = group.measurements.findIndex((measurement) => measurement.name === name) + 1;
  return `${groupSwitchLabel(group.title)} · ${position}/${group.measurements.length}`;
}

// A press anywhere on the bar keeps focus (and the keyboard) on the typed field: pointerdown for
// Chrome, mousedown for a WebKit tap whose compatibility mouse events still come.
const keepKeyboardOpen = (event: SyntheticEvent) => event.preventDefault();

// ‹ and › answer over the bar's full height and out to the screen edge / the gap: a thumb that
// lands a few px off the 44 px button still steps instead of falling on the bar.
const DOCK_STEP_HIT_AREA =
  "relative after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']";

/**
 * Phone bar right above the keyboard while a field is typed: ‹ · group / label · value · ›. The
 * focused input itself is placed into the value slot (sheet-model-form.css), so the caret, the
 * selection and the digit pad stay the real field's. The iPhone digit pad has no Return key: ›
 * is the way forward and is never disabled; on the very last field it closes the keyboard. ‹ on
 * the first field is `aria-disabled`, not `disabled`: a disabled button drops the press to the
 * page, and the field with it.
 */
function PhoneMeasurementDock({
  name,
  onStep,
}: {
  name: string;
  onStep: (direction: -1 | 1) => void;
}) {
  return (
    <div
      data-mq-phone-dock=''
      data-testid='model-measurement-phone-dock'
      className='fixed inset-x-0 z-[calc(var(--z-nav)+2)] grid grid-cols-[3rem_minmax(0,1fr)_6.875rem_3rem] items-center gap-2 border-t border-textColor bg-bgColor px-2'
      onPointerDown={keepKeyboardOpen}
      onMouseDown={keepKeyboardOpen}
    >
      <Button
        type='button'
        variant='secondary'
        className={cn(
          'h-11 aria-disabled:cursor-not-allowed aria-disabled:text-borderColor aria-disabled:hover:bg-bgColor aria-disabled:hover:text-borderColor',
          DOCK_STEP_HIT_AREA,
        )}
        aria-label='previous field'
        aria-disabled={measurementStepV1(name, -1) ? undefined : true}
        onClick={() => onStep(-1)}
      >
        ‹
      </Button>
      <div className='min-w-0'>
        <Text component='p' size='micro' variant='label' className='uppercase tabular-nums'>
          {measurementDockGroupLabelV1(name)}
        </Text>
        <div className='flex min-w-0 items-baseline gap-1.5'>
          <Text component='p' className='truncate text-textColor'>
            {measurementLabel(name)}
          </Text>
          <ApproxMark name={name} />
        </div>
      </div>
      <span aria-hidden='true' />
      <Button
        type='button'
        variant='secondary'
        className={cn('h-11', DOCK_STEP_HIT_AREA)}
        aria-label='next field'
        onClick={() => onStep(1)}
      >
        ›
      </Button>
    </div>
  );
}

function GroupedMeasurementRow({
  name,
  findings,
  onAdvance,
}: {
  name: string;
  findings: readonly ModelMeasurementFieldFindingV1[];
  onAdvance: () => void;
}) {
  const { setHover } = useSheetMeasurementFocus();
  const measurements = useMeasurements();
  const empty = !(Number(measurements[name]) > 0);
  return (
    <div
      onMouseEnter={() => setHover(name)}
      onMouseLeave={() => setHover(null)}
      className='grid min-h-9 grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-2.5 gap-y-1 py-0.5'
    >
      <div className='flex min-w-0 items-baseline gap-1.5'>
        <label htmlFor={measurementInputId(name)} className='min-w-0'>
          <Text
            component='span'
            className={cn('block truncate text-textColor', empty && 'font-bold')}
          >
            {measurementLabel(name)}
          </Text>
        </label>
        <ApproxMark name={name} />
      </div>
      <MeasurementInput name={name} findings={findings} onAdvance={onAdvance} />
      {findings.length > 0 ? (
        <div className='col-span-2'>
          <MeasurementFindingList name={name} findings={findings} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Desktop table view beside the mannequin: one measurement group at a time behind a group switch.
 * Every group stays mounted (hidden groups are `hidden`), so values, refs and validation are the
 * same RHF fields as in the narrow table and the guided view. Tab leaves the last field of a group
 * into the next group's first field and Shift+Tab goes back; a field selected from elsewhere (a
 * header warning, the guided view) or the first error after a submit opens its own group.
 */
export function MeasurementsGroupedTable({
  showAudit = false,
  phoneTypingName,
}: {
  showAudit?: boolean;
  /** Phone layout only: the field being typed (null when none); shows the bar above the keyboard. */
  phoneTypingName?: string | null;
}) {
  const values = useMeasurements();
  const audit = useMeasurementFieldAudit(showAudit);
  const { selected } = useSheetMeasurementFocus();
  const { control } = useFormContext<ModelFormData>();
  const { errors, submitCount } = useFormState({ control, name: 'measurements' });
  const [groupIndex, setGroupIndex] = useState(() => Math.max(0, measurementGroupIndex(selected)));
  const [focusRequest, setFocusRequest] = useState<{ name: string; tick: number } | null>(null);
  // Group of the field the bar is leaving, kept shown until the next field holds focus.
  const [leavingGroupIndex, setLeavingGroupIndex] = useState<number | null>(null);
  // The field the bar steps from: the last step's target right away, before React renders it, so
  // taps that arrive back to back on a busy main thread each move one field.
  const typingRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    typingRef.current = phoneTypingName ?? null;
  }, [phoneTypingName]);
  const fieldErrors = errors.measurements as Record<string, unknown> | undefined;
  const hasError = (name: string) =>
    (audit.byMeasurementName[name]?.length ?? 0) > 0 || !!fieldErrors?.[name];

  const open = (index: number, focusName?: string) => {
    const group = BODY_MEASUREMENT_GROUPS[index];
    if (!group) return;
    setGroupIndex(index);
    const name = focusName ?? (group.measurements[0]?.name as string | undefined);
    if (name) setFocusRequest((current) => ({ name, tick: (current?.tick ?? 0) + 1 }));
  };

  useEffect(() => {
    const index = measurementGroupIndex(selected);
    if (index >= 0) setGroupIndex(index);
  }, [selected]);

  useEffect(() => {
    if (!focusRequest) return;
    document.getElementById(measurementInputId(focusRequest.name))?.focus();
  }, [focusRequest]);

  // A submit with an error in a hidden group opens that group on the first such field.
  const lastSubmitCount = useRef(submitCount);
  useEffect(() => {
    if (submitCount === lastSubmitCount.current) return;
    lastSubmitCount.current = submitCount;
    const first = firstMeasurementWithErrorV1(hasError);
    if (first) open(first.groupIndex, first.name);
    // `hasError` reads the same render's audit and errors; only a new submit re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount]);

  const advanceFrom = (name: string) => {
    const index = MODEL_MEASUREMENTS.findIndex((measurement) => measurement.name === name);
    const next = MODEL_MEASUREMENTS[index + 1];
    if (next) open(measurementGroupIndex(next.name), next.name);
  };

  // The bar's ‹ / ›: the next field is focused inside the tap, so the open keyboard stays open
  // (iOS keeps it only for a focus made in the gesture); its group is rendered visible first. The
  // group being left stays shown until then: a focused input turned `hidden` drops focus to the
  // page, and the keyboard with it.
  const step = (direction: -1 | 1) => {
    const current = typingRef.current;
    if (!current) return;
    const target = measurementStepV1(current, direction);
    if (!target) {
      if (direction === 1) document.getElementById(measurementInputId(current))?.blur();
      return;
    }
    typingRef.current = target.name;
    const leaving = measurementGroupIndex(current);
    flushSync(() => {
      setGroupIndex(target.groupIndex);
      setLeavingGroupIndex(leaving === target.groupIndex ? null : leaving);
    });
    document.getElementById(measurementInputId(target.name))?.focus({ preventScroll: true });
    setLeavingGroupIndex(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const name = (event.target as HTMLElement).dataset?.modelMeasurement;
    const target = name ? measurementGroupTabTargetV1(groupIndex, name, event.shiftKey) : null;
    if (!target) return;
    event.preventDefault();
    open(target.groupIndex, target.name);
  };

  const options = BODY_MEASUREMENT_GROUPS.map((group) => ({
    value: group.title,
    label: groupSwitchLabel(group.title),
    count: measurementGroupCountV1(
      values,
      group.measurements.map((measurement) => measurement.name as string),
      hasError,
    ),
  }));

  return (
    <div className='flex flex-col gap-stack' data-testid='measurements-grouped-table'>
      <ViewSwitch<string>
        label='measurement group'
        value={BODY_MEASUREMENT_GROUPS[groupIndex]?.title ?? ''}
        options={options}
        columns={4}
        onChange={(title) =>
          open(BODY_MEASUREMENT_GROUPS.findIndex((group) => group.title === title))
        }
      />
      <div onKeyDown={onKeyDown}>
        {BODY_MEASUREMENT_GROUPS.map((group, index) => (
          <div
            key={group.title}
            role='group'
            aria-label={groupSwitchLabel(group.title)}
            hidden={index !== groupIndex && index !== leavingGroupIndex}
            data-measurement-group={group.title}
            className='flex flex-col divide-y divide-hairline'
          >
            {group.measurements.map((measurement) => (
              <GroupedMeasurementRow
                key={measurement.name}
                name={measurement.name}
                findings={audit.byMeasurementName[measurement.name] ?? []}
                onAdvance={() => advanceFrom(measurement.name)}
              />
            ))}
          </div>
        ))}
      </div>
      {phoneTypingName ? <PhoneMeasurementDock name={phoneTypingName} onStep={step} /> : null}
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

/**
 * Guided measurement entry keeps exactly one RHF-controlled field mounted. Switching to the table
 * remounts the same field names against the same form owner, so values, dirty state and validation
 * survive the view change without a second draft store.
 */
export function MeasurementsQuiz({
  showAudit = false,
  onComplete,
}: {
  showAudit?: boolean;
  onComplete: () => void;
}) {
  const values = useMeasurements();
  const audit = useMeasurementFieldAudit(showAudit);
  const { selected, setFocus } = useSheetMeasurementFocus();
  const { unit } = useMeasurementUnit();
  const gender = useWatch<ModelFormData>({ name: 'gender' }) as string | undefined;
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      MODEL_MEASUREMENTS.findIndex((measurement) => measurement.name === selected),
    ),
  );
  const measurement = MODEL_MEASUREMENTS[activeIndex] ?? MODEL_MEASUREMENTS[0];
  const name = measurement?.name as string;
  const findings = audit.byMeasurementName[name] ?? [];
  const filled = filledCount(
    values,
    MODEL_MEASUREMENTS.map((item) => item.name as string),
  );
  const atFirst = activeIndex === 0;
  const atLast = activeIndex === MODEL_MEASUREMENTS.length - 1;

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
          className='flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-pageBg p-2 md:border-r md:border-borderColor md:p-4'
          data-testid='measurements-guided-preview'
        >
          <StaticMeasurementGuide measurementName={name} gender={gender} />
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
              onAdvance={() => (atLast ? onComplete() : move(activeIndex + 1))}
            />
            <MeasurementFindingList name={name} findings={findings} />
          </div>

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
