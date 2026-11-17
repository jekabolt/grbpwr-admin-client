import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { BODY_MEASUREMENT_GROUPS } from './measurements';

export const MODEL_MEASUREMENTS = BODY_MEASUREMENT_GROUPS.flatMap((group) => group.measurements);

const LABEL_BY_NAME = new Map(
  MODEL_MEASUREMENTS.map((measurement) => [measurement.name as string, measurement.label]),
);

export function shortMeasurementGroup(title: string): string {
  if (title === 'vertical / lengths') return 'vertical';
  if (title === 'widths (front / back)') return 'widths';
  return title;
}

export function measurementLabel(name: string): string {
  return LABEL_BY_NAME.get(name) ?? name;
}

type SheetMeasurementFocus = {
  active: string;
  /** Committed field selection. Unlike `active`, transient row hover never changes this value. */
  selected: string;
  focused: string | null;
  setFocus: (name: string) => void;
  setFocused: (name: string | null) => void;
  setHover: (name: string | null) => void;
};

const SheetMeasurementFocusContext = createContext<SheetMeasurementFocus | null>(null);

export function SheetMeasurementFocusProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<string>(MODEL_MEASUREMENTS[0]?.name ?? '');
  const [focused, setFocused] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const value = useMemo(
    () => ({ active: hover ?? focus, selected: focus, focused, setFocus, setFocused, setHover }),
    [focus, focused, hover],
  );

  return (
    <SheetMeasurementFocusContext.Provider value={value}>
      {children}
    </SheetMeasurementFocusContext.Provider>
  );
}

export function useSheetMeasurementFocus() {
  const value = useContext(SheetMeasurementFocusContext);
  if (!value) throw new Error('no SheetMeasurementFocusProvider');
  return value;
}
