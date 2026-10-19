// STOPFIX: the one-component React stand-in (react-hook-shim.ts) WITH effects — the wizard hook's
// drive (auto-advance) is an effect, and the stop probe needs the real one. State and refs by call
// order, a re-render batched to the end of the microtask; an effect runs after the render that
// changed its deps, as a macrotask (React's passive effects), its cleanup before it runs again, and
// a render's effects are flushed before the next render of the same component (as React does).
// Each `mountHook` is its own component: several can live side by side (a baseline and a stopped
// run compared). Nothing unmounts. Used only by stopfix.mjs.
type Eff = { deps?: readonly unknown[]; cleanup?: void | (() => void) };
type Inst = {
  slots: unknown[];
  at: number;
  scheduled: boolean;
  pending: (() => void)[];
  due: (() => void)[];
  render: () => void;
};

/** The component being rendered (hooks read their slots from it). */
let cur: Inst | null = null;
let last: Inst | null = null;

const flush = (i: Inst) => {
  const run = i.due;
  i.due = [];
  run.forEach((f) => f());
};

export function mountHook(fn: () => void) {
  const inst: Inst = {
    slots: [],
    at: 0,
    scheduled: false,
    pending: [],
    due: [],
    render: () => {
      flush(inst);
      const prev = cur;
      cur = inst;
      inst.at = 0;
      inst.pending = [];
      try {
        fn();
      } finally {
        cur = prev;
      }
      inst.due = inst.pending;
      inst.pending = [];
      if (inst.due.length) setTimeout(() => flush(inst), 0);
    },
  };
  last = inst;
  inst.render();
}

/** Render the last mounted component now. */
export function rerender() {
  last?.render();
}

const me = (): Inst => {
  if (!cur) throw new Error('a hook called outside a render');
  return cur;
};

export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  const inst = me();
  const i = inst.at++;
  if (inst.slots.length <= i)
    inst.slots[i] = typeof init === 'function' ? (init as () => T)() : init;
  const set = (v: T | ((p: T) => T)) => {
    inst.slots[i] = typeof v === 'function' ? (v as (p: T) => T)(inst.slots[i] as T) : v;
    if (inst.scheduled) return;
    inst.scheduled = true;
    queueMicrotask(() => {
      inst.scheduled = false;
      inst.render();
    });
  };
  return [inst.slots[i] as T, set];
}

export function useRef<T>(init: T): { current: T } {
  const inst = me();
  const i = inst.at++;
  if (inst.slots.length <= i) inst.slots[i] = { current: init };
  return inst.slots[i] as { current: T };
}

export function useMemo<T>(f: () => T): T {
  me().at++;
  return f();
}

export function useCallback<T>(f: T): T {
  me().at++;
  return f;
}

export function useEffect(f: () => void | (() => void), deps?: readonly unknown[]) {
  const inst = me();
  const i = inst.at++;
  const prev = inst.slots[i] as Eff | undefined;
  const changed =
    !prev ||
    !deps ||
    !prev.deps ||
    deps.length !== prev.deps.length ||
    deps.some((d, k) => !Object.is(d, prev.deps![k]));
  if (!prev) inst.slots[i] = {} as Eff;
  if (!changed) return;
  const e = inst.slots[i] as Eff;
  e.deps = deps;
  inst.pending.push(() => {
    if (typeof e.cleanup === 'function') e.cleanup();
    e.cleanup = f();
  });
}

export default { useState, useRef, useMemo, useCallback, useEffect };
