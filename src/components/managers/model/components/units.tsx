import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { BracketOptions } from 'ui';

export type MeasurementUnit = 'mm' | 'cm' | 'in';

const UNIT_STORAGE_KEY = 'model-form-unit';
const UNITS: readonly MeasurementUnit[] = ['mm', 'cm', 'in'];
const UNIT_OPTIONS = [
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
  { value: 'in', label: 'inch' },
] as const;
const MM_PER: Record<MeasurementUnit, number> = { mm: 1, cm: 10, in: 25.4 };

const MeasurementUnitContext = createContext<{
  unit: MeasurementUnit;
  setUnit: (unit: MeasurementUnit) => void;
} | null>(null);

function storedUnit(): MeasurementUnit {
  try {
    const stored = window.localStorage.getItem(UNIT_STORAGE_KEY);
    return UNITS.find((u) => u === stored) ?? 'mm';
  } catch {
    return 'mm';
  }
}

export function MeasurementUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setCurrentUnit] = useState<MeasurementUnit>(storedUnit);
  const setUnit = useCallback((next: MeasurementUnit) => {
    setCurrentUnit(next);
    try {
      window.localStorage.setItem(UNIT_STORAGE_KEY, next);
    } catch {
      // The preference remains active for this tab when storage is unavailable.
    }
  }, []);
  const value = useMemo(() => ({ unit, setUnit }), [setUnit, unit]);

  return (
    <MeasurementUnitContext.Provider value={value}>{children}</MeasurementUnitContext.Provider>
  );
}

export function useMeasurementUnit() {
  const value = useContext(MeasurementUnitContext);
  if (!value) throw new Error('no MeasurementUnitProvider');
  return value;
}

export function displayMeasurementValue(valueMm: unknown, unit: MeasurementUnit): string {
  const value = Number(valueMm);
  if (!(value > 0)) return '';
  if (unit === 'mm') return String(Math.round(value));
  return String(Number((value / MM_PER[unit]).toFixed(1)));
}

export function measurementValueInMm(
  displayValue: string,
  unit: MeasurementUnit,
): number | undefined {
  const value = Number(displayValue.replace(',', '.'));
  if (!(value > 0) || !Number.isFinite(value)) return undefined;
  return Math.round(value * MM_PER[unit]);
}

/** `[ mm ] cm inch` — the unit switch at the right of the Measurements title. */
export function MeasurementUnitSwitch() {
  const { unit, setUnit } = useMeasurementUnit();
  return (
    <BracketOptions
      options={UNIT_OPTIONS}
      value={unit}
      onChange={(next) => next && setUnit(next as MeasurementUnit)}
      ariaLabel='units'
      overflow={false}
    />
  );
}
