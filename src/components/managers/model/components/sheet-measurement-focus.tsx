import { cn } from 'lib/utility';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Text } from 'ui';
import { MeasurementPictogram } from './measurement-pictograms';
import { BODY_MEASUREMENT_GROUPS } from './measurements';
import { ModelFormData } from './schema';
import { displayMeasurementValue, useMeasurementUnit } from './units';

export const MODEL_MEASUREMENTS = BODY_MEASUREMENT_GROUPS.flatMap((group) => group.measurements);

const LABEL_BY_NAME = new Map(
  MODEL_MEASUREMENTS.map((measurement) => [measurement.name as string, measurement.label]),
);
const GROUP_BY_NAME = new Map(
  BODY_MEASUREMENT_GROUPS.flatMap((group) =>
    group.measurements.map((measurement) => [measurement.name as string, group.title] as const),
  ),
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
    () => ({ active: hover ?? focus, focused, setFocus, setFocused, setHover }),
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

function useMeasurements() {
  const { control } = useFormContext<ModelFormData>();
  return (useWatch({ control, name: 'measurements' }) ?? {}) as Record<string, number | undefined>;
}

export function SheetMeasurementDiagram({ className }: { className?: string }) {
  const { active } = useSheetMeasurementFocus();
  const { unit } = useMeasurementUnit();
  const measurements = useMeasurements();
  const shown = displayMeasurementValue(measurements[active], unit);

  return (
    <div className={cn('flex flex-col items-center justify-center gap-1.5', className)}>
      <MeasurementPictogram measurementName={active} className='h-40 w-28' />
      <Text className='text-center leading-tight'>{measurementLabel(active)}</Text>
      <Text size='stat' className={cn('tabular-nums', !shown && 'text-highlightColor')}>
        {shown ? `${shown} ${unit}` : 'empty'}
      </Text>
    </div>
  );
}

// Phone hint while a measurement is typed. iOS opens the keyboard by shrinking only the VISIBLE
// viewport and scrolling it inside the layout one, so a `sticky`/`fixed; top` strip drifts off the
// top of the screen. The strip is pinned to `visualViewport.offsetTop` instead, written straight to
// the node on every resize/scroll (as the note format bar does), and the focused field is scrolled
// clear of it.
export const MOBILE_STRIP_PX = 80;

export function SheetMeasurementMobileStrip() {
  const { focused } = useSheetMeasurementFocus();
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const node = strip.current;
    if (!focused || !vv || !node) return;
    const place = () => {
      node.style.top = `${vv.offsetTop}px`;
    };
    place();
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
    return () => {
      vv.removeEventListener('resize', place);
      vv.removeEventListener('scroll', place);
    };
  }, [focused]);

  if (!focused) return null;

  return (
    <div
      ref={strip}
      style={{ height: MOBILE_STRIP_PX }}
      className='fixed inset-x-0 top-0 z-[calc(var(--z-nav)+1)] flex items-center gap-3 border-b border-borderColor bg-bgColor px-4 md:hidden'
    >
      <MeasurementPictogram measurementName={focused} className='h-16 w-11 shrink-0' />
      <div className='min-w-0'>
        <Text className='truncate text-textColor'>{measurementLabel(focused)}</Text>
        <Text size='micro' variant='label' className='uppercase'>
          {shortMeasurementGroup(GROUP_BY_NAME.get(focused) ?? '')}
        </Text>
      </div>
    </div>
  );
}
