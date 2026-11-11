import { type RefObject, useEffect, useRef, useState } from 'react';

/** Wheel travel that makes one step, px. */
const WHEEL_STEP = 50;
/** The least time between two steps, ms: one item settles before the next goes. */
const STEP_MS = 130;

/**
 * A COLUMN THAT SCROLLS BY ITSELF, IN STEPS, THEN FREELY (the Taskboard system).
 *
 * First in steps: the wheel (a finger, PageUp / PageDown) moves a counter `at`, and the holder
 * renders the first `at` items in their MINIMAL state — heights move on the soft ease, so the
 * column glides, and no scroll position fights a height that is changing under it. A step forward
 * happens only while something is still cut off at the bottom.
 *
 * When every item is minimal (`at === count`) and the list is still longer than the column, the
 * steps are over: `free` is true and the holder lets the list scroll the ordinary way
 * (`overflow-y: auto`). Scrolling back up to its top returns to the steps.
 *
 * Put `list` on the scrolling element: `overflow: hidden` while stepping, `auto` while `free`.
 */
export function useStepScroll(count: number) {
  const list = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const at = Math.min(step, count);
  const free = count > 0 && at >= count;
  const live = useRef({ at, count, free });
  live.current = { at, count, free };
  useEffect(() => {
    const node = list.current;
    if (!node) return undefined;
    let travel = 0;
    let last = 0;
    const go = (dir: 1 | -1) => {
      const now = performance.now();
      if (now - last < STEP_MS) return false;
      const { at: from, count: end } = live.current;
      if (dir > 0 && (from >= end || node.scrollHeight <= node.clientHeight + 1)) return false;
      if (dir < 0 && from <= 0) return false;
      last = now;
      setStep(from + dir);
      return true;
    };
    /** In the free scroll the list moves by itself; only its top hands back to the steps. */
    const native = (dir: number) =>
      live.current.free &&
      node.scrollHeight > node.clientHeight + 1 &&
      (dir > 0 || node.scrollTop > 0);
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      if (native(e.deltaY)) return;
      e.preventDefault();
      travel += e.deltaY;
      if (Math.abs(travel) < WHEEL_STEP) return;
      go(travel > 0 ? 1 : -1);
      travel = 0;
    };
    let touch: number | null = null;
    const touchStart = (e: TouchEvent) => {
      touch = e.touches[0]?.clientY ?? null;
    };
    const touchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touch == null || y == null) return;
      const dy = touch - y;
      if (native(dy)) return;
      if (Math.abs(dy) < WHEEL_STEP) return;
      if (go(dy > 0 ? 1 : -1)) touch = y;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'PageDown' && e.key !== 'PageUp') return;
      if (native(e.key === 'PageDown' ? 1 : -1)) return;
      e.preventDefault();
      go(e.key === 'PageDown' ? 1 : -1);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    node.addEventListener('touchstart', touchStart, { passive: true });
    node.addEventListener('touchmove', touchMove, { passive: true });
    node.addEventListener('keydown', key);
    return () => {
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('touchstart', touchStart);
      node.removeEventListener('touchmove', touchMove);
      node.removeEventListener('keydown', key);
    };
  }, []);
  // Leaving the free scroll: the list goes back to its top with the items.
  useEffect(() => {
    if (!free && list.current) list.current.scrollTop = 0;
  }, [free]);
  return { list, at, free };
}

/**
 * A HORIZONTAL WHEEL / TRACKPAD SWIPE OVER A BOARD STEPS IT — one gesture, one step, the same step
 * its arrows make; the rest of the gesture's momentum is let go. Vertical wheels pass through.
 */
export function useStepWheel(node: RefObject<HTMLElement | null>, onStep: (dir: 1 | -1) => void) {
  const step = useRef(onStep);
  step.current = onStep;
  useEffect(() => {
    const el = node.current;
    if (!el) return undefined;
    let travel = 0;
    let last = 0;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      travel += e.deltaX;
      if (Math.abs(travel) < WHEEL_STEP) return;
      const now = performance.now();
      const dir = travel > 0 ? 1 : -1;
      travel = 0;
      if (now - last < 500) return;
      last = now;
      step.current(dir);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [node]);
}

/**
 * PRESS AND HOLD — the drag state of a tile. `press(id)` on pointer down; after `ms` without a
 * release `held` becomes that id (the holder starts its compression, lifts the tile); any pointer
 * up or cancel lets it go.
 */
export function usePressHold<T>(ms = 180) {
  const [held, setHeld] = useState<T | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const press = (id: T | null) => {
    window.clearTimeout(timer.current);
    if (id == null) return setHeld(null);
    timer.current = window.setTimeout(() => setHeld(id), ms);
  };
  useEffect(() => {
    const release = () => {
      window.clearTimeout(timer.current);
      setHeld(null);
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    return () => {
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.clearTimeout(timer.current);
    };
  }, []);
  return { held, press };
}
