import { cn } from 'lib/utility';
import { ChangeEvent, FocusEvent, KeyboardEvent, useRef, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { Button, GroupLabel, Input, Text } from 'ui';
import { BODY_MEASUREMENT_GROUPS } from './measurements';
import { ModelFormData } from './schema';
import {
  measurementLabel,
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

function MeasurementInput({ name }: { name: string }) {
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
        'h-6 w-full max-w-28 py-0 text-right text-stat tabular-nums',
        empty && 'border-dashed border-highlightColor bg-bgColor',
      )}
    />
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

function MeasurementCell({ name }: { name: string }) {
  const { setHover } = useSheetMeasurementFocus();
  return (
    <div
      onMouseEnter={() => setHover(name)}
      onMouseLeave={() => setHover(null)}
      className='flex min-w-0 flex-col gap-0.5'
    >
      <MeasurementLabel name={name} />
      <MeasurementInput name={name} />
    </div>
  );
}

function MeasurementGroup({
  title,
  measurements,
}: {
  title: string;
  measurements: (typeof MODEL_MEASUREMENTS)[number][];
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
      <div className='flex flex-col gap-0.5 pt-0.5'>
        {measurements.map((measurement) => (
          <MeasurementCell key={measurement.name} name={measurement.name} />
        ))}
      </div>
    </div>
  );
}

function MeasurementCounter() {
  const values = useMeasurements();
  const names = MODEL_MEASUREMENTS.map((measurement) => measurement.name as string);
  const filled = filledCount(values, names);
  const firstEmpty = names.find((name) => !(Number(values[name]) > 0));

  const focusFirstEmpty = () => {
    if (!firstEmpty) return;
    const input = document.getElementById(
      measurementInputId(firstEmpty),
    ) as HTMLInputElement | null;
    input?.scrollIntoView({ block: 'center' });
    input?.focus({ preventScroll: true });
  };

  return (
    <Button
      type='button'
      variant='underline'
      size='xs'
      aria-label='first empty'
      onClick={focusFirstEmpty}
      className={cn('tabular-nums', firstEmpty && 'text-highlightColor')}
    >
      {filled}/{names.length}
    </Button>
  );
}

export function MeasurementsHeaderActions() {
  return (
    <div className='flex items-center gap-2'>
      <MeasurementCounter />
      <MeasurementUnitSwitch />
    </div>
  );
}

export function MeasurementsFields() {
  return (
    <div className='grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3 xl:grid-cols-5'>
      {BODY_MEASUREMENT_GROUPS.map((group) => (
        <MeasurementGroup key={group.title} title={group.title} measurements={group.measurements} />
      ))}
    </div>
  );
}
