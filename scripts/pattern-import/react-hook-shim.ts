// A one-component React stand-in for the answers probe (answers.mjs aliases 'react' to this file).
// It runs ONE hook function the way React would for a single mounted component: state and refs by
// call order, a re-render after state changes (batched to the end of the microtask, like React 18
// automatic batching), memos recomputed on every render, effects never run (nothing unmounts).
let slots: unknown[] = [];
let at = 0;
let scheduled = false;
let render: (() => void) | null = null;

export function mountHook(fn: () => void) {
  slots = [];
  render = () => {
    at = 0;
    fn();
  };
  render();
}

/** Render now (after an awaited transition, so the refs read the latest state). */
export function rerender() {
  render?.();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    render?.();
  });
}

export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  const i = at++;
  if (slots.length <= i) slots[i] = typeof init === 'function' ? (init as () => T)() : init;
  const set = (v: T | ((p: T) => T)) => {
    slots[i] = typeof v === 'function' ? (v as (p: T) => T)(slots[i] as T) : v;
    schedule();
  };
  return [slots[i] as T, set];
}

export function useRef<T>(init: T): { current: T } {
  const i = at++;
  if (slots.length <= i) slots[i] = { current: init };
  return slots[i] as { current: T };
}

export function useMemo<T>(f: () => T): T {
  at++;
  return f();
}

export function useCallback<T>(f: T): T {
  at++;
  return f;
}

export function useEffect() {
  at++;
}

export default { useState, useRef, useMemo, useCallback, useEffect };
