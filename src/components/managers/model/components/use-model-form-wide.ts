import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Desktop pair layout of the model form: the body preview sticks on the left and the measurements
// show one group at a time on the right. Tailwind `xl` — at 1280 the form is ~1210 px wide, the
// width the approved mockup was drawn at. Below it the form stays stacked as before.
export const MODEL_FORM_WIDE_QUERY = '(min-width: 1280px)';

// Phone layout (approved variant C): the mannequin on top of one measurement group; while a field
// is typed the mannequin fills the visible screen and one bar sits right above the keyboard. The
// same breakpoint as `useTypingOnPhone` and the guided default (below Tailwind `md`).
export const MODEL_FORM_PHONE_QUERY = '(max-width: 767px)';

function matchQuery(query: string) {
  return typeof window === 'undefined' ? undefined : window.matchMedia?.(query);
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchQuery(query);
      if (!list) return () => undefined;
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => !!matchQuery(query)?.matches,
    () => false,
  );
}

export function useModelFormWide(): boolean {
  return useMediaQuery(MODEL_FORM_WIDE_QUERY);
}

export function useModelFormPhone(): boolean {
  return useMediaQuery(MODEL_FORM_PHONE_QUERY);
}

/** The measurement field typed on the phone form, or null. */
export function measurementNameOfV1(target: EventTarget | null): string | null {
  return target instanceof HTMLInputElement && target.dataset.modelMeasurement
    ? target.dataset.modelMeasurement
    : null;
}

/**
 * Name of the measurement field holding focus while `enabled`. A move from one measurement field to
 * the next (the bar's ‹ ›, Tab) never passes through null, so the typing layout does not flicker.
 */
export function usePhoneMeasurementTyping(enabled: boolean): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setName(null);
      return;
    }
    setName(measurementNameOfV1(document.activeElement));
    const onIn = (event: FocusEvent) => setName(measurementNameOfV1(event.target));
    const onOut = (event: FocusEvent) => {
      if (!measurementNameOfV1(event.relatedTarget)) setName(null);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, [enabled]);

  return enabled ? name : null;
}

/**
 * iOS opens the keyboard by shrinking only the VISIBLE viewport and scrolling it inside the layout
 * one, so `fixed; bottom: 0` lands under the keyboard and `fixed; top: 0` drifts off the screen.
 * While `active`, `place` gets the visible viewport on every resize/scroll and writes it straight to
 * the DOM (no React render per frame).
 */
export function useVisualViewportPin(
  active: boolean,
  place: (frame: { top: number; height: number }) => void,
) {
  const placeRef = useRef(place);
  placeRef.current = place;

  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const update = () =>
      placeRef.current(
        vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight },
      );
    update();
    const target: VisualViewport | Window = vv ?? window;
    target.addEventListener('resize', update);
    target.addEventListener('scroll', update);
    return () => {
      target.removeEventListener('resize', update);
      target.removeEventListener('scroll', update);
    };
  }, [active]);
}
