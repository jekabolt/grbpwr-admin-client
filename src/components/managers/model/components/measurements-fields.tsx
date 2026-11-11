import { cn } from 'lib/utility';
import { ChangeEvent, FocusEvent, KeyboardEvent, useRef, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { LineField, Text } from 'ui';
import { BODY_MEASUREMENT_GROUPS } from './measurements';
import { usePinFor } from './model-pins';
import { ModelFormData } from './schema';
import {
  measurementLabel,
  MOBILE_STRIP_PX,
  shortMeasurementGroup,
  useSheetMeasurementFocus,
} from './sheet-measurement-focus';
import {
  displayMeasurementValue,
  MeasurementUnit,
  measurementValueInMm,
  MeasurementUnitSwitch,
  useMeasurementUnit,
} from './units';

/** The primary ones: a full row each (Lekalo frame). */
const FULL_ROW = new Set(['BODY_MEASUREMENT_NAME_INSEAM', 'BODY_MEASUREMENT_NAME_HEIGHT']);

const UPPER = new Set(['cb']);
const LOWER = new Set(['to']);

/** `hps to waist (front)` → `Hps to Waist (Front)`; `cb` stays an abbreviation. */
export function titleCase(text: string): string {
  return text.replace(/[a-z]+/gi, (word, offset: number) => {
    const w = word.toLowerCase();
    if (UPPER.has(w)) return w.toUpperCase();
    if (offset > 0 && LOWER.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}

function groupTitle(title: string): string {
  const short = shortMeasurementGroup(title);
  return titleCase(short === 'widths' ? 'width' : short);
}

function measurementInputId(name: string): string {
  return `model-measurement-${name}`;
}

function cleanMeasurementInput(value: string, unit: MeasurementUnit): string {
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

/** One measurement as a `LineField`. `scope='card'` is the active card's copy: same form field, own id. */
export function MeasurementLine({
  name,
  scope = 'panel',
}: {
  name: string;
  scope?: 'panel' | 'card';
}) {
  const { control } = useFormContext<ModelFormData>();
  const { field } = useController({ control, name: `measurements.${name}` });
  const { setFocus, setFocused, setHover } = useSheetMeasurementFocus();
  const { unit } = useMeasurementUnit();
  const label = titleCase(measurementLabel(name));
  const pin = usePinFor(name, measurementLabel(name));
  const [draft, setDraft] = useState<string | null>(null);
  const editStart = useRef<{ display: string; valueMm: number | undefined }>({
    display: '',
    valueMm: undefined,
  });
  const shown = draft ?? displayMeasurementValue(field.value, unit);

  const writeEditedValue = (value: string) => {
    const nextValue =
      value === editStart.current.display
        ? editStart.current.valueMm
        : measurementValueInMm(value, unit);
    if (nextValue !== field.value) field.onChange(nextValue);
  };

  return (
    <div
      onMouseEnter={() => setHover(name)}
      onMouseLeave={() => setHover(null)}
      className={cn('min-w-0', scope === 'panel' && FULL_ROW.has(name) && '@[28.75rem]:col-span-2')}
    >
      <LineField
        ref={field.ref}
        name={field.name}
        id={`${measurementInputId(name)}${scope === 'card' ? '-card' : ''}`}
        label={label}
        pin={pin}
        data-model-measurement={scope === 'panel' ? name : undefined}
        data-mm={field.value ?? ''}
        data-unit={unit}
        inputMode={unit === 'mm' ? 'numeric' : 'decimal'}
        pattern={unit === 'mm' ? '[0-9]*' : '[0-9]*[.,]?[0-9]*'}
        enterKeyHint='next'
        autoComplete='off'
        value={shown}
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
          if (unit !== 'mm' && /[.,]/.test(event.key) && !/[.,]/.test(event.currentTarget.value))
            return;
          event.preventDefault();
        }}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const clean = cleanMeasurementInput(event.target.value, unit);
          setDraft(clean);
          writeEditedValue(clean);
        }}
      />
    </div>
  );
}

export function MeasurementsHeaderActions() {
  return <MeasurementUnitSwitch />;
}

/**
 * Groups Torso / Arms / Legs / Vertical / Width, fields in the panel's grid: two columns when the
 * panel's content is ≥ 460px wide, one below. Inseam and Height take a full row.
 */
export function MeasurementsFields() {
  return (
    <div className='@container flex flex-col gap-8'>
      {BODY_MEASUREMENT_GROUPS.map((group) => (
        <div key={group.title} className='flex flex-col gap-2'>
          <Text component='h3' className='text-ink'>
            {groupTitle(group.title)}
          </Text>
          <div className='grid grid-cols-1 gap-x-6.5 gap-y-4 @[28.75rem]:grid-cols-2'>
            {group.measurements.map((m) => (
              <MeasurementLine key={m.name} name={m.name} />
            ))}
          </div>
        </div>
      ))}
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
