// STOPFIX: the one-component React stand-in (react-hook-shim.ts) WITH effects — the wizard hook's
// drive (auto-advance) is an effect, and the stop probe needs the real one. State and refs by call
// order, a re-render batched to the end of the microtask; an effect runs after the render that
// changed its deps, as a macrotask (React's passive effects), its cleanup before it runs again.
// Nothing unmounts. Used only by stopfix.mjs (the other probes keep the effect-less shim).
let slots: unknown[] = [];
let at = 0;
let scheduled = false;
let render: (() => void) | null = null;
let pending: (() => void)[] = [];

type Eff = { deps?: readonly unknown[]; cleanup?: void | (() => void) };

/** The effects of the last render not run yet — flushed before the next render, as React does. */
let due: (() => void)[] = [];
const flush = () => {
  const run = due;
  due = [];
  run.forEach((f) => f());
};

export function mountHook(fn: () => void) {
  slots = [];
  due = [];
  render = () => {
    // React runs a render's passive effects before it commits the next one: an effect never
    // runs with the closure of a render that a newer one has replaced
    flush();
    at = 0;
    pending = [];
    fn();
    due = pending;
    pending = [];
    if (due.length) setTimeout(flush, 0);
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

export function useEffect(f: () => void | (() => void), deps?: readonly unknown[]) {
  const i = at++;
  const prev = slots[i] as Eff | undefined;
  const changed =
    !prev ||
    !deps ||
    !prev.deps ||
    deps.length !== prev.deps.length ||
    deps.some((d, k) => !Object.is(d, prev.deps![k]));
  if (!prev) slots[i] = {} as Eff;
  if (!changed) return;
  const e = slots[i] as Eff;
  e.deps = deps;
  pending.push(() => {
    if (typeof e.cleanup === 'function') e.cleanup();
    e.cleanup = f();
  });
}

export default { useState, useRef, useMemo, useCallback, useEffect };
