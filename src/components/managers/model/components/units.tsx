import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { ViewSwitch } from 'ui';

export type MeasurementUnit = 'mm' | 'in';

const UNIT_STORAGE_KEY = 'model-form-unit';
const UNIT_OPTIONS = [
  { value: 'mm', label: 'mm' },
  { value: 'in', label: 'in' },
] as const;

const MeasurementUnitContext = createContext<{
  unit: MeasurementUnit;
  setUnit: (unit: MeasurementUnit) => void;
} | null>(null);

function storedUnit(): MeasurementUnit {
  try {
    return window.localStorage.getItem(UNIT_STORAGE_KEY) === 'in' ? 'in' : 'mm';
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
  return unit === 'mm' ? String(Math.round(value)) : (value / 25.4).toFixed(1);
}

export function measurementValueInMm(
  displayValue: string,
  unit: MeasurementUnit,
): number | undefined {
  const value = Number(displayValue.replace(',', '.'));
  if (!(value > 0) || !Number.isFinite(value)) return undefined;
  return Math.round(value * (unit === 'in' ? 25.4 : 1));
}

export function MeasurementUnitSwitch() {
  const { unit, setUnit } = useMeasurementUnit();
  return (
    <ViewSwitch<MeasurementUnit>
      value={unit}
      options={UNIT_OPTIONS}
      onChange={setUnit}
      label='units'
      quiet
      className='shrink-0'
    />
  );
}
