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

/** Inside the phone keyboard bar (`data-mq-phone-dock`): its ‹ › hand focus on themselves. */
export function inPhoneMeasurementDockV1(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-mq-phone-dock]') !== null;
}

/**
 * Name of the measurement field holding focus while `enabled`. A move from one measurement field to
 * the next (the bar's ‹ ›, Tab) never passes through null, so the typing layout does not flicker.
 * Focus that drops to the page inside one tap (a touch the busy main thread could no longer keep
 * off the bar, a stray tap on the bar) and is back on a field before that task ends does not leave
 * the layout either: it leaves only when no field and not the bar holds focus once the task is over.
 */
export function usePhoneMeasurementTyping(enabled: boolean): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setName(null);
      return;
    }
    let leave = 0;
    const stay = () => {
      window.clearTimeout(leave);
      leave = 0;
    };
    setName(measurementNameOfV1(document.activeElement));
    const onIn = (event: FocusEvent) => {
      if (inPhoneMeasurementDockV1(event.target)) return;
      stay();
      setName(measurementNameOfV1(event.target));
    };
    const onOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (measurementNameOfV1(next) || inPhoneMeasurementDockV1(next)) return;
      stay();
      leave = window.setTimeout(() => {
        leave = 0;
        const active = document.activeElement;
        if (!measurementNameOfV1(active) && !inPhoneMeasurementDockV1(active)) setName(null);
      }, 0);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      stay();
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
